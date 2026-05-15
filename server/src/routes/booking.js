/**
 * Route quản lý đặt sân (Booking) - Tạo đơn, Xem đơn, Hủy, Check-in/out, QR Code.
 *
 * File này cung cấp API đặt sân cho cả user và admin:
 *
 * == API cho User (cần authenticate) ==
 * 1. POST / - Tạo đơn đặt sân mới (có transaction, kiểm tra xung đột, tính giá, loyalty rewards)
 * 2. GET /my - Lấy danh sách đơn của user hiện tại (phân trang, lọc trạng thái, kèm dịch vụ)
 * 3. GET /:id - Xem chi tiết 1 đơn (kèm thông tin sân, khung giờ, dịch vụ, thanh toán)
 * 4. POST /:id/cancel - Hủy đơn (kiểm tra quy tắc 3 tiếng trước giờ chơi)
 * 5. GET /:id/qr - Tạo mã QR cho đơn (dùng để check-in)
 *
 * == API cho Admin (cần authenticate + quyền admin) ==
 * 6. GET / - Lấy tất cả đơn trong hệ thống (phân trang, lọc trạng thái/ngày/sân)
 * 7. POST /:id/checkin - Check-in cho khách (đổi trạng thái -> Đang sử dụng)
 * 8. POST /:id/checkout - Check-out cho khách (đổi trạng thái -> Hoàn thành)
 * 9. POST /:id/noshow - Đánh dấu khách vắng mặt (đổi trạng thái -> Đã hủy, ghi chú No-show)
 */

const express = require('express');
const { pool } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

/**
 * POST /bookings - Tạo đơn đặt sân mới (có transaction để đảm bảo tính toàn vẹn dữ liệu).
 *
 * Body: { sanId, ngayChoi, khungGioIds (mảng), dichVu?, loaiThanhToan?, isAutoBooking?, phuongThuc?, maGiamGia? }
 * - sanId: ID sân muốn đặt
 * - ngayChoi: ngày chơi (YYYY-MM-DD)
 * - khungGioIds: mảng các ID khung giờ muốn đặt (có thể đặt nhiều khung giờ cùng lúc)
 * - dichVu: mảng [{ dichVuId, soLuong }] các dịch vụ đi kèm
 * - phuongThuc: 'cash' (tiền mặt) | 'transfer' (chuyển khoản) | 'momo' | 'visa'
 * - maGiamGia: mã giảm giá nếu có
 * - isAutoBooking: true nếu là đơn tự động cho VIP
 *
 * Quy trình xử lý (tất cả trong 1 TRANSACTION):
 * 1. Kiểm tra sân tồn tại và khả dụng (Sẵn sàng/Active, không phải Bảo trì)
 * 2. Kiểm tra xung đột: khung giờ đã có người đặt chưa (trừ trạng thái 'Đã hủy')
 * 3. Kiểm tra thời gian: không cho đặt ngày quá khứ hoặc khung giờ đã qua ngưỡng cho phép
 *    - Ngưỡng cho phép: BOOKING_LOCK_THRESHOLD_MINS (mặc định 15 phút sau giờ bắt đầu)
 * 4. Tính giá: giá sân (từ timeslots) + giá dịch vụ (từ services) = subTotal
 * 5. Áp dụng mã giảm giá nếu có: kiểm tra hợp lệ, tính discountAmount, cập nhật số lượt dùng
 * 6. Tạo booking cho từng khung giờ (mỗi khung giờ 1 bản ghi), phân bổ giá và discount đều
 *    - Nếu phuongThuc = 'cash': trạng thái 'Đã đặt'
 *    - Các phương thức khác: trạng thái 'Đã thanh toán'
 * 7. Tạo payment record tương ứng
 * 8. Gán dịch vụ vào booking đầu tiên, trừ kho dịch vụ
 * 9. Gửi thông báo xác nhận đặt sân thành công
 * 10. Kiểm tra xung đột với VIP auto-booking: nếu có VIP đã auto-book khung giờ này
 *     từ 7 ngày trước, gửi thông báo và tắt auto-booking của VIP đó
 * 11. Nếu user tự bật auto-booking -> gửi thông báo lịch sẽ tự động đặt tuần sau
 * 12. Loyalty Rewards: mỗi 3 đơn (không tính đã hủy) -> tặng 1 mã giảm giá 10%
 *
 * Response: 201 { data: { bookingIds: [...], totalPrice } }
 * Yêu cầu: authenticate
 */
