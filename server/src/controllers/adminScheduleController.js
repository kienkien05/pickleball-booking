const { pool } = require('../config/database');

/**
 * Controller xử lý logic cho Schedule Board của Admin
 */
const getScheduleBoard = async (req, res) => {
    try {
        const { start_date, end_date, court_id } = req.query;

        // 1. Validation đầu vào
        if (!start_date || !end_date) {
            return res.status(400).json({ 
                error: 'Thiếu tham số start_date hoặc end_date (định dạng YYYY-MM-DD).' 
            });
        }

        // 2. Xây dựng câu truy vấn SQL
        // Sử dụng parameterized query ($1, $2, $3) để chống SQL Injection
        // Sử dụng LEFT JOIN để đảm bảo lấy đủ thông tin ngay cả khi có dữ liệu không đồng nhất
        const query = `
            SELECT 
                b.id AS booking_id, 
                b.court_id, 
                c.name AS court_name, 
                b.slot_id, 
                s.start_time, 
                s.end_time, 
                b.booking_date, 
                u.full_name AS user_name, 
                u.is_vip, 
                b.is_auto_booking
            FROM bookings b
            LEFT JOIN slots s ON b.slot_id = s.id
            LEFT JOIN users u ON b.user_id = u.id
            LEFT JOIN courts c ON b.court_id = c.id
            LEFT JOIN booking_statuses bs ON b.status_id = bs.id
            WHERE LOWER(bs.status_name) != 'cancelled'
              AND b.booking_date >= $1
              AND b.booking_date <= $2
              AND ($3::int IS NULL OR b.court_id = $3)
            ORDER BY b.booking_date ASC, s.start_time ASC, c.name ASC
        `;

        const values = [
            start_date, 
            end_date, 
            (court_id && court_id !== 'null' && court_id !== '') ? parseInt(court_id) : null
        ];

        // 3. Thực thi truy vấn
        const result = await pool.query(query, values);

        // 4. Trả về kết quả
        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });

    } catch (error) {
        console.error('Error fetching schedule board:', error);
        res.status(500).json({ 
            error: 'Lỗi hệ thống khi tải dữ liệu thời khóa biểu.',
            details: error.message 
        });
    }
};

module.exports = {
    getScheduleBoard
};
