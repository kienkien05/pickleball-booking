const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { normalizeDateString, isSlotInFuture } = require('../services/bookingTime');

// 1. Danh sách sân (có tìm kiếm + lọc)
router.get('/', async (req, res) => {
    try {
        const { search, district, min_price, max_price } = req.query;

        let sql = `
            SELECT c.*, d.name AS district_name,
                   COALESCE(AVG(r.rating), 0) AS avg_rating,
                   COUNT(DISTINCT r.id) AS review_count
            FROM courts c
            LEFT JOIN districts d ON c.district_id = d.id
            LEFT JOIN reviews r   ON c.id = r.court_id
            WHERE c.is_active = true
        `;
        const params = [];
        let idx = 1;

        if (search) {
            sql += ` AND (c.name ILIKE $${idx} OR c.address ILIKE $${idx})`;
            params.push(`%${search}%`);
            idx++;
        }
        if (district) {
            sql += ` AND c.district_id = $${idx}`;
            params.push(district);
            idx++;
        }
        if (min_price) {
            sql += ` AND c.price_per_hour >= $${idx}`;
            params.push(min_price);
            idx++;
        }
        if (max_price) {
            sql += ` AND c.price_per_hour <= $${idx}`;
            params.push(max_price);
            idx++;
        }

        sql += ' GROUP BY c.id, d.name ORDER BY c.id';

        const result = await pool.query(sql, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Lỗi danh sách sân:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// 2. Danh sách quận
router.get('/districts', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM districts ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// 3. Chi tiết sân theo ID
router.get('/:id', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.*, d.name AS district_name,
                   COALESCE(AVG(r.rating), 0) AS avg_rating,
                   COUNT(DISTINCT r.id) AS review_count
            FROM courts c
            LEFT JOIN districts d ON c.district_id = d.id
            LEFT JOIN reviews r   ON c.id = r.court_id
            WHERE c.id = $1
            GROUP BY c.id, d.name
        `, [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy sân' });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// 4. Khung giờ trống theo ngày
//    Trả về tất cả slots + trạng thái available/unavailable
//    Cũng trả về giá ước tính cho mỗi slot dựa vào price_per_hour của sân
router.get('/:id/slots', async (req, res) => {
    try {
        const { date } = req.query;
        const dateStr = normalizeDateString(date);
        const courtId = req.params.id;

        if (!dateStr) {
            return res.status(400).json({ error: 'Vui lòng cung cấp ngày (date)' });
        }

        // Lấy giá sân
        const courtRes = await pool.query(
            'SELECT price_per_hour FROM courts WHERE id = $1 AND is_active = true',
            [courtId]
        );
        if (courtRes.rows.length === 0) {
            return res.status(404).json({ error: 'Sân không tồn tại' });
        }
        const pricePerHour = parseFloat(courtRes.rows[0].price_per_hour);

        // Lấy slots + kiểm tra đã đặt hoặc đã được VIP giữ lịch tự động chưa
        const sql = `
            SELECT
                s.id,
                s.name,
                s.start_time,
                s.end_time,
                s.duration_hours,
                s.price_modifier,
                ROUND((${pricePerHour} * s.duration_hours * s.price_modifier)::numeric) AS estimated_price,
                CASE
                    WHEN EXISTS (
                        SELECT 1
                        FROM bookings b
                        WHERE b.slot_id = s.id
                          AND b.court_id = $1
                          AND b.booking_date = $2::date
                          AND b.status_id NOT IN (
                              SELECT id FROM booking_statuses WHERE LOWER(status_name) = 'cancelled'
                          )
                    ) THEN false
                    WHEN EXISTS (
                        SELECT 1
                        FROM vip_auto_bookings a
                        WHERE a.slot_id = s.id
                          AND a.court_id = $1
                          AND a.target_booking_date = $2::date
                          AND a.status = 'active'
                    ) THEN false
                    ELSE true
                END AS available
            FROM slots s
            ORDER BY s.start_time
        `;

        const result = await pool.query(sql, [courtId, dateStr]);
        const rows = result.rows.map(slot => ({
            ...slot,
            available: Boolean(slot.available) && isSlotInFuture(dateStr, slot.start_time)
        }));

        res.json(rows);
    } catch (error) {
        console.error('Lỗi lấy khung giờ:', error);
        res.status(500).json({ error: 'Lỗi server khi lấy lịch' });
    }
});

// 5. Đánh giá của sân
router.get('/:id/reviews', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT r.*, u.full_name AS user_name, u.is_vip
            FROM reviews r
            LEFT JOIN users u ON r.user_id = u.id
            WHERE r.court_id = $1
            ORDER BY r.created_at DESC
        `, [req.params.id]);
        res.json(result.rows);
    } catch (error) {
        console.log('Lỗi lấy review, trả về rỗng.');
        res.json([]);
    }
});

module.exports = router;
