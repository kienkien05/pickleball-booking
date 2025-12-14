const express = require('express');
const { query, queryOne } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get user's bookings eligible for review
router.get('/my-bookings', authenticateToken, async (req, res) => {
    try {
        const bookings = await query(`
      SELECT b.id, b.booking_date, 
        c.name as court_name, c.id as court_id,
        ts.start_time, ts.end_time,
        CASE WHEN r.id IS NOT NULL THEN true ELSE false END as has_review
      FROM bookings b
      JOIN courts c ON b.court_id = c.id
      JOIN time_slots ts ON b.slot_id = ts.id
      LEFT JOIN reviews r ON b.id = r.booking_id
      WHERE b.user_id = $1 
        AND b.status_id = (SELECT id FROM booking_statuses WHERE name = 'completed')
      ORDER BY b.booking_date DESC
    `, [req.user.id]);

        res.json(bookings);
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Create review
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { booking_id, rating, comment } = req.body;

        if (!booking_id || !rating) {
            return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
        }

        if (rating < 1 || rating > 5) {
            return res.status(400).json({ error: 'Đánh giá phải từ 1 đến 5 sao' });
        }

        const booking = await queryOne(`
      SELECT b.*, bs.name as status 
      FROM bookings b 
      JOIN booking_statuses bs ON b.status_id = bs.id
      WHERE b.id = $1 AND b.user_id = $2
    `, [booking_id, req.user.id]);

        if (!booking) {
            return res.status(404).json({ error: 'Không tìm thấy đơn đặt sân' });
        }

        if (booking.status !== 'completed') {
            return res.status(400).json({ error: 'Chỉ có thể đánh giá đơn đã hoàn thành' });
        }

        const existingReview = await queryOne('SELECT id FROM reviews WHERE booking_id = $1', [booking_id]);
        if (existingReview) {
            return res.status(400).json({ error: 'Bạn đã đánh giá đơn này rồi' });
        }

        const result = await queryOne(`
      INSERT INTO reviews (user_id, booking_id, court_id, rating, comment)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id
    `, [req.user.id, booking_id, booking.court_id, rating, comment || null]);

        res.status(201).json({ message: 'Đánh giá thành công', reviewId: result.id });
    } catch (error) {
        console.error('Create review error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

module.exports = router;