router.post('/', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const { sanId, ngayChoi, khungGioIds, dichVu, loaiThanhToan, isAutoBooking, phuongThuc, maGiamGia } = req.body;
    if (!sanId || !ngayChoi || !khungGioIds || khungGioIds.length === 0) {
      return res.status(400).json({ error: 'Vui lòng chọn sân và khung giờ' });
    }
    // Bắt đầu transaction - mọi thay đổi chỉ được lưu khi COMMIT thành công
    await client.query('BEGIN');

    // Kiểm tra trạng thái sân: phải là Sẵn sàng/Active mới cho đặt
    const courtCheck = await client.query('SELECT trangThai FROM courts WHERE id = $1', [sanId]);
    if (courtCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Không tìm thấy sân' });
    }

    const courtRow = courtCheck.rows[0];
    // FIELD_MAP có thể map trangThai -> trangthai, nên kiểm tra cả 2
    const courtStatus = courtRow.trangThai || courtRow.trangthai;
    const isAvailable = courtStatus === 'Sẵn sàng' || courtStatus === 'Active' || courtStatus === 'active' || courtStatus === 'Ready';

    // Chặn đặt sân đang bảo trì
    if (courtStatus === 'Bảo trì' || courtStatus === 'maintenance' || courtStatus === 'inactive') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Sân này hiện đang bảo trì, không thể đặt lịch.' });
    }

    if (!isAvailable) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Sân này hiện không khả dụng để đặt' });
    }

    // Kiểm tra xung đột khung giờ: cùng sân, cùng ngày, cùng khung giờ, không phải Đã hủy
    const conflictCheck = await client.query(
      "SELECT id FROM bookings WHERE sanId = $1 AND ngayChoi = $2 AND khungGioId = ANY($3) AND trangThai NOT IN ('Đã hủy')",
      [sanId, ngayChoi, khungGioIds]
    );
    if (conflictCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Khung giờ này vừa có người đặt. Vui lòng chọn giờ khác' });
    }

    // Kiểm tra thời gian: không cho đặt ngày đã qua hoặc khung giờ đã quá ngưỡng
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const currentTimeStr = now.toTimeString().slice(0, 5);

    if (ngayChoi < todayStr) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Không thể đặt lịch cho ngày đã qua' });
    }

    // Nếu đặt cho hôm nay: kiểm tra từng khung giờ không bị quá hạn
    if (ngayChoi === todayStr) {
      const thresholdMins = parseInt(process.env.BOOKING_LOCK_THRESHOLD_MINS) || 15;
      const [nowH, nowM] = currentTimeStr.split(':').map(Number);
      const nowTotalMins = nowH * 60 + nowM;

      for (const slotId of khungGioIds) {
        const slotRes = await client.query('SELECT gioBatDau, gioKetThuc FROM timeslots WHERE id = $1', [slotId]);
        if (slotRes.rows.length > 0) {
          const slot = slotRes.rows[0];
          // FIELD_MAP có thể map tên cột về lowercase
          const gioBatDau = slot.gioBatDau || slot.giobatdau || '00:00';
          const gioKetThuc = slot.gioKetThuc || slot.gioketthuc || '00:00';
          const [startH, startM] = gioBatDau.split(':').map(Number);
          const startTotalMins = startH * 60 + startM;

          // Khóa nếu đã quá ngưỡng (vd: 15 phút sau giờ bắt đầu) hoặc giờ kết thúc đã qua
          if (nowTotalMins >= startTotalMins + thresholdMins || gioKetThuc <= currentTimeStr) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Khung giờ này đã quá thời gian cho phép đặt' });
          }
        }
      }
    }

    // Tính tổng giá sân từ tất cả khung giờ đã chọn
    let courtPrice = 0;
    for (const slotId of khungGioIds) {
      const slotResult = await client.query('SELECT mucGia, mucgia FROM timeslots WHERE id = $1', [slotId]);
      if (slotResult.rows.length > 0) {
        const slot = slotResult.rows[0];
        courtPrice += parseFloat(slot.mucGia || slot.mucgia) || 0;
      }
    }

    // Tính tổng giá dịch vụ đi kèm
    let servicesPrice = 0;
    if (dichVu && dichVu.length > 0) {
      for (const d of dichVu) {
        const svcResult = await client.query('SELECT donGia, dongia FROM services WHERE id = $1', [d.dichVuId]);
        if (svcResult.rows.length > 0) {
          const svc = svcResult.rows[0];
          servicesPrice += (parseFloat(svc.donGia || svc.dongia) || 0) * (d.soLuong || 1);
        }
      }
    }

    let subTotal = courtPrice + servicesPrice;
    let discountAmount = 0;
    let appliedCode = null;

    // Xử lý mã giảm giá nếu có
    if (maGiamGia) {
      const discResult = await client.query(
        `SELECT * FROM discounts WHERE code = $1 AND trangThai = 'Active'
         AND (ngayBatDau IS NULL OR ngayBatDau <= NOW())
         AND (ngayKetThuc IS NULL OR ngayKetThuc >= NOW())
         AND (soLuongBanDau = 0 OR soLuongDaDung < soLuongBanDau)`,
        [maGiamGia]
      );
      if (discResult.rows.length > 0) {
        const disc = discResult.rows[0];
        appliedCode = disc.code || disc.CODE;
        const loai = disc.loaiGiamGia || disc.loaigiamgia;
        const muc = Number(disc.mucGiamGia || disc.mucgiamgia || 0);

        // Tính số tiền giảm: percentage = % trên tổng, fixed = giảm thẳng
        if (loai === 'percentage') {
          discountAmount = Math.round(subTotal * muc / 100);
        } else {
          discountAmount = Math.min(muc, subTotal);
        }
        const discId = disc.id || disc.ID;
        // Cập nhật số lượt đã dùng của mã giảm giá
        await client.query('UPDATE discounts SET soLuongDaDung = soLuongDaDung + 1 WHERE id = $1', [discId]);
      }
    }

    const totalPrice = subTotal - discountAmount;
    // Tỉ lệ discount so với tổng - dùng để phân bổ discount đều cho từng slot
    const discountRatio = subTotal > 0 ? totalPrice / subTotal : 1;

    // Tạo booking cho từng khung giờ - mỗi slot là 1 bản ghi riêng
    const bookingIds = [];
    const numSlots = khungGioIds.length;

    for (const slotId of khungGioIds) {
      // Lấy giá riêng của từng khung giờ
      const slotRes = await client.query('SELECT mucGia, mucgia FROM timeslots WHERE id = $1', [slotId]);
      const slotOriginalPrice = parseFloat(slotRes.rows[0].mucGia || slotRes.rows[0].mucgia) || 0;

      // Phân bổ giá dịch vụ đều cho các slot + tính discount tương ứng
      const slotShareOfServices = servicesPrice / numSlots;
      const originalPriceForThisSlot = slotOriginalPrice + slotShareOfServices;
      const discountForThisSlot = Math.round(originalPriceForThisSlot * (1 - discountRatio));
      const finalPriceForThisSlot = originalPriceForThisSlot - discountForThisSlot;

      // Xác định trạng thái booking dựa trên phương thức thanh toán
      const autoBook = isAutoBooking === true;
      const bookingStatus = phuongThuc === 'cash' ? 'Đã đặt' : 'Đã thanh toán';
      const booking = await client.query(
        `INSERT INTO bookings (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, giaGoc, tienGiam, trangThai, isAutoBooking, maGiamGia)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING id`,
        [req.user.id, sanId, slotId, ngayChoi, finalPriceForThisSlot, finalPriceForThisSlot, originalPriceForThisSlot, discountForThisSlot, bookingStatus, autoBook, appliedCode]
      );
      bookingIds.push(booking.rows[0].id);

      // Tạo bản ghi thanh toán (payment) cho từng booking
      await client.query(
        'INSERT INTO payments (donDatId, soTien, loaiThanhToan, trangThai) VALUES ($1, $2, $3, $4)',
        [booking.rows[0].id, finalPriceForThisSlot,
         `Full - ${phuongThuc === 'transfer' ? 'Chuyển khoản' : phuongThuc === 'momo' ? 'MoMo' : phuongThuc === 'visa' ? 'Visa/MC' : 'Tiền mặt'}`,
         phuongThuc === 'cash' ? 'Chờ thanh toán' : 'Chờ xác nhận']
      );
    }

    // Gán dịch vụ đi kèm vào booking đầu tiên, đồng thời trừ kho
    if (dichVu && dichVu.length > 0 && bookingIds.length > 0) {
      for (const d of dichVu) {
        const svc = await client.query('SELECT donGia, soLuongTon FROM services WHERE id = $1', [d.dichVuId]);
        if (svc.rows.length > 0) {
          const qty = d.soLuong || 1;
          const currentStock = parseInt(svc.rows[0].soLuongTon) || 0;
          // Trừ kho nếu còn hàng (không cho âm kho)
          if (currentStock > 0) {
            const newStock = Math.max(0, currentStock - qty);
            await client.query('UPDATE services SET soLuongTon = $1 WHERE id = $2', [newStock, d.dichVuId]);
          }
          await client.query(
            'INSERT INTO booking_services (donDatId, dichVuId, soLuong, tongTien) VALUES ($1, $2, $3, $4)',
            [bookingIds[0], d.dichVuId, qty, (parseFloat(svc.rows[0].donGia) || 0) * qty]
          );
        }
      }
    }

    // Gửi thông báo xác nhận đặt sân cho từng booking
    for (const bid of bookingIds) {
      await client.query(
        "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat) VALUES ($1, $2, $3, 'booking_confirmed', $4)",
        [req.user.id, 'Đặt sân thành công', `Đơn đặt sân #${bid} đã được xác nhận`, bid]
      );
    }

    // Kiểm tra xung đột với VIP auto-booking
    // Nếu 7 ngày trước có VIP đặt auto-booking cho khung giờ này -> nghĩa là VIP đó
    // kỳ vọng hôm nay cũng được tự động đặt, nhưng đã bị người khác đặt mất
    const bookingDate = new Date(ngayChoi);
    const prevWeekDate = new Date(bookingDate);
    prevWeekDate.setDate(prevWeekDate.getDate() - 7);
    const prevWeekStr = prevWeekDate.toISOString().slice(0, 10);

    for (const slotId of khungGioIds) {
      // Tìm VIP có auto-booking ON cho sân + khung giờ này đúng 7 ngày trước
      const vipConflicts = await client.query(
        `SELECT DISTINCT b.nguoiDungId, u.email
         FROM bookings b
         JOIN users u ON b.nguoiDungId = u.id
         WHERE b.sanId = $1 AND b.khungGioId = $2
         AND b.isAutoBooking = TRUE
         AND b.ngayChoi = $3
         AND b.nguoiDungId != $4
         AND b.trangThai NOT IN ('Đã hủy')`,
        [sanId, slotId, prevWeekStr, req.user.id]
      );

      for (const vip of vipConflicts.rows) {
        // Thông báo cho VIP biết khung giờ đã bị người khác đặt mất
        await client.query(
          "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao) VALUES ($1, $2, $3, 'vip_auto_conflict')",
          [vip.nguoiDungId, 'Xung đột lịch tự động',
           `Khung giờ tự động của bạn cho ngày ${ngayChoi} đã có người khác đặt trước. Tính năng tự động đặt lịch đã bị tắt cho khung giờ này.`]
        );
        // Tắt auto-booking cho VIP bị xung đột
        await client.query(
          "UPDATE bookings SET isAutoBooking = FALSE, updated_at = NOW() WHERE nguoiDungId = $1 AND sanId = $2 AND khungGioId = $3 AND ngayChoi = $4 AND isAutoBooking = TRUE",
          [vip.nguoiDungId, sanId, slotId, prevWeekStr]
        );
      }
    }

    // Tính ngày tuần sau để thông báo cho VIP
    const nextWeekDate = new Date(bookingDate);
    nextWeekDate.setDate(nextWeekDate.getDate() + 7);
    const nextWeekStr = nextWeekDate.toISOString().slice(0, 10);

    // Nếu user bật auto-booking: thông báo lịch sẽ được tự động đặt vào tuần sau
    if (isAutoBooking) {
      await client.query(
        "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao) VALUES ($1, $2, $3, 'vip_auto_enabled')",
        [req.user.id, 'Tự động đặt lịch đã bật',
         `Hệ thống sẽ tự động đặt lịch cho khung giờ này vào ngày ${nextWeekStr}. Nếu có xung đột, bạn sẽ được thông báo.`]
      );
    }

    // Loyalty Rewards: mỗi 3 đơn hoàn thành -> tặng 1 mã giảm giá 10%
    // Tính tổng số đơn trước khi tạo đơn mới (trừ các đơn đã hủy)
    const prevCountRes = await client.query("SELECT COUNT(*) as count FROM bookings WHERE nguoiDungId = $1 AND trangThai != 'Đã hủy' AND id NOT IN (" + bookingIds.join(',') + ")", [req.user.id]);
    const prevTotal = parseInt(prevCountRes.rows[0].count || 0);
    const newTotal = prevTotal + bookingIds.length;

    // So sánh số mốc 3 trước và sau khi tạo đơn mới
    const prevRewards = Math.floor(prevTotal / 3);
    const newRewards = Math.floor(newTotal / 3);

    // Nếu đạt mốc mới (vượt qua bội số của 3): tặng mã giảm giá
    if (newRewards > prevRewards) {
      for (let i = 0; i < (newRewards - prevRewards); i++) {
        const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
        const rewardCode = `LTY10-${randomStr}`;
        await client.query(
          `INSERT INTO discounts (code, noiDung, moTa, loaiGiamGia, mucGiamGia, ngayBatDau, ngayKetThuc, soLuongBanDau, soLuongDaDung, trangThai, nguoiDungId)
           VALUES ($1, 'Quà tặng đặt sân', 'Mã giảm giá 10% tri ân mỗi 3 đơn đặt sân', 'percentage', 10, NOW(), '2026-12-31', 1, 0, 'Active', $2)`,
          [rewardCode, req.user.id]
        );

        // Gửi thông báo tặng quà tri ân
        await client.query(
          "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao) VALUES ($1, $2, $3, 'promotion')",
          [req.user.id, 'Quà tặng tri ân!', `Bạn vừa đạt mốc ${newRewards * 3} đơn đặt sân! Hệ thống tặng bạn mã giảm giá 10% tri ân: ${rewardCode}`]
        );
      }
    }

    // Commit transaction - lưu tất cả thay đổi vào DB
    await client.query('COMMIT');
    res.status(201).json({ data: { bookingIds, totalPrice } });
  } catch (err) {
    // Nếu có lỗi: ROLLBACK toàn bộ transaction
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

/**
 * GET /bookings/my - Lấy danh sách đơn đặt sân của user hiện tại.
 *
 * Query params:
 * - page: số trang (mặc định 1)
 * - limit: số lượng mỗi trang (mặc định 50)
 * - status: lọc theo trạng thái (vd: 'Đã thanh toán', 'Đã hủy', 'Hoàn thành'...)
 *
 * Trả về: { data: [...bookings] }
 * Mỗi booking có đầy đủ thông tin:
 * - Thông tin sân (tenSan), khung giờ (gioBatDau, gioKetThuc), phương thức thanh toán
 * - Kèm danh sách dịch vụ đi kèm (dichVu: [{ tenDichVu, soLuong, tongTien }])
 *
 * Yêu cầu: authenticate
 */
router.get('/my', authenticate, async (req, res, next) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const offset = (page - 1) * limit;
    let query = `
      SELECT b.*, c.tenSan, t.gioBatDau, t.gioKetThuc, p.loaiThanhToan
      FROM bookings b
      JOIN courts c ON b.sanId = c.id
      JOIN timeslots t ON b.khungGioId = t.id
      LEFT JOIN (
        SELECT DISTINCT ON (donDatId) donDatId, loaiThanhToan
        FROM payments
        ORDER BY donDatId, id DESC
      ) p ON b.id = p.donDatId
      WHERE b.nguoiDungId = $1`;
    const params = [req.user.id];
    let idx = 2;
    if (status) { query += ` AND b.trangThai = $${idx}`; params.push(status); idx++; }
    query += ' ORDER BY b.created_at DESC';
    query += ` LIMIT $${idx} OFFSET $${idx + 1}`; params.push(limit, offset);

    const result = await pool.query(query, params);
    // Lấy thêm dịch vụ cho từng booking
    const bookings = [];
    for (const b of result.rows) {
      const svcs = await pool.query(
        'SELECT bs.*, s.tenDichVu FROM booking_services bs JOIN services s ON bs.dichVuId = s.id WHERE bs.donDatId = $1',
        [b.id]
      );
      bookings.push({ ...b, dichVu: svcs.rows });
    }
    res.json({ data: bookings });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /bookings - Lấy tất cả đơn đặt sân trong hệ thống (Admin only).
 *
 * Query params:
 * - page: số trang (mặc định 1)
 * - limit: số lượng mỗi trang (mặc định 100)
 * - status: lọc theo trạng thái
 * - date: lọc theo ngày chơi (YYYY-MM-DD)
 * - court: lọc theo ID sân
 *
 * Trả về: { data: [...bookings] } với đầy đủ thông tin user, sân, khung giờ, thanh toán
 *
 * Yêu cầu: authenticate + quyền admin (kiểm tra thủ công trong hàm)
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 100, status, date, court } = req.query;
    // Kiểm tra quyền admin thủ công (không dùng middleware requireAdmin để có thông báo lỗi tiếng Việt)
    if (req.user.role !== 'admin' && req.user.role !== 'Admin' && req.user.vaiTro !== 'Admin') {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const offset = (page - 1) * limit;
    let query = `
      SELECT b.*, c.tenSan, t.gioBatDau, t.gioKetThuc, u.hoTen as full_name, u.email, p.loaiThanhToan
      FROM bookings b
      JOIN courts c ON b.sanId = c.id
      JOIN timeslots t ON b.khungGioId = t.id
      JOIN users u ON b.nguoiDungId = u.id
      LEFT JOIN (
        SELECT DISTINCT ON (donDatId) donDatId, loaiThanhToan
        FROM payments
        ORDER BY donDatId, id DESC
      ) p ON b.id = p.donDatId
      WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (status) { query += ` AND b.trangThai = $${idx}`; params.push(status); idx++; }
    if (date) { query += ` AND b.ngayChoi = $${idx}`; params.push(date); idx++; }
    if (court) { query += ` AND b.sanId = $${idx}`; params.push(court); idx++; }
    query += ' ORDER BY b.created_at DESC';
    query += ` LIMIT $${idx} OFFSET $${idx + 1}`; params.push(limit, offset);

    const result = await pool.query(query, params);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /bookings/:id - Xem chi tiết 1 đơn đặt sân.
 *
 * Trả về: { data: { ...booking, dichVu: [...] } }
 * Bao gồm:
 * - Thông tin đơn: id, trạng thái, tổng tiền, tiền cọc, ngày chơi...
 * - Thông tin sân: tenSan
 * - Thông tin khung giờ: gioBatDau, gioKetThuc
 * - Thông tin người đặt: full_name
 * - Phương thức thanh toán (từ bảng payments)
 * - Danh sách dịch vụ đi kèm: [{ tenDichVu, soLuong, tongTien }]
 *
 * Yêu cầu: authenticate
 */
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, c.tenSan, t.gioBatDau, t.gioKetThuc, u.hoTen as full_name, p.loaiThanhToan
       FROM bookings b
       JOIN courts c ON b.sanId = c.id
       JOIN timeslots t ON b.khungGioId = t.id
       JOIN users u ON b.nguoiDungId = u.id
       LEFT JOIN (
         SELECT DISTINCT ON (donDatId) donDatId, loaiThanhToan
         FROM payments
         ORDER BY donDatId, id DESC
       ) p ON b.id = p.donDatId
       WHERE b.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    const booking = result.rows[0];
    // Lấy thêm danh sách dịch vụ đi kèm
    const svcs = await pool.query(
      'SELECT bs.*, s.tenDichVu FROM booking_services bs JOIN services s ON bs.dichVuId = s.id WHERE bs.donDatId = $1',
      [booking.id]
    );
    res.json({ data: { ...booking, dichVu: svcs.rows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /bookings/:id/cancel - Hủy đơn đặt sân.
 *
 * Quy tắc hủy:
 * 1. Chỉ user sở hữu đơn mới được hủy (kiểm tra nguoiDungId)
 * 2. Chỉ hủy được đơn ở trạng thái 'Đã thanh toán' hoặc 'Đã đặt'
 * 3. Quy tắc 3 tiếng: phải hủy trước giờ bắt đầu ít nhất 3 tiếng
 *    - Nếu còn dưới 3 tiếng -> không cho hủy
 *
 * Sau khi hủy:
 * - Cập nhật trạng thái -> 'Đã hủy'
 * - Gửi thông báo hủy thành công cho user
 *
 * Response: { message: 'Hủy đặt sân thành công.' }
 * Yêu cầu: authenticate
 */
router.post('/:id/cancel', authenticate, async (req, res) => {
  try {
    // Lấy thông tin booking kèm giờ bắt đầu từ timeslots
    const result = await pool.query(
      `SELECT b.*, t.gioBatDau
       FROM bookings b JOIN timeslots t ON b.khungGioId = t.id
       WHERE b.id = $1 AND b.nguoiDungId = $2`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    const booking = result.rows[0];

    // Chỉ cho hủy đơn đang ở trạng thái có thể hủy
    if (booking.trangThai !== 'Đã thanh toán' && booking.trangThai !== 'Đã đặt') {
      return res.status(400).json({ error: 'Chỉ có thể hủy đơn ở trạng thái Đã thanh toán hoặc Đã đặt' });
    }

    // Kiểm tra quy tắc 3 tiếng: tính số giờ còn lại từ hiện tại đến giờ bắt đầu
    const playTime = new Date(`${booking.ngayChoi}T${booking.gioBatDau || '00:00'}`);
    const hoursLeft = (playTime - new Date()) / (1000 * 60 * 60);
    if (hoursLeft < 3) {
      return res.status(400).json({ error: 'Đã quá thời gian cho phép hủy sân (Yêu cầu hủy trước 3 tiếng)' });
    }

    // Cập nhật trạng thái và gửi thông báo
    await pool.query("UPDATE bookings SET trangThai = 'Đã hủy', updated_at = NOW() WHERE id = $1", [req.params.id]);
    await pool.query(
      "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat) VALUES ($1, $2, $3, 'booking_cancelled', $4)",
      [req.user.id, 'Hủy đặt sân thành công', `Đơn #${req.params.id} đã bị hủy.`, req.params.id]
    );
    res.json({ message: 'Hủy đặt sân thành công.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /bookings/:id/checkin - Check-in cho khách (Admin only).
 *
 * Quy tắc:
 * - Chỉ admin mới được thực hiện
 * - Chỉ check-in được đơn ở trạng thái 'Đã thanh toán' hoặc 'Đã đặt'
 * - Sau check-in: trạng thái -> 'Đang sử dụng'
 * - Gửi thông báo check-in thành công cho khách
 *
 * Response: { message: 'Check-in thành công' }
 * Yêu cầu: authenticate + quyền admin
 */
router.post('/:id/checkin', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'Admin' && req.user.vaiTro !== 'Admin') {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const result = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    const booking = result.rows[0];
    if (booking.trangThai !== 'Đã thanh toán' && booking.trangThai !== 'Đã đặt') {
      return res.status(400).json({ error: 'Chỉ check-in đơn ở trạng thái Đã thanh toán hoặc Đã đặt' });
    }
    await pool.query("UPDATE bookings SET trangThai = 'Đang sử dụng', updated_at = NOW() WHERE id = $1", [req.params.id]);
    await pool.query(
      "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat) VALUES ($1, $2, $3, 'auto_checkin', $4)",
      [booking.nguoiDungId, 'Check-in thành công', `Đơn #${req.params.id} đã được check-in. Chúc bạn chơi vui vẻ!`, req.params.id]
    );
    res.json({ message: 'Check-in thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /bookings/:id/checkout - Check-out cho khách (Admin only).
 *
 * Quy tắc:
 * - Chỉ admin mới được thực hiện
 * - Chỉ check-out được đơn đang ở trạng thái 'Đang sử dụng'
 * - Sau check-out: trạng thái -> 'Hoàn thành'
 * - Gửi thông báo hoàn thành + lời cảm ơn cho khách
 *
 * Response: { message: 'Check-out thành công' }
 * Yêu cầu: authenticate + quyền admin
 */
router.post('/:id/checkout', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'Admin' && req.user.vaiTro !== 'Admin') {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const result = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    const booking = result.rows[0];
    if (booking.trangThai !== 'Đang sử dụng') {
      return res.status(400).json({ error: 'Chỉ check-out đơn đang sử dụng' });
    }
    await pool.query("UPDATE bookings SET trangThai = 'Hoàn thành', updated_at = NOW() WHERE id = $1", [req.params.id]);
    await pool.query(
      "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat) VALUES ($1, $2, $3, 'auto_checkout', $4)",
      [booking.nguoiDungId, 'Check-out thành công', `Đơn #${req.params.id} đã hoàn thành. Cảm ơn bạn đã sử dụng dịch vụ!`, req.params.id]
    );

    res.json({ message: 'Check-out thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /bookings/:id/noshow - Đánh dấu khách vắng mặt (Admin only).
 *
 * Quy tắc:
 * - Chỉ admin mới được thực hiện
 * - Chỉ áp dụng cho đơn 'Đã thanh toán' hoặc 'Đã đặt'
 * - Sau khi đánh dấu: trạng thái -> 'Đã hủy', ghiChu = 'No-show'
 * - Gửi thông báo hủy vắng mặt cho khách
 *
 * Response: { message: 'Đã hủy vắng mặt' }
 * Yêu cầu: authenticate + quyền admin
 */
router.post('/:id/noshow', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'Admin' && req.user.vaiTro !== 'Admin') {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const result = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    if (result.rows[0].trangThai !== 'Đã thanh toán' && result.rows[0].trangThai !== 'Đã đặt') {
      return res.status(400).json({ error: 'Chỉ hủy vắng mặt đơn Đã thanh toán hoặc Đã đặt' });
    }
    await pool.query("UPDATE bookings SET trangThai = 'Đã hủy', ghiChu = 'No-show', updated_at = NOW() WHERE id = $1", [req.params.id]);
    await pool.query(
      "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat) VALUES ($1, $2, $3, 'noshow', $4)",
      [result.rows[0].nguoiDungId, 'Hủy vắng mặt', `Đơn #${req.params.id} đã bị hủy do không đến đúng giờ.`, req.params.id]
    );
    res.json({ message: 'Đã hủy vắng mặt' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /bookings/:id/qr - Tạo mã QR cho đơn đặt sân.
 *
 * Mã QR chứa ID của booking, dùng để quét check-in tại quầy.
 * Sử dụng thư viện qrcode để tạo ảnh QR dạng Data URL (base64).
 *
 * Trả về: { data: { qr: "data:image/png;base64,...", bookingId } }
 * Yêu cầu: authenticate
 */
router.get('/:id/qr', authenticate, async (req, res) => {
  try {
    const QRCode = require('qrcode');
    const result = await pool.query('SELECT id, sanId, ngayChoi FROM bookings WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    // QR code chứa ID của booking để admin quét check-in
    const qrData = String(result.rows[0].id);
    const qrImage = await QRCode.toDataURL(qrData, { width: 300, margin: 2 });
    res.json({ data: { qr: qrImage, bookingId: result.rows[0].id } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
