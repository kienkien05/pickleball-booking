const express = require('express');
const { query, queryOne } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get payment methods
router.get('/payment-methods/list', async (req, res) => {
    try {
        const methods = await query('SELECT * FROM payment_methods');
        res.json(methods);
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Get user's bookings
router.get('/', authenticateToken, async (req, res) => {
    try {
        const bookings = await query(`
      SELECT b.*, 
        c.name as court_name, c.address as court_address, c.image_url,
        ts.start_time, ts.end_time,
        bs.name as status,
        pm.display_name as payment_method,
        CASE WHEN r.id IS NOT NULL THEN true ELSE false END as has_review
      FROM bookings b
      LEFT JOIN courts c ON b.court_id = c.id
      LEFT JOIN time_slots ts ON b.slot_id = ts.id
      LEFT JOIN booking_statuses bs ON b.status_id = bs.id
      LEFT JOIN payment_methods pm ON b.payment_method_id = pm.id
      LEFT JOIN reviews r ON b.id = r.booking_id
      WHERE b.user_id = $1
      ORDER BY b.booking_date DESC, ts.start_time DESC
    `, [req.user.id]);

        res.json(bookings);
    } catch (error) {
        console.error('Get bookings error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Create booking
router.post('/', authenticateToken, async (req, res) => {
    try {
        const { court_id, slot_id, booking_date, payment_method_id } = req.body;

        if (!court_id || !slot_id || !booking_date || !payment_method_id) {
            return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
        }

        // Check court exists
        const court = await queryOne('SELECT * FROM courts WHERE id = $1 AND is_active = true', [court_id]);
        if (!court) {
            return res.status(404).json({ error: 'Sân không tồn tại' });
        }

        // Check slot exists and belongs to court
        const slot = await queryOne(
            'SELECT * FROM time_slots WHERE id = $1 AND court_id = $2 AND is_available = true',
            [slot_id, court_id]
        );
        if (!slot) {
            return res.status(404).json({ error: 'Khung giờ không hợp lệ' });
        }

        // Check if slot already booked
        const existingBooking = await queryOne(`
      SELECT id FROM bookings 
      WHERE court_id = $1 AND slot_id = $2 AND booking_date = $3
        AND status_id NOT IN (SELECT id FROM booking_statuses WHERE name = 'cancelled')
    `, [court_id, slot_id, booking_date]);

        if (existingBooking) {
            return res.status(400).json({ error: 'Khung giờ này đã được đặt' });
        }

        // Calculate total price (1.5 hours per slot)
        const totalPrice = parseFloat(court.price_per_hour) * 1.5;

        const result = await queryOne(`
      INSERT INTO bookings (user_id, court_id, slot_id, booking_date, payment_method_id, total_price)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [req.user.id, court_id, slot_id, booking_date, payment_method_id, totalPrice]);

        res.status(201).json({ message: 'Đặt sân thành công', bookingId: result.id });
    } catch (error) {
        console.error('Create booking error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Cancel booking
router.put('/:id/cancel', authenticateToken, async (req, res) => {
    try {
        const { reason } = req.body;

        const booking = await queryOne(
            'SELECT b.*, bs.name as status FROM bookings b JOIN booking_statuses bs ON b.status_id = bs.id WHERE b.id = $1 AND b.user_id = $2',
            [req.params.id, req.user.id]
        );

        if (!booking) {
            return res.status(404).json({ error: 'Không tìm thấy đơn đặt sân' });
        }

        if (booking.status === 'cancelled' || booking.status === 'completed') {
            return res.status(400).json({ error: 'Không thể hủy đơn này' });
        }

        const cancelledStatus = await queryOne("SELECT id FROM booking_statuses WHERE name = 'cancelled'");

        await query('UPDATE bookings SET status_id = $1 WHERE id = $2', [cancelledStatus.id, req.params.id]);
        await query(
            'INSERT INTO booking_cancellations (booking_id, reason, cancelled_by) VALUES ($1, $2, $3)',
            [req.params.id, reason || null, req.user.id]
        );

        res.json({ message: 'Hủy đặt sân thành công' });
    } catch (error) {
        console.error('Cancel booking error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

module.exports = router;
