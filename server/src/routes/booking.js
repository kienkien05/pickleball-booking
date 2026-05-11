const express = require('express');
const { pool } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// Create booking
router.post('/', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const { sanId, ngayChoi, khungGioIds, dichVu, loaiThanhToan, isAutoBooking, phuongThuc, maGiamGia } = req.body;
    if (!sanId || !ngayChoi || !khungGioIds || khungGioIds.length === 0) {
      return res.status(400).json({ error: 'Vui lòng chọn sân và khung giờ' });
    }
    await client.query('BEGIN');

    // Check court is available for booking
    const courtCheck = await client.query('SELECT trangThai FROM courts WHERE id = $1', [sanId]);
    if (courtCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Không tìm thấy sân' });
    }
    
    const courtRow = courtCheck.rows[0];
    const courtStatus = courtRow.trangThai || courtRow.trangthai;
    const isAvailable = courtStatus === 'Sẵn sàng' || courtStatus === 'Active' || courtStatus === 'active' || courtStatus === 'Ready';

    if (courtStatus === 'Bảo trì' || courtStatus === 'maintenance' || courtStatus === 'inactive') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Sân này hiện đang bảo trì, không thể đặt lịch.' });
    }
    
    if (!isAvailable) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'Sân này hiện không khả dụng để đặt' });
    }

    // Check for conflicts
    const conflictCheck = await client.query(
      "SELECT id FROM bookings WHERE sanId = $1 AND ngayChoi = $2 AND khungGioId = ANY($3) AND trangThai NOT IN ('Đã hủy')",
      [sanId, ngayChoi, khungGioIds]
    );
    if (conflictCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Khung giờ này vừa có người đặt. Vui lòng chọn giờ khác' });
    }

    // Calculate prices
    let courtPrice = 0;
    for (const slotId of khungGioIds) {
      const slotResult = await client.query('SELECT mucGia, mucgia FROM timeslots WHERE id = $1', [slotId]);
      if (slotResult.rows.length > 0) {
        const slot = slotResult.rows[0];
        courtPrice += parseFloat(slot.mucGia || slot.mucgia) || 0;
      }
    }

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
    let discountId = null;

    // Handle Discount Code
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
        discountId = disc.id;
        if (disc.loaigiamgia === 'percentage') {
          discountAmount = Math.round(subTotal * disc.mucgiamgia / 100);
        } else {
          discountAmount = Math.min(Number(disc.mucgiamgia), subTotal);
        }
        // Update usage count
        await client.query('UPDATE discounts SET soLuongDaDung = soLuongDaDung + 1 WHERE id = $1', [disc.id]);
      }
    }

    const totalPrice = subTotal - discountAmount;
    const discountRatio = subTotal > 0 ? totalPrice / subTotal : 1;

    // Create bookings (one per time slot) - always full payment
    const bookingIds = [];
    const numSlots = khungGioIds.length;
    
    for (const slotId of khungGioIds) {
      // Get individual slot price
      const slotRes = await client.query('SELECT mucGia, mucgia FROM timeslots WHERE id = $1', [slotId]);
      const slotOriginalPrice = parseFloat(slotRes.rows[0].mucGia || slotRes.rows[0].mucgia) || 0;
      
      // Calculate discounted price for this slot (including its portion of services)
      const slotShareOfServices = servicesPrice / numSlots;
      const finalPriceForThisSlot = Math.round((slotOriginalPrice + slotShareOfServices) * discountRatio);

      const autoBook = isAutoBooking === true;
      const booking = await client.query(
        `INSERT INTO bookings (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, trangThai, isAutoBooking)
         VALUES ($1, $2, $3, $4, $5, $6, 'Đã thanh toán', $7) RETURNING id`,
        [req.user.id, sanId, slotId, ngayChoi, finalPriceForThisSlot, finalPriceForThisSlot, autoBook]
      );
      bookingIds.push(booking.rows[0].id);

      // Create payment record
      await client.query(
        'INSERT INTO payments (donDatId, soTien, loaiThanhToan, trangThai) VALUES ($1, $2, $3, $4)',
        [booking.rows[0].id, finalPriceForThisSlot,
         `Full - ${phuongThuc === 'transfer' ? 'Chuyển khoản' : phuongThuc === 'momo' ? 'MoMo' : phuongThuc === 'visa' ? 'Visa/MC' : 'Tiền mặt'}`,
         phuongThuc === 'cash' ? 'Thành công' : 'Chờ xác nhận']
      );
    }

    // Add services to the first booking
    if (dichVu && dichVu.length > 0 && bookingIds.length > 0) {
      for (const d of dichVu) {
        const svc = await client.query('SELECT donGia, soLuongTon FROM services WHERE id = $1', [d.dichVuId]);
        if (svc.rows.length > 0) {
          const qty = d.soLuong || 1;
          const currentStock = parseInt(svc.rows[0].soluongton) || 0;
          if (currentStock > 0) {
            const newStock = Math.max(0, currentStock - qty);
            await client.query('UPDATE services SET soLuongTon = $1 WHERE id = $2', [newStock, d.dichVuId]);
          }
          await client.query(
            'INSERT INTO booking_services (donDatId, dichVuId, soLuong, tongTien) VALUES ($1, $2, $3, $4)',
            [bookingIds[0], d.dichVuId, qty, (parseFloat(svc.rows[0].dongia) || 0) * qty]
          );
        }
      }
    }

    // Notification
    for (const bid of bookingIds) {
      await client.query(
        "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat) VALUES ($1, $2, $3, 'booking_confirmed', $4)",
        [req.user.id, 'Đặt sân thành công', `Đơn đặt sân #${bid} đã được xác nhận`, bid]
      );
    }

    // Check if this booking conflicts with any VIP auto-booking
    // A VIP's auto-booking from 7 days ago means they expect this slot to be auto-booked
    const bookingDate = new Date(ngayChoi);
    const prevWeekDate = new Date(bookingDate);
    prevWeekDate.setDate(prevWeekDate.getDate() - 7);
    const prevWeekStr = prevWeekDate.toISOString().slice(0, 10);

    for (const slotId of khungGioIds) {
      // Find VIP users who had auto-booking ON for this court+slot exactly 7 days ago
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
        // Notify VIP that someone booked the slot they expected to auto-book for today
        await client.query(
          "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao) VALUES ($1, $2, $3, 'vip_auto_conflict')",
          [vip.nguoiDungId, 'Xung đột lịch tự động',
           `Khung giờ tự động của bạn cho ngày ${ngayChoi} đã có người khác đặt trước. Tính năng tự động đặt lịch đã bị tắt cho khung giờ này.`]
        );
        // Disable auto-booking for the conflicting VIP's previous-week booking
        await client.query(
          "UPDATE bookings SET isAutoBooking = FALSE, updated_at = NOW() WHERE nguoiDungId = $1 AND sanId = $2 AND khungGioId = $3 AND ngayChoi = $4 AND isAutoBooking = TRUE",
          [vip.nguoiDungId, sanId, slotId, prevWeekStr]
        );
      }
    }

    // Calculate next week date for notification
    const nextWeekDate = new Date(bookingDate);
    nextWeekDate.setDate(nextWeekDate.getDate() + 7);
    const nextWeekStr = nextWeekDate.toISOString().slice(0, 10);

    // VIP auto-booking notification for this user
    if (isAutoBooking) {
      await client.query(
        "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao) VALUES ($1, $2, $3, 'vip_auto_enabled')",
        [req.user.id, 'Tự động đặt lịch đã bật',
         `Hệ thống sẽ tự động đặt lịch cho khung giờ này vào ngày ${nextWeekStr}. Nếu có xung đột, bạn sẽ được thông báo.`]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ data: { bookingIds, totalPrice } });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

