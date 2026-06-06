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
const { cancelBookingWithReason, checkAndRewardLoyalty } = require('../utils/bookingCancellation');
const { validateDiscountForUse, markDiscountUsed } = require('../utils/discount');
const { notifyAdmins } = require('../utils/notifications');
const { createVNPayUrl, verifyVNPaySignature } = require('../utils/vnpay');
const router = express.Router();

const AUTO_BOOKING_DAYS = 30;

function formatDateLocal(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function toDateStringLocal(value) {
  if (value instanceof Date) return formatDateLocal(value);
  return String(value).slice(0, 10);
}

function parseDateLocal(dateStr) {
  const [year, month, day] = String(dateStr).slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day);
}

function addDaysToDateString(dateStr, days) {
  const date = parseDateLocal(dateStr);
  date.setDate(date.getDate() + days);
  return formatDateLocal(date);
}

function buildWeeklyDates(startDate, durationDays = AUTO_BOOKING_DAYS) {
  const dates = [];
  const current = parseDateLocal(startDate);
  const end = parseDateLocal(startDate);
  end.setDate(end.getDate() + durationDays);
  while (current <= end) {
    dates.push(formatDateLocal(current));
    current.setDate(current.getDate() + 7);
  }
  return dates;
}

function paymentMethodLabel(method) {
  if (method === 'transfer') return 'Chuyển khoản';
  if (method === 'momo') return 'MoMo';
  if (method === 'visa') return 'Visa/MC';
  return null;
}

const ALLOWED_PAYMENT_METHODS = new Set(['transfer', 'momo', 'visa']);

/**
 * POST /bookings - Tạo đơn đặt sân mới (có transaction để đảm bảo tính toàn vẹn dữ liệu).
 *
 * Body: { sanId, ngayChoi, khungGioIds (mảng), dichVu?, isAutoBooking?, repeatServices?, phuongThuc?, maGiamGia? }
 * - sanId: ID sân muốn đặt
 * - ngayChoi: ngày chơi (YYYY-MM-DD)
 * - khungGioIds: mảng các ID khung giờ muốn đặt (có thể đặt nhiều khung giờ cùng lúc)
 * - dichVu: mảng [{ dichVuId, soLuong }] các dịch vụ đi kèm
 * - phuongThuc: 'transfer' (chuyển khoản) | 'momo' | 'visa'
 * - maGiamGia: mã giảm giá nếu có
 * - isAutoBooking: true nếu VIP muốn khóa lịch cùng thứ/giờ trong 30 ngày
 * - repeatServices: true nếu dịch vụ áp dụng cho tất cả buổi trong chuỗi VIP 30 ngày
 *
 * Quy trình xử lý (tất cả trong 1 TRANSACTION):
 * 1. Kiểm tra sân tồn tại và khả dụng (Sẵn sàng/Active, không phải Bảo trì)
 * 2. Kiểm tra xung đột: khung giờ đã có người đặt chưa (trừ trạng thái 'Đã hủy')
 * 3. Kiểm tra thời gian: không cho đặt ngày quá khứ hoặc khung giờ đã qua ngưỡng cho phép
 *    - Ngưỡng cho phép: BOOKING_LOCK_THRESHOLD_MINS (mặc định 15 phút sau giờ bắt đầu)
 * 4. Tính giá: giá sân (từ timeslots) + giá dịch vụ (từ services) = subTotal
 * 5. Áp dụng mã giảm giá nếu có: kiểm tra hợp lệ, tính discountAmount, cập nhật số lượt dùng
 * 6. Tạo booking cho từng khung giờ (mỗi khung giờ 1 bản ghi), phân bổ giá và discount đều
 *    - Chỉ tạo đơn khi phương thức thanh toán hợp lệ và ghi nhận thanh toán thành công
 * 7. Tạo payment record tương ứng
 * 8. Gán dịch vụ vào booking đầu tiên, trừ kho dịch vụ
 * 9. Gửi thông báo xác nhận đặt sân thành công
 * 10. Nếu VIP bật auto-booking: tạo booking thật cho các tuần trong 30 ngày để khóa slot ngay
 * 11. Loyalty Rewards: mỗi 3 đơn (không tính đã hủy) -> tặng 1 mã giảm giá 10%
 *
 * Response: 201 { data: { bookingIds: [...], totalPrice } }
 * Yêu cầu: authenticate
 */
