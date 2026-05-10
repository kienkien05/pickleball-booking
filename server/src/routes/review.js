const express = require('express');
const { pool } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

// Get reviews by court
router.get('/court/:courtId', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const result = await pool.query(
      `SELECT r.*, u.hoTen as full_name
       FROM reviews r JOIN users u ON r.nguoiDungId = u.id
       WHERE r.sanId = $1 OR r.donDatId IN (SELECT id FROM bookings WHERE sanId = $1)
       ORDER BY r.ngayTao DESC LIMIT $2 OFFSET $3`,
      [req.params.courtId, limit, offset]
    );
    const count = await pool.query(
      "SELECT COUNT(*) FROM reviews WHERE sanId = $1 OR donDatId IN (SELECT id FROM bookings WHERE sanId = $1)",
      [req.params.courtId]
    );
    const avg = await pool.query(
      "SELECT ROUND(COALESCE(AVG(diemSao), 0), 1) as avg FROM reviews WHERE sanId = $1 OR donDatId IN (SELECT id FROM bookings WHERE sanId = $1)",
      [req.params.courtId]
    );
    res.json({
      data: result.rows,
      total: parseInt(count.rows[0].count),
      avgRating: parseFloat(avg.rows[0].avg),
      page: parseInt(page), limit: parseInt(limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create review (supports both booking-level and court-level)
router.post('/', authenticate, async (req, res) => {
  try {
    const { booking_id, rating, comment, courtId } = req.body;
    if (!rating) {
      return res.status(400).json({ error: 'Vui lòng chọn số sao' });
    }

    let donDatId = null;
    if (booking_id && booking_id !== '0') {
      // Booking-level review
      const booking = await pool.query('SELECT * FROM bookings WHERE id = $1 AND nguoiDungId = $2', [booking_id, req.user.id]);
      if (booking.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy đơn đặt sân' });
      if (booking.rows[0].trangThai !== 'Hoàn thành') {
        return res.status(400).json({ error: 'Chỉ đánh giá đơn đã hoàn thành' });
      }
      const existing = await pool.query('SELECT id FROM reviews WHERE donDatId = $1', [booking_id]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Bạn đã đánh giá đơn này rồi' });
      }
      donDatId = booking_id;
    } else if (courtId) {
      // Court-level review: check user hasn't already reviewed this court recently
      const recent = await pool.query(
        'SELECT id FROM reviews WHERE nguoiDungId = $1 AND donDatId IS NULL AND ngayTao > NOW() - INTERVAL \'1 day\'',
        [req.user.id]
      );
      if (recent.rows.length > 0) {
        return res.status(400).json({ error: 'Bạn vừa đánh giá gần đây. Vui lòng đợi 24 giờ.' });
      }
    } else {
      return res.status(400).json({ error: 'Thiếu thông tin đơn đặt sân hoặc sân' });
    }

    const result = await pool.query(
      'INSERT INTO reviews (donDatId, nguoiDungId, diemSao, binhLuan, sanId) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [donDatId, req.user.id, rating, comment || null, courtId || null]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
