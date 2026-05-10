const express = require('express');
const { pool } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// Create booking
router.post('/', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    const { sanId, ngayChoi, khungGioIds, dichVu, loaiThanhToan, isAutoBooking, phuongThuc } = req.body;
    if (!sanId || !ngayChoi || !khungGioIds || khungGioIds.length === 0) {
      return res.status(400).json({ error: 'Vui lòng chọn sân và khung giờ' });
    }
    await client.query('BEGIN');

    // Check for conflicts
    const conflictCheck = await client.query(
      "SELECT id FROM bookings WHERE sanId = $1 AND ngayChoi = $2 AND khungGioId = ANY($3) AND trangThai NOT IN ('Đã hủy')",
      [sanId, ngayChoi, khungGioIds]
    );
    if (conflictCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Khung giờ này vừa có người đặt. Vui lòng chọn giờ khác' });
    }

    // Calculate total price
    let courtPrice = 0;
    for (const slotId of khungGioIds) {
      const slot = await client.query('SELECT mucGia FROM timeslots WHERE id = $1', [slotId]);
      if (slot.rows.length > 0) courtPrice += parseFloat(slot.rows[0].mucGia) || 0;
    }

    let servicesPrice = 0;
    if (dichVu && dichVu.length > 0) {
      for (const d of dichVu) {
        const svc = await client.query('SELECT donGia FROM services WHERE id = $1', [d.dichVuId]);
        if (svc.rows.length > 0) servicesPrice += (parseFloat(svc.rows[0].donGia) || 0) * (d.soLuong || 1);
      }
    }

    const totalPrice = courtPrice + servicesPrice;
    const depositAmount = Math.round(totalPrice * 0.1);
    const isFullPayment = loaiThanhToan === 'full';

    // Create bookings (one per time slot)
    const bookingIds = [];
    for (const slotId of khungGioIds) {
      const slot = await client.query('SELECT mucGia FROM timeslots WHERE id = $1', [slotId]);
      const slotPrice = parseFloat(slot.rows[0].mucGia) || 0;
      const autoBook = isAutoBooking === true;
      const booking = await client.query(
        `INSERT INTO bookings (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, trangThai, isAutoBooking)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
        [req.user.id, sanId, slotId, ngayChoi, slotPrice, isFullPayment ? slotPrice : Math.round(slotPrice * 0.1),
         isFullPayment ? 'Đã thanh toán Full' : 'Đã cọc', autoBook]
      );
      bookingIds.push(booking.rows[0].id);

      // Create payment record
      await client.query(
        'INSERT INTO payments (donDatId, soTien, loaiThanhToan, trangThai) VALUES ($1, $2, $3, $4)',
        [booking.rows[0].id, isFullPayment ? slotPrice : Math.round(slotPrice * 0.1),
         `${isFullPayment ? 'Full' : 'Deposit'} - ${phuongThuc === 'transfer' ? 'Chuyển khoản' : phuongThuc === 'momo' ? 'MoMo' : phuongThuc === 'visa' ? 'Visa/MC' : 'Tiền mặt'}`,
         phuongThuc === 'cash' ? 'Thành công' : 'Chờ xác nhận']
      );
    }

    // Add services to the first booking
    if (dichVu && dichVu.length > 0 && bookingIds.length > 0) {
      for (const d of dichVu) {
        const svc = await client.query('SELECT donGia, soLuongTon FROM services WHERE id = $1', [d.dichVuId]);
        if (svc.rows.length > 0) {
          const qty = d.soLuong || 1;
          const currentStock = parseInt(svc.rows[0].soLuongTon) || 0;
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
    res.status(201).json({ data: { bookingIds, totalPrice, depositAmount, isFullPayment } });
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
    if (booking.trangThai === 'Đã thanh toán Full') {
      return res.status(400).json({ error: 'Đơn thanh toán 100% không hỗ trợ hủy. Vui lòng nhượng lại lịch cho người khác' });
    }
    if (booking.trangThai !== 'Đã cọc') {
      return res.status(400).json({ error: 'Chỉ có thể hủy đơn ở trạng thái Đã cọc' });
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
      [req.user.id, 'Hủy đặt sân thành công', `Đơn #${req.params.id} đã bị hủy. Khoản cọc sẽ không được hoàn lại.`, req.params.id]
    );
    res.json({ message: 'Hủy đặt sân thành công. Khoản cọc không được hoàn lại.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Confirm booking (admin) - required step before check-in per thesis doc
router.post('/:id/confirm', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'Admin' && req.user.vaiTro !== 'Admin') {
      return res.status(403).json({ error: 'Không có quyền' });
    }
    const result = await pool.query('SELECT * FROM bookings WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    const booking = result.rows[0];
    if (!['Đã cọc', 'Đã thanh toán Full'].includes(booking.trangThai)) {
      return res.status(400).json({ error: 'Chỉ xác nhận đơn ở trạng thái Đã cọc hoặc Đã thanh toán Full' });
    }
    await pool.query("UPDATE bookings SET trangThai = 'Đã xác nhận', updated_at = NOW() WHERE id = $1", [req.params.id]);
    await pool.query(
      "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat) VALUES ($1, $2, $3, 'booking_confirmed', $4)",
      [booking.nguoiDungId, 'Đơn đặt sân đã được xác nhận', `Đơn #${req.params.id} đã được admin xác nhận. Vui lòng đến sân đúng giờ.`, req.params.id]
    );
    res.json({ message: 'Xác nhận đơn thành công' });
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
    if (!['Đã cọc', 'Đã thanh toán Full', 'Đã xác nhận'].includes(booking.trangThai)) {
      return res.status(400).json({ error: 'Không thể check-in đơn này' });
    }
    await pool.query("UPDATE bookings SET trangThai = 'Đang sử dụng', updated_at = NOW() WHERE id = $1", [req.params.id]);
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
    if (result.rows[0].trangThai !== 'Đã cọc') {
      return res.status(400).json({ error: 'Chỉ hủy vắng mặt đơn Đã cọc' });
    }
    await pool.query("UPDATE bookings SET trangThai = 'Đã hủy', ghiChu = 'No-show', updated_at = NOW() WHERE id = $1", [req.params.id]);
    res.json({ message: 'Đã hủy vắng mặt, tịch thu cọc' });
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