// Get my bookings
router.get('/my', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 50, status } = req.query;
    const offset = (page - 1) * limit;
    let query = `
      SELECT b.*, c.tenSan, t.gioBatDau, t.gioKetThuc
      FROM bookings b
      JOIN courts c ON b.sanId = c.id
      JOIN timeslots t ON b.khungGioId = t.id
      WHERE b.nguoiDungId = $1`;
    const params = [req.user.id];
    let idx = 2;
    if (status) { query += ` AND b.trangThai = $${idx}`; params.push(status); idx++; }
    query += ' ORDER BY b.created_at DESC';
    query += ` LIMIT $${idx} OFFSET $${idx + 1}`; params.push(limit, offset);

    const result = await pool.query(query, params);
    // Get services for each booking
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
    res.status(500).json({ error: err.message });
  }
});

// Get all bookings (admin)
router.get('/', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 100, status, date, court } = req.query;
    if (req.user.role !== 'admin' && req.user.role !== 'Admin' && req.user.vaiTro !== 'Admin') {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const offset = (page - 1) * limit;
    let query = `
      SELECT b.*, c.tenSan, t.gioBatDau, t.gioKetThuc, u.hoTen as full_name, u.email
      FROM bookings b
      JOIN courts c ON b.sanId = c.id
      JOIN timeslots t ON b.khungGioId = t.id
      JOIN users u ON b.nguoiDungId = u.id
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

// Get booking by ID
router.get('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, c.tenSan, t.gioBatDau, t.gioKetThuc, u.hoTen as full_name
       FROM bookings b JOIN courts c ON b.sanId = c.id JOIN timeslots t ON b.khungGioId = t.id
       JOIN users u ON b.nguoiDungId = u.id WHERE b.id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    const booking = result.rows[0];
    const svcs = await pool.query(
      'SELECT bs.*, s.tenDichVu FROM booking_services bs JOIN services s ON bs.dichVuId = s.id WHERE bs.donDatId = $1',
      [booking.id]
    );
    res.json({ data: { ...booking, dichVu: svcs.rows } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Cancel booking
router.post('/:id/cancel', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.*, t.gioBatDau
       FROM bookings b JOIN timeslots t ON b.khungGioId = t.id
       WHERE b.id = $1 AND b.nguoiDungId = $2`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    const booking = result.rows[0];
    if (booking.trangThai !== 'Đã thanh toán') {
      return res.status(400).json({ error: 'Chỉ có thể hủy đơn ở trạng thái Đã thanh toán' });
    }
    // Check 3-hour rule
    const playTime = new Date(`${booking.ngayChoi}T${booking.gioBatDau || '00:00'}`);
    const hoursLeft = (playTime - new Date()) / (1000 * 60 * 60);
    if (hoursLeft < 3) {
      return res.status(400).json({ error: 'Đã quá thời gian cho phép hủy sân (Yêu cầu hủy trước 3 tiếng)' });
    }
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

// Check-in (admin)
router.post('/:id/checkin', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'Admin' && req.user.vaiTro !== 'Admin') {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const result = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    const booking = result.rows[0];
    if (booking.trangThai !== 'Đã thanh toán') {
      return res.status(400).json({ error: 'Chỉ check-in đơn ở trạng thái Đã thanh toán' });
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

// Check-out (admin)
router.post('/:id/checkout', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'Admin' && req.user.vaiTro !== 'Admin') {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const result = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    if (result.rows[0].trangThai !== 'Đang sử dụng') {
      return res.status(400).json({ error: 'Chỉ check-out đơn đang sử dụng' });
    }
    await pool.query("UPDATE bookings SET trangThai = 'Hoàn thành', updated_at = NOW() WHERE id = $1", [req.params.id]);
    await pool.query(
      "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat) VALUES ($1, $2, $3, 'auto_checkout', $4)",
      [booking.nguoiDungId, 'Check-out thành công', `Đơn #${req.params.id} đã hoàn thành. Cảm ơn bạn đã sử dụng dịch vụ!`, req.params.id]
    );

    // Loyalty Reward Logic: Check when user hits 3 completed bookings
    const completedRes = await pool.query("SELECT COUNT(*) as count FROM bookings WHERE nguoiDungId = $1 AND trangThai = 'Hoàn thành'", [booking.nguoiDungId]);
    const completedCount = parseInt(completedRes.rows[0].count || 0);
    
    if (completedCount === 3) {
      const rewardCode = `LOYAL3-${booking.nguoiDungId}-${Math.floor(Math.random() * 1000)}`;
      await pool.query(
        `INSERT INTO discounts (code, noiDung, moTa, loaiGiamGia, mucGiamGia, ngayBatDau, ngayKetThuc, soLuongBanDau, soLuongDaDung, trangThai, nguoiDungId)
         VALUES ($1, 'Quà tặng đặt sân lần thứ 3', 'Mã giảm giá 10% tri ân khách hàng đạt mốc 3 đơn hàng', 'percentage', 10, NOW(), '2026-12-31', 1, 0, 'Active', $2)`,
        [rewardCode, booking.nguoiDungId]
      );
      
      await pool.query(
        "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao) VALUES ($1, $2, $3, 'promotion')",
        [booking.nguoiDungId, 'Quà tặng tri ân!', `Chúc mừng! Bạn đã hoàn thành 3 đơn đặt sân. Hệ thống tặng bạn mã giảm giá 10% cho lần sau: ${rewardCode}`]
      );
    }

    res.json({ message: 'Check-out thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Mark no-show (admin)
router.post('/:id/noshow', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'Admin' && req.user.vaiTro !== 'Admin') {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const result = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    if (result.rows[0].trangThai !== 'Đã thanh toán') {
      return res.status(400).json({ error: 'Chỉ hủy vắng mặt đơn Đã thanh toán' });
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

// Generate QR code for a booking
router.get('/:id/qr', authenticate, async (req, res) => {
  try {
    const QRCode = require('qrcode');
    const result = await pool.query('SELECT id, sanId, ngayChoi FROM bookings WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    const qrData = String(result.rows[0].id);
    const qrImage = await QRCode.toDataURL(qrData, { width: 300, margin: 2 });
    res.json({ data: { qr: qrImage, bookingId: result.rows[0].id } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