router.post('/', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const { sanId, ngayChoi, khungGioIds, dichVu, isAutoBooking, repeatServices, phuongThuc = 'transfer', maGiamGia } = req.body;
    const slotIds = Array.isArray(khungGioIds)
      ? [...new Set(khungGioIds.map(id => parseInt(id, 10)).filter(id => Number.isInteger(id) && id > 0))]
      : [];
    const autoBook = isAutoBooking === true;
    const repeatServicesForFuture = autoBook && repeatServices === true;

    if (!sanId || !ngayChoi || slotIds.length === 0) {
      return res.status(400).json({ error: 'Vui lòng chọn sân và khung giờ' });
    }
    if (!ALLOWED_PAYMENT_METHODS.has(phuongThuc)) {
      return res.status(400).json({ error: 'Phương thức thanh toán không hợp lệ. Vui lòng chọn chuyển khoản, MoMo hoặc Visa/Mastercard.' });
    }

    // Bắt đầu transaction - mọi thay đổi chỉ được lưu khi COMMIT thành công
    await client.query('BEGIN');

    const userCheck = await client.query('SELECT isVIP AS "isVIP", trangThai AS "trangThai" FROM users WHERE id = $1', [req.user.id]);
    if (userCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Không tìm thấy tài khoản' });
    }
    const userRow = userCheck.rows[0];
    const userStatus = userRow.trangThai || userRow.trangthai;
    if (userStatus === 'Locked') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Tài khoản của bạn đã bị khóa. Không thể thực hiện đặt sân.' });
    }
    if (autoBook && userRow.isVIP !== true) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Chỉ tài khoản VIP mới được bật tự động đặt sân' });
    }

    // Kiểm tra trạng thái sân: phải là Sẵn sàng/Active mới cho đặt
    const courtCheck = await client.query('SELECT trangThai AS "trangThai" FROM courts WHERE id = $1', [sanId]);
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

    const bookingDates = autoBook ? buildWeeklyDates(ngayChoi) : [ngayChoi];
    const autoBookingEndDate = autoBook ? addDaysToDateString(ngayChoi, AUTO_BOOKING_DAYS) : null;

    // Kiểm tra xung đột cho toàn bộ chuỗi 30 ngày: booking được tạo ngay để khóa slot
    // Dùng SELECT ... FOR UPDATE để khóa row, ngăn race condition 2 user đặt cùng slot
    const conflictCheck = await client.query(
      `SELECT b.id, b.ngayChoi AS "ngayChoi", t.gioBatDau AS "gioBatDau", t.gioKetThuc AS "gioKetThuc"
       FROM bookings b
       JOIN timeslots t ON b.khungGioId = t.id
       WHERE b.sanId = $1
       AND b.ngayChoi = ANY($2::date[])
       AND b.khungGioId = ANY($3::int[])
       AND b.trangThai NOT IN ('Đã hủy')
       ORDER BY b.ngayChoi, t.gioBatDau
       FOR UPDATE`,
      [sanId, bookingDates, slotIds]
    );
    if (conflictCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      const first = conflictCheck.rows[0];
      return res.status(409).json({
        error: `Khung giờ ${String(first.gioBatDau).slice(0, 5)}-${String(first.gioKetThuc).slice(0, 5)} ngày ${toDateStringLocal(first.ngayChoi)} đã có người đặt. Vui lòng chọn giờ khác`,
      });
    }

    // Kiểm tra thời gian: không cho đặt ngày đã qua hoặc khung giờ đã quá ngưỡng
    const now = new Date();
    const todayStr = formatDateLocal(now);
    const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    if (ngayChoi < todayStr) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Không thể đặt lịch cho ngày đã qua' });
    }

    const slotResult = await client.query(
      `SELECT id, gioBatDau AS "gioBatDau", gioKetThuc AS "gioKetThuc", mucGia AS "mucGia", trangThai AS "trangThai"
       FROM timeslots
       WHERE sanId = $1 AND id = ANY($2::int[])`,
      [sanId, slotIds]
    );
    if (slotResult.rows.length !== slotIds.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Có khung giờ không thuộc sân này hoặc không tồn tại' });
    }
    const slotById = new Map(slotResult.rows.map(slot => [Number(slot.id), slot]));

    // Nếu đặt cho hôm nay: kiểm tra từng khung giờ không bị quá hạn
    if (ngayChoi === todayStr) {
      const thresholdMins = parseInt(process.env.BOOKING_LOCK_THRESHOLD_MINS) || 15;
      const [nowH, nowM] = currentTimeStr.split(':').map(Number);
      const nowTotalMins = nowH * 60 + nowM;

      for (const slotId of slotIds) {
        const slot = slotById.get(slotId);
        const gioBatDau = String(slot.gioBatDau || '00:00').slice(0, 5);
        const gioKetThuc = String(slot.gioKetThuc || '00:00').slice(0, 5);
        const [startH, startM] = gioBatDau.split(':').map(Number);
        const startTotalMins = startH * 60 + startM;

        // Khóa nếu đã quá ngưỡng (vd: 15 phút sau giờ bắt đầu) hoặc giờ kết thúc đã qua
        if (nowTotalMins >= startTotalMins + thresholdMins || gioKetThuc <= currentTimeStr) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: 'Khung giờ này đã quá thời gian cho phép đặt' });
        }
      }
    }

    // Tính tổng giá sân cho một buổi và nhân lên theo số tuần trong 30 ngày nếu VIP bật auto-booking
    const courtPricePerSession = slotIds.reduce((sum, slotId) => {
      const slot = slotById.get(slotId);
      return sum + (parseFloat(slot.mucGia) || 0);
    }, 0);
    const courtPrice = courtPricePerSession * bookingDates.length;

    // Tính tổng giá dịch vụ đi kèm
    const serviceQuantityById = new Map();
    if (Array.isArray(dichVu)) {
      for (const item of dichVu) {
        const serviceId = parseInt(item.dichVuId, 10);
        const quantity = parseInt(item.soLuong, 10) || 1;
        if (Number.isInteger(serviceId) && serviceId > 0 && quantity > 0) {
          serviceQuantityById.set(serviceId, (serviceQuantityById.get(serviceId) || 0) + quantity);
        }
      }
    }
    const selectedServices = [...serviceQuantityById.entries()].map(([dichVuId, soLuong]) => ({ dichVuId, soLuong }));
    const serviceSessions = selectedServices.length > 0 && repeatServicesForFuture ? bookingDates.length : 1;
    let servicesPricePerSession = 0;
    const serviceRowsById = new Map();

    if (selectedServices.length > 0) {
      const serviceIds = [...serviceQuantityById.keys()];
      const serviceResult = await client.query(
        `SELECT id, tenDichVu AS "tenDichVu", donGia AS "donGia", soLuongTon AS "soLuongTon", trangThai AS "trangThai"
         FROM services
         WHERE id = ANY($1::int[])`,
        [serviceIds]
      );
      serviceResult.rows.forEach(row => serviceRowsById.set(Number(row.id), row));

      if (serviceRowsById.size !== serviceIds.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Có dịch vụ không tồn tại' });
      }

      for (const item of selectedServices) {
        const svc = serviceRowsById.get(item.dichVuId);
        if (svc.trangThai !== 'Còn hàng') {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Dịch vụ ${svc.tenDichVu} hiện không còn bán` });
        }
        const requiredQty = item.soLuong * serviceSessions;
        const currentStock = parseInt(svc.soLuongTon, 10) || 0;
        if (currentStock < requiredQty) {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `Dịch vụ ${svc.tenDichVu} không đủ tồn kho cho ${serviceSessions} buổi` });
        }
        servicesPricePerSession += (parseFloat(svc.donGia) || 0) * item.soLuong;
      }
    }

    const servicesPrice = servicesPricePerSession * serviceSessions;
    let subTotal = courtPrice + servicesPrice;
    let discountAmount = 0;
    let appliedCode = null;

    // Xử lý mã giảm giá nếu có
    if (maGiamGia) {
      const validation = await validateDiscountForUse(client, {
        code: maGiamGia,
        userId: req.user.id,
        totalAmount: subTotal,
        courtId: sanId,
      });

      if (!validation.valid) {
        await client.query('ROLLBACK');
        return res.status(validation.status || 400).json({ error: validation.error });
      }

      appliedCode = validation.normalizedCode;
      discountAmount = validation.discountAmount;
      await markDiscountUsed(client, validation.discount.id);
      await client.query(
        "UPDATE user_vouchers SET trangThai = 'Used', usedAt = NOW() WHERE nguoiDungId = $1 AND discountId = $2",
        [req.user.id, validation.discount.id]
      );
    }

    const totalPrice = subTotal - discountAmount;
    const discountRatio = subTotal > 0 ? totalPrice / subTotal : 1;

    let autoBookingSeriesId = null;
    if (autoBook) {
      const series = await client.query(
        `INSERT INTO auto_booking_series
          (nguoiDungId, sanId, khungGioIds, startDate, endDate, repeatServices, servicePolicy, totalAmount, trangThai)
         VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, 'Active')
         RETURNING id`,
        [
          req.user.id,
          sanId,
          JSON.stringify(slotIds),
          ngayChoi,
          autoBookingEndDate,
          repeatServicesForFuture,
          repeatServicesForFuture ? 'all_sessions' : 'first_only',
          totalPrice,
        ]
      );
      autoBookingSeriesId = series.rows[0].id;
    }

    const plannedBookings = [];
    bookingDates.forEach((date, dateIndex) => {
      const applyServicesForThisDate = selectedServices.length > 0 && (dateIndex === 0 || repeatServicesForFuture);
      const serviceShare = applyServicesForThisDate ? servicesPricePerSession / slotIds.length : 0;
      slotIds.forEach((slotId, slotIndex) => {
        const slot = slotById.get(slotId);
        plannedBookings.push({
          date,
          slotId,
          dateIndex,
          slotIndex,
          attachServices: applyServicesForThisDate && slotIndex === 0,
          originalPrice: (parseFloat(slot.mucGia) || 0) + serviceShare,
        });
      });
    });

    // Tạo booking cho từng khung giờ - mỗi slot là 1 bản ghi riêng, kể cả các tuần auto-booking
    const bookingIds = [];
    let remainingFinal = totalPrice;

    for (let i = 0; i < plannedBookings.length; i++) {
      const planned = plannedBookings[i];
      const isLast = i === plannedBookings.length - 1;
      const finalPriceForThisSlot = isLast ? remainingFinal : Math.round(planned.originalPrice * discountRatio);
      const discountForThisSlot = planned.originalPrice - finalPriceForThisSlot;
      remainingFinal -= finalPriceForThisSlot;
      // Đặt trạng thái ban đầu là Chờ thanh toán
      const bookingStatus = 'Chờ thanh toán';
      const booking = await client.query(
        `INSERT INTO bookings
          (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, giaGoc, tienGiam, trangThai, isAutoBooking, autoBookingSeriesId, maGiamGia)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING id`,
        [
          req.user.id,
          sanId,
          planned.slotId,
          planned.date,
          finalPriceForThisSlot,
          finalPriceForThisSlot,
          planned.originalPrice,
          discountForThisSlot,
          bookingStatus,
          autoBook,
          autoBookingSeriesId,
          appliedCode,
        ]
      );
      const bookingId = booking.rows[0].id;
      bookingIds.push(bookingId);

      // Tạo bản ghi thanh toán (payment) ở trạng thái Chờ thanh toán
      await client.query(
        'INSERT INTO payments (donDatId, soTien, loaiThanhToan, trangThai) VALUES ($1, $2, $3, $4)',
        [
          bookingId,
          finalPriceForThisSlot,
          `${autoBook ? 'VIP Auto 30 ngày' : 'Full'} - ${paymentMethodLabel(phuongThuc)}`,
          'Chờ thanh toán',
        ]
      );

      // Gán dịch vụ vào booking đầu tiên của mỗi buổi nếu policy cho phép
      if (planned.attachServices) {
        for (const item of selectedServices) {
          const svc = serviceRowsById.get(item.dichVuId);
          await client.query(
            'INSERT INTO booking_services (donDatId, dichVuId, soLuong, tongTien) VALUES ($1, $2, $3, $4)',
            [bookingId, item.dichVuId, item.soLuong, (parseFloat(svc.donGia) || 0) * item.soLuong]
          );
        }
      }
    }

    // Trừ kho dịch vụ sau khi tất cả booking_services đã được tạo thành công
    for (const item of selectedServices) {
      await client.query(
        'UPDATE services SET soLuongTon = soLuongTon - $1 WHERE id = $2',
        [item.soLuong * serviceSessions, item.dichVuId]
      );
    }

    // Tạo URL thanh toán VNPay Sandbox
    const txnRef = `${bookingIds.join('_')}_${Date.now()}`;
    const ipAddr = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    const paymentUrl = createVNPayUrl({
      amount: totalPrice,
      txnRef,
      returnUrl: 'http://localhost:5173/payment/sepay-return',
      ipAddr,
    });

    // Commit transaction - lưu tất cả thay đổi vào DB
    await client.query('COMMIT');
    res.status(201).json({ data: { bookingIds, totalPrice, autoBookingSeriesId, bookingDates, paymentUrl } });
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
/**
 * GET /bookings/local-ip
 * Trả về IP cục bộ của server để thiết bị di động trong cùng mạng LAN quét QR kết nối được
 */
router.get('/local-ip', (req, res) => {
  const os = require('os');
  const interfaces = os.networkInterfaces();
  let ip = 'localhost';
  for (const devName in interfaces) {
    const iface = interfaces[devName];
    for (let i = 0; i < iface.length; i++) {
      const alias = iface[i];
      if (alias.family === 'IPv4' && alias.address !== '127.0.0.1' && !alias.internal) {
        ip = alias.address;
        break;
      }
    }
    if (ip !== 'localhost') break;
  }
  return res.json({ ip });
});

/**
 * GET /bookings/status-check
 * Kiểm tra trạng thái thanh toán của danh sách đơn đặt để hỗ trợ tự động nhận diện kết quả khi quét QR bằng điện thoại
 */
router.get('/status-check', async (req, res) => {
  try {
    const ids = (req.query.ids || '').split(',').map(Number);
    if (ids.length === 0 || ids.some(isNaN)) {
      return res.status(400).json({ error: 'Mã đặt sân không hợp lệ' });
    }
    const result = await pool.query('SELECT trangThai FROM bookings WHERE id = ANY($1::int[])', [ids]);
    const allPaid = result.rows.length > 0 && result.rows.every(r => (r.trangThai || r.trangthai) === 'Đã thanh toán');
    return res.json({ allPaid });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /bookings/vnpay-verify
 * Xác thực thanh toán từ VNPay sandbox
 */
router.get('/vnpay-verify', async (req, res) => {
  const client = await pool.connect();
  try {
    const params = req.query;
    const secureHash = params.vnp_SecureHash;

    if (!secureHash) {
      return res.status(400).json({ error: 'Thiếu chữ ký xác thực' });
    }

    const isValid = verifyVNPaySignature(params);
    if (!isValid) {
      return res.status(400).json({ error: 'Chữ ký không hợp lệ' });
    }

    const responseCode = params.vnp_ResponseCode;
    const txnRef = params.vnp_TxnRef;

    if (!txnRef) {
      return res.status(400).json({ error: 'Thiếu mã tham chiếu giao dịch' });
    }

    const parts = txnRef.split('_');
    // Bỏ phần tử cuối cùng là timestamp
    const bookingIds = parts.slice(0, -1).map(Number);

    if (bookingIds.length === 0 || bookingIds.some(isNaN)) {
      return res.status(400).json({ error: 'Mã đặt sân không hợp lệ' });
    }

    await client.query('BEGIN');

    if (responseCode === '00') {
      // Thanh toán thành công!
      // Cập nhật trạng thái booking và payment
      await client.query(
        "UPDATE bookings SET trangThai = 'Đã thanh toán', updated_at = NOW() WHERE id = ANY($1::int[]) AND trangThai = 'Chờ thanh toán'",
        [bookingIds]
      );

      await client.query(
        "UPDATE payments SET trangThai = 'Thành công' WHERE donDatId = ANY($1::int[]) AND trangThai = 'Chờ thanh toán'",
        [bookingIds]
      );

      // Gửi thông báo cho từng booking nếu chưa gửi
      const bookingsRes = await client.query(
        'SELECT b.*, u.hoTen FROM bookings b JOIN users u ON b.nguoiDungId = u.id WHERE b.id = ANY($1::int[])',
        [bookingIds]
      );

      let courtId = null;
      if (bookingsRes.rows.length > 0) {
        const firstBooking = bookingsRes.rows[0];
        const userId = firstBooking.nguoiDungId || firstBooking.nguoidungid;
        const isAutoBooking = firstBooking.isAutoBooking || firstBooking.isautobooking;
        courtId = firstBooking.sanId || firstBooking.sanid;
        const totalPrice = bookingsRes.rows.reduce((sum, b) => sum + (parseFloat(b.tongTien || b.tongtien) || 0), 0);

        if (isAutoBooking) {
          // Gửi thông báo tự động đặt lịch VIP
          const notifCheck = await client.query(
            "SELECT id FROM notifications WHERE nguoiDungId = $1 AND loaiThongBao = 'vip_auto_success' AND maDonDat = $2",
            [userId, bookingIds[0]]
          );
          if (notifCheck.rows.length === 0) {
            await client.query(
              "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat) VALUES ($1, $2, $3, 'vip_auto_success', $4)",
              [
                userId,
                'VIP tự động đặt sân 30 ngày',
                `Đã khóa ${bookingIds.length} buổi trong 30 ngày cho lịch VIP của bạn. Tổng thanh toán: ${totalPrice.toLocaleString('vi-VN')}đ.`,
                bookingIds[0],
              ]
            );
            await notifyAdmins(client, {
              title: 'Khách tạo lịch VIP tự động',
              message: `User #${userId} đã tạo chuỗi ${bookingIds.length} buổi, tổng tiền ${totalPrice.toLocaleString('vi-VN')}đ.`,
              type: 'vip_auto_success',
              bookingId: bookingIds[0],
            });
          }
        } else {
          for (const bid of bookingIds) {
            const notifCheck = await client.query(
              "SELECT id FROM notifications WHERE nguoiDungId = $1 AND loaiThongBao = 'booking_confirmed' AND maDonDat = $2",
              [userId, bid]
            );
            if (notifCheck.rows.length === 0) {
              await client.query(
                "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat) VALUES ($1, $2, $3, 'booking_confirmed', $4)",
                [userId, 'Đặt sân thành công', `Đơn đặt sân #${bid} đã được xác nhận`, bid]
              );
            }
          }
          await notifyAdmins(client, {
            title: 'Có đơn đặt sân mới',
            message: `User #${userId} vừa tạo ${bookingIds.length} đơn đặt sân. Tổng tiền ${totalPrice.toLocaleString('vi-VN')}đ.`,
            type: 'booking_confirmed',
            bookingId: bookingIds[0],
          });
        }
      }

      await client.query('COMMIT');
      if (req.query.format === 'html' || (req.headers.accept && req.headers.accept.includes('text/html'))) {
        return res.send(`
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>Thanh toán thành công</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; text-align: center; padding: 50px 20px; background: #f8fafc; color: #1e293b; }
                .card { background: white; padding: 30px; border-radius: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 400px; margin: 0 auto; }
                h1 { color: #10b981; font-size: 24px; margin-top: 15px; margin-bottom: 10px; }
                p { font-size: 14px; color: #64748b; line-height: 1.6; }
                .icon { font-size: 64px; }
              </style>
            </head>
            <body>
              <div class="card">
                <div class="icon">✅</div>
                <h1>Thanh toán thành công!</h1>
                <p>Giao dịch đặt sân đã được xác nhận thành công.</p>
                <p style="font-weight: bold; color: #3b82f6; margin-top: 20px;">Bạn có thể quay lại máy tính để xem kết quả chi tiết.</p>
              </div>
            </body>
          </html>
        `);
      }
      return res.json({ success: true, message: 'Thanh toán thành công', courtId });
    } else {
      // Hủy bỏ hoặc lỗi
      await client.query(
        "UPDATE bookings SET trangThai = 'Đã hủy', ghiChu = 'Thanh toán thất bại qua VNPay', updated_at = NOW() WHERE id = ANY($1::int[]) AND trangThai = 'Chờ thanh toán'",
        [bookingIds]
      );

      await client.query(
        "UPDATE payments SET trangThai = 'Thất bại' WHERE donDatId = ANY($1::int[]) AND trangThai = 'Chờ thanh toán'",
        [bookingIds]
      );

      await client.query('COMMIT');
      return res.status(400).json({ error: 'Giao dịch không thành công hoặc bị hủy' });
    }
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

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
    const isAdmin = req.user.role === 'admin' || req.user.role === 'Admin' || req.user.vaiTro === 'Admin';
    const ownerId = booking.nguoiDungId || booking.nguoidungid;
    if (!isAdmin && String(ownerId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Không có quyền xem đơn này' });
    }
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
 * 2. Chỉ hủy được đơn ở trạng thái 'Đã thanh toán', 'Đã cọc' hoặc 'Đã đặt'
 * 3. Quy tắc 3 tiếng: phải hủy trước giờ bắt đầu ít nhất 3 tiếng
 *    - Nếu còn dưới 3 tiếng -> không cho hủy
 *
 * Sau khi hủy:
 * - Cập nhật booking -> 'Đã hủy' để giải phóng khung giờ cho người khác đặt lại
 * - Giữ payment 'Thành công' nếu đơn đã thu tiền, chỉ hủy payment còn chờ thanh toán
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
    if (booking.trangThai !== 'Đã thanh toán' && booking.trangThai !== 'Đã đặt' && booking.trangThai !== 'Đã cọc') {
      return res.status(400).json({ error: 'Chỉ có thể hủy đơn ở trạng thái Đã thanh toán, Đã cọc hoặc Đã đặt' });
    }

    // Kiểm tra quy tắc 3 tiếng: tính số giờ còn lại từ hiện tại đến giờ bắt đầu
    const bookingDate = toDateStringLocal(booking.ngayChoi);
    const playTime = new Date(`${bookingDate}T${booking.gioBatDau || '00:00'}`);
    const hoursLeft = (playTime - new Date()) / (1000 * 60 * 60);
    if (hoursLeft < 3) {
      return res.status(400).json({ error: 'Đã quá thời gian cho phép hủy sân (Yêu cầu hủy trước 3 tiếng)' });
    }

    await cancelBookingWithReason(pool, booking, 'USER_CANCEL');
    res.json({
      message: 'Hủy đặt sân thành công. Khung giờ đã được mở lại. Nếu đơn đã thanh toán/cọc, hệ thống áp dụng chính sách không hoàn tiền.',
      slotReleased: true,
      refundPolicy: 'no_refund',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /bookings/:id/checkin - Check-in cho khách (Admin only).
 *
 * Quy tắc:
 * - Chỉ admin mới được thực hiện
 * - Chỉ check-in được đơn ở trạng thái 'Đã thanh toán', 'Đã cọc' hoặc 'Đã đặt'
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
    if (booking.trangThai !== 'Đã thanh toán' && booking.trangThai !== 'Đã đặt' && booking.trangThai !== 'Đã cọc') {
      return res.status(400).json({ error: 'Chỉ check-in đơn ở trạng thái Đã thanh toán, Đã cọc hoặc Đã đặt' });
    }

    const ngayChoiStr = toDateStringLocal(booking.ngayChoi);

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

    if (ngayChoiStr !== todayStr) {
      return res.status(400).json({ error: 'Đơn đặt sân phải có ngày chơi là hôm nay mới được phép check-in' });
    }

    const slotRes = await pool.query('SELECT gioBatDau FROM timeslots WHERE id = $1', [booking.khungGioId]);
    if (slotRes.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy khung giờ liên quan' });
    const gioBatDau = slotRes.rows[0].gioBatDau;

    const [startH, startM] = gioBatDau.split(':').map(Number);
    const startTotalMins = startH * 60 + startM;

    const [nowH, nowM] = today.toTimeString().slice(0, 5).split(':').map(Number);
    const nowTotalMins = nowH * 60 + nowM;

    if (nowTotalMins < startTotalMins - 30) {
      return res.status(400).json({ error: 'Chỉ được phép check-in tối đa 30 phút trước giờ bắt đầu chơi' });
    }

    await pool.query("UPDATE bookings SET trangThai = 'Đang sử dụng', updated_at = NOW() WHERE id = $1", [req.params.id]);
    await pool.query(
      "UPDATE payments SET trangThai = 'Thành công' WHERE donDatId = $1 AND trangThai IN ('Chờ thanh toán', 'Chờ xác nhận')",
      [req.params.id]
    );
    await pool.query(
      "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat) VALUES ($1, $2, $3, 'auto_checkin', $4)",
      [booking.nguoiDungId, 'Check-in thành công', `Đơn #${req.params.id} đã được check-in. Chúc bạn chơi vui vẻ!`, req.params.id]
    );
    await notifyAdmins(pool, {
      title: 'Check-in đơn đặt sân',
      message: `Đơn #${req.params.id} đã được check-in.`,
      type: 'auto_checkin',
      bookingId: req.params.id,
    });
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
      "UPDATE payments SET trangThai = 'Thành công' WHERE donDatId = $1 AND trangThai IN ('Chờ thanh toán', 'Chờ xác nhận')",
      [req.params.id]
    );
    await checkAndRewardLoyalty(pool, booking.nguoiDungId);
    await pool.query(
      "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat) VALUES ($1, $2, $3, 'auto_checkout', $4)",
      [booking.nguoiDungId, 'Check-out thành công', `Đơn #${req.params.id} đã hoàn thành. Cảm ơn bạn đã sử dụng dịch vụ!`, req.params.id]
    );
    await notifyAdmins(pool, {
      title: 'Check-out đơn đặt sân',
      message: `Đơn #${req.params.id} đã hoàn thành.`,
      type: 'auto_checkout',
      bookingId: req.params.id,
    });

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
 * - Chỉ áp dụng cho đơn 'Đã thanh toán', 'Đã cọc' hoặc 'Đã đặt'
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
    const booking = result.rows[0];
    if (booking.trangThai !== 'Đã thanh toán' && booking.trangThai !== 'Đã đặt' && booking.trangThai !== 'Đã cọc') {
      return res.status(400).json({ error: 'Chỉ hủy vắng mặt đơn Đã thanh toán, Đã cọc hoặc Đã đặt' });
    }
    await cancelBookingWithReason(pool, booking, 'ADMIN_NOSHOW');
    res.json({ message: 'Đã hủy vắng mặt. Nếu đơn đã thanh toán/cọc, hệ thống áp dụng chính sách không hoàn tiền.' });
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
