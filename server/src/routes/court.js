const express = require('express');
const { query, queryOne } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get all courts with filters
router.get('/', async (req, res) => {
    try {
        const { search, district, min_price, max_price } = req.query;

        let sql = `
      SELECT c.*, d.name as district_name,
        COALESCE(AVG(r.rating), 0) as avg_rating,
        COUNT(r.id) as review_count
      FROM courts c
      LEFT JOIN districts d ON c.district_id = d.id
      LEFT JOIN reviews r ON c.id = r.court_id
      WHERE c.is_active = true
    `;
        const params = [];
        let paramIndex = 1;

        if (search) {
            sql += ` AND c.name ILIKE $${paramIndex}`;
            params.push(`%${search}%`);
            paramIndex++;
        }

        if (district) {
            sql += ` AND c.district_id = $${paramIndex}`;
            params.push(district);
            paramIndex++;
        }

        if (min_price) {
            sql += ` AND c.price_per_hour >= $${paramIndex}`;
            params.push(min_price);
            paramIndex++;
        }

        if (max_price) {
            sql += ` AND c.price_per_hour <= $${paramIndex}`;
            params.push(max_price);
            paramIndex++;
        }

        sql += ' GROUP BY c.id, d.name ORDER BY c.id';

        const courts = await query(sql, params);
        res.json(courts);
    } catch (error) {
        console.error('Get courts error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Get districts
router.get('/districts', async (req, res) => {
    try {
        const districts = await query('SELECT * FROM districts ORDER BY name');
        res.json(districts);
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Get court by ID
router.get('/:id', async (req, res) => {
    try {
        const court = await queryOne(`
      SELECT c.*, d.name as district_name,
        COALESCE(AVG(r.rating), 0) as avg_rating,
        COUNT(r.id) as review_count
      FROM courts c
      LEFT JOIN districts d ON c.district_id = d.id
      LEFT JOIN reviews r ON c.id = r.court_id
      WHERE c.id = $1
      GROUP BY c.id, d.name
    `, [req.params.id]);

        if (!court) {
            return res.status(404).json({ error: 'Không tìm thấy sân' });
        }

        res.json(court);
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Get available slots for a court on a specific date
router.get('/:id/slots', async (req, res) => {
    try {
        const { date } = req.query;
        const courtId = req.params.id;

        if (!date) {
            return res.status(400).json({ error: 'Vui lòng chọn ngày' });
        }

        const slots = await query(`
      SELECT ts.*, 
        CASE WHEN b.id IS NULL THEN true ELSE false END as available
      FROM time_slots ts
      LEFT JOIN bookings b ON ts.id = b.slot_id 
        AND b.court_id = $1 
        AND b.booking_date = $2
        AND b.status_id NOT IN (SELECT id FROM booking_statuses WHERE name = 'cancelled')
      WHERE ts.court_id = $1 AND ts.is_available = true
      ORDER BY ts.start_time
    `, [courtId, date]);

        res.json(slots);
    } catch (error) {
        console.error('Get slots error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Get court reviews
router.get('/:id/reviews', async (req, res) => {
    try {
        const reviews = await query(`
      SELECT r.*, u.full_name as user_name
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      WHERE r.court_id = $1
      ORDER BY r.created_at DESC
    `, [req.params.id]);

        res.json(reviews);
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

module.exports = router;
