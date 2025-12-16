const express = require('express');
const router = express.Router();
const { pool } = require('../config/database'); // Sử dụng pool chuẩn

// 1. Lấy danh sách sân (Có tìm kiếm + Lọc)
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

        const result = await pool.query(sql, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Lỗi lấy danh sách sân:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// 2. Lấy danh sách quận
router.get('/districts', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM districts ORDER BY name');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// 3. Lấy chi tiết sân theo ID
router.get('/:id', async (req, res) => {
    try {
        const sql = `
            SELECT c.*, d.name as district_name,
            COALESCE(AVG(r.rating), 0) as avg_rating,
            COUNT(r.id) as review_count
            FROM courts c
            LEFT JOIN districts d ON c.district_id = d.id
            LEFT JOIN reviews r ON c.id = r.court_id
            WHERE c.id = $1
            GROUP BY c.id, d.name
        `;
        
        const result = await pool.query(sql, [req.params.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy sân' });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// 4. LẤY KHUNG GIỜ TRỐNG (ĐÂY LÀ PHẦN QUAN TRỌNG NHẤT ĐỂ SỬA LỖI)
router.get('/:id/slots', async (req, res) => {
    try {
        const { date } = req.query;
        const courtId = req.params.id;

        if (!date) {
            return res.status(400).json({ error: 'Vui lòng chọn ngày' });
        }

        // Logic: Lấy tất cả khung giờ từ bảng 'slots'
        // Sau đó kiểm tra xem khung giờ đó đã bị đặt chưa (bảng bookings)
        // Status ID 3 là Cancelled (Hủy), nên nếu status != 3 thì coi như đã đặt
        const sql = `
            SELECT 
                s.id, 
                s.name, 
                s.start_time, 
                s.end_time,
                s.price_modifier,
                CASE 
                    WHEN b.id IS NOT NULL THEN false -- Nếu tìm thấy trong booking -> Hết chỗ (available = false)
                    ELSE true                        -- Ngược lại -> Còn chỗ
                END as available
            FROM slots s
            LEFT JOIN bookings b ON s.id = b.slot_id 
                AND b.court_id = $1 
                AND b.booking_date = $2
                AND b.status_id != 3 -- Trừ những đơn đã hủy ra
            ORDER BY s.start_time
        `;

        const result = await pool.query(sql, [courtId, date]);
        res.json(result.rows);

    } catch (error) {
        console.error('Lỗi lấy khung giờ:', error);
        res.status(500).json({ error: 'Lỗi server khi lấy lịch' });
    }
});

// 5. Lấy đánh giá
router.get('/:id/reviews', async (req, res) => {
    try {
        // Kiểm tra xem bảng reviews có tồn tại không để tránh lỗi
        // Nếu bạn chưa tạo bảng reviews thì trả về rỗng
        const result = await pool.query(`
            SELECT r.*, u.full_name as user_name
            FROM reviews r
            LEFT JOIN users u ON r.user_id = u.id
            WHERE r.court_id = $1
            ORDER BY r.created_at DESC
        `, [req.params.id]);

        res.json(result.rows);
    } catch (error) {
        console.log('Chưa có review hoặc lỗi bảng review, trả về rỗng.');
        res.json([]);
    }
});

module.exports = router;