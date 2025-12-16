const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Áp dụng bảo mật cho toàn bộ API Admin
router.use(authenticateToken);
router.use(requireAdmin);

// ==========================================
// 1. QUẢN LÝ ĐẶT SÂN (LẤY DANH SÁCH)
// ==========================================
router.get('/bookings', async (req, res) => {
    try {
        const { status } = req.query;

        let sql = `
            SELECT b.*, 
                c.name as court_name,
                s.name as slot_name,
                s.start_time, s.end_time,
                LOWER(bs.status_name) as status, 
                u.full_name as user_name, u.email as user_email
            FROM bookings b
            LEFT JOIN courts c ON b.court_id = c.id
            LEFT JOIN slots s ON b.slot_id = s.id
            LEFT JOIN booking_statuses bs ON b.status_id = bs.id
            LEFT JOIN users u ON b.user_id = u.id
        `;
        
        const params = [];
        if (status) {
            sql += ' WHERE LOWER(bs.status_name) = LOWER($1)';
            params.push(status);
        }

        sql += ' ORDER BY b.created_at DESC';

        const result = await pool.query(sql, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Lỗi lấy danh sách:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// ==========================================
// 2. XÁC NHẬN / HỦY ĐƠN / HOÀN THÀNH
// ==========================================
router.put('/bookings/:id', async (req, res) => {
    try {
        const { action, reason } = req.body;

        let targetStatusName = '';
        if (action === 'confirm') targetStatusName = 'Confirmed';
        else if (action === 'complete') targetStatusName = 'Completed';
        else if (action === 'cancel') targetStatusName = 'Cancelled';
        else return res.status(400).json({ error: 'Hành động không hợp lệ' });

        const statusRes = await pool.query(
            "SELECT id FROM booking_statuses WHERE status_name ILIKE $1", 
            [targetStatusName]
        );
        
        if (statusRes.rows.length === 0) {
            return res.status(500).json({ error: `Trạng thái ${targetStatusName} chưa có trong DB` });
        }

        const newStatusId = statusRes.rows[0].id;

        await pool.query('UPDATE bookings SET status_id = $1 WHERE id = $2', [newStatusId, req.params.id]);

        if (action === 'cancel' && reason) {
            try {
                await pool.query(
                    'INSERT INTO booking_cancellations (booking_id, reason, cancelled_by) VALUES ($1, $2, $3)',
                    [req.params.id, reason, req.user.id]
                );
            } catch (err) {
                console.log('Bỏ qua lỗi log hủy');
            }
        }

        res.json({ message: 'Cập nhật thành công' });
    } catch (error) {
        console.error('Lỗi cập nhật:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// ==========================================
// 3. BÁO CÁO DOANH THU
// ==========================================
router.get('/revenue', async (req, res) => {
    try {
        const statusRes = await pool.query("SELECT id, status_name FROM booking_statuses");
        const getId = (name) => {
            const found = statusRes.rows.find(s => s.status_name.toLowerCase() === name.toLowerCase());
            return found ? found.id : null;
        };

        const pendingId = getId('pending') || 1;
        const confirmedId = getId('confirmed') || 2;
        const cancelledId = getId('cancelled') || 3;
        const completedId = getId('completed') || 4;

        const totalRes = await pool.query(`
            SELECT COALESCE(SUM(total_price), 0) as total 
            FROM bookings 
            WHERE status_id IN ($1, $2)
        `, [confirmedId, completedId]);

        const revenueByCourt = await pool.query(`
            SELECT c.name as court_name, 
                   COUNT(b.id) as booking_count, 
                   COALESCE(SUM(b.total_price), 0) as revenue
            FROM courts c
            LEFT JOIN bookings b ON c.id = b.court_id 
                AND b.status_id IN ($1, $2)
            GROUP BY c.id, c.name
            ORDER BY revenue DESC
        `, [confirmedId, completedId]);

        const revenueByMonth = await pool.query(`
            SELECT TO_CHAR(booking_date, 'YYYY-MM') as month, 
                   COALESCE(SUM(total_price), 0) as revenue
            FROM bookings
            WHERE status_id IN ($1, $2)
            GROUP BY TO_CHAR(booking_date, 'YYYY-MM')
            ORDER BY month DESC
            LIMIT 12
        `, [confirmedId, completedId]);

        const statsRes = await pool.query(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status_id = $1 THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status_id = $2 THEN 1 ELSE 0 END) as confirmed,
                SUM(CASE WHEN status_id = $3 THEN 1 ELSE 0 END) as cancelled,
                SUM(CASE WHEN status_id = $4 THEN 1 ELSE 0 END) as completed
            FROM bookings
        `, [pendingId, confirmedId, cancelledId, completedId]);

        const stats = statsRes.rows[0];

        res.json({
            totalRevenue: totalRes.rows[0].total,
            revenueByCourt: revenueByCourt.rows,
            revenueByMonth: revenueByMonth.rows,
            bookingStats: {
                total: parseInt(stats.total) || 0,
                pending: parseInt(stats.pending) || 0,
                confirmed: parseInt(stats.confirmed) || 0,
                completed: parseInt(stats.completed) || 0,
                cancelled: parseInt(stats.cancelled) || 0
            }
        });
    } catch (error) {
        console.error('Lỗi doanh thu:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// ==========================================
// 4. QUẢN LÝ KHÁCH HÀNG & SÂN BÃI
// ==========================================

// PUT (Cập nhật sân) - Fix lỗi Unexpected token
router.put('/courts/:id', async (req, res) => {
    try {
        const { name, address, district_id, price_per_hour, description, image_url } = req.body;
        const courtId = req.params.id;

        const sql = `
            UPDATE courts 
            SET name = $1, address = $2, district_id = $3, price_per_hour = $4, description = $5, image_url = $6
            WHERE id = $7
        `;
        const values = [name, address, district_id, price_per_hour, description, image_url, courtId];
        
        await pool.query(sql, values);
        res.json({ message: 'Cập nhật sân thành công' });
    } catch (error) {
        console.error('Lỗi cập nhật sân:', error);
        res.status(500).json({ error: 'Lỗi server khi cập nhật sân' });
    }
});

router.get('/customers', async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM users WHERE role_id = (SELECT id FROM roles WHERE name = 'user')");
        res.json(result.rows);
    } catch (error) { res.status(500).json({ error: 'Lỗi' }); }
});

router.post('/courts', async (req, res) => {
    try {
        const { name, address, district_id, price_per_hour, description, image_url } = req.body;
        await pool.query(
            "INSERT INTO courts (name, address, district_id, price_per_hour, description, image_url) VALUES ($1, $2, $3, $4, $5, $6)",
            [name, address, district_id, price_per_hour, description, image_url]
        );
        res.status(201).json({ message: 'Thêm sân thành công' });
    } catch (error) { res.status(500).json({ error: 'Lỗi' }); }
});

router.delete('/courts/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM courts WHERE id = $1', [req.params.id]);
        res.json({ message: 'Xóa sân thành công' });
    } catch (error) { res.status(500).json({ error: 'Lỗi' }); }
});

// ==========================================
// 5. QUẢN LÝ KHUNG GIỜ (ĐÃ FIX HOÀN CHỈNH)
// ==========================================

// 5.1 Lấy danh sách khung giờ (GET)
// Fix: Lấy dữ liệu thực tế từ DB, nếu null thì mặc định true
router.get('/courts/:id/slots', async (req, res) => {
    try {
        // SELECT * để lấy cả cột is_available
        const result = await pool.query('SELECT * FROM slots ORDER BY start_time');
        
        const slots = result.rows.map(slot => ({
            ...slot,
            // Nếu DB có giá trị thì dùng, nếu null/undefined thì mặc định là true
            is_available: (slot.is_available === undefined || slot.is_available === null) ? true : slot.is_available
        }));
        
        res.json(slots);
    } catch (error) {
        console.error('Lỗi lấy khung giờ:', error);
        res.status(500).json({ error: 'Lỗi server: ' + error.message });
    }
});

// 5.2 Cập nhật khung giờ (PUT)
// Fix: Chỉ update trạng thái is_available, dùng Transaction an toàn
router.put('/courts/:id/slots', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN'); // Bắt đầu Transaction

        const { slots } = req.body; 

        // 1. Kiểm tra dữ liệu gửi lên
        if (!slots || !Array.isArray(slots)) {
            return res.status(400).json({ error: 'Dữ liệu slots không hợp lệ' });
        }

        // 2. Duyệt qua danh sách slots và CHỈ UPDATE trường is_available
        for (const slot of slots) {
            // Đảm bảo chỉ update nếu có id và is_available
            if (slot.id && slot.is_available !== undefined) {
                 await client.query(
                    'UPDATE slots SET is_available = $1 WHERE id = $2',
                    [slot.is_available, slot.id]
                );
            }
        }

        await client.query('COMMIT'); // Hoàn thành Transaction
        res.json({ message: 'Cập nhật khung giờ thành công' });

    } catch (error) {
        await client.query('ROLLBACK'); // Hoàn tác nếu có lỗi
        console.error('Lỗi PUT slots:', error);
        res.status(500).json({ error: 'Lỗi server khi cập nhật khung giờ' });
    } finally {
        client.release();
    }
});

module.exports = router;