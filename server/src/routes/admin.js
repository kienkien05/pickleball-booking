const express = require('express');
const { query, queryOne } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// Apply middleware to all routes
router.use(authenticateToken);
router.use(requireAdmin);

// Get all bookings (admin)
router.get('/bookings', async (req, res) => {
    try {
        const { status } = req.query;

        let sql = `
      SELECT b.*, 
        c.name as court_name,
        ts.start_time, ts.end_time,
        bs.name as status,
        u.full_name as user_name, u.email as user_email
      FROM bookings b
      LEFT JOIN courts c ON b.court_id = c.id
      LEFT JOIN time_slots ts ON b.slot_id = ts.id
      LEFT JOIN booking_statuses bs ON b.status_id = bs.id
      LEFT JOIN users u ON b.user_id = u.id
    `;
        const params = [];

        if (status) {
            sql += ' WHERE bs.name = $1';
            params.push(status);
        }

        sql += ' ORDER BY b.created_at DESC';

        const bookings = await query(sql, params);
        res.json(bookings);
    } catch (error) {
        console.error('Get bookings error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Update booking status
router.put('/bookings/:id', async (req, res) => {
    try {
        const { action, reason } = req.body;

        const statusMap = {
            'confirm': 'confirmed',
            'complete': 'completed',
            'cancel': 'cancelled'
        };

        if (!statusMap[action]) {
            return res.status(400).json({ error: 'Hành động không hợp lệ' });
        }

        const newStatus = await queryOne("SELECT id FROM booking_statuses WHERE name = $1", [statusMap[action]]);
        await query('UPDATE bookings SET status_id = $1 WHERE id = $2', [newStatus.id, req.params.id]);

        if (action === 'cancel' && reason) {
            await query(
                'INSERT INTO booking_cancellations (booking_id, reason, cancelled_by) VALUES ($1, $2, $3)',
                [req.params.id, reason, req.user.id]
            );
        }

        res.json({ message: 'Cập nhật thành công' });
    } catch (error) {
        console.error('Update booking error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Get revenue report
router.get('/revenue', async (req, res) => {
    try {
        const completedStatusId = await queryOne("SELECT id FROM booking_statuses WHERE name = 'completed'");
        const confirmedStatusId = await queryOne("SELECT id FROM booking_statuses WHERE name = 'confirmed'");
        const cancelledStatusId = await queryOne("SELECT id FROM booking_statuses WHERE name = 'cancelled'");
        const pendingStatusId = await queryOne("SELECT id FROM booking_statuses WHERE name = 'pending'");

        // Total revenue (completed + confirmed)
        const totalResult = await queryOne(`
      SELECT COALESCE(SUM(total_price), 0) as total 
      FROM bookings 
      WHERE status_id IN ($1, $2)
    `, [completedStatusId.id, confirmedStatusId.id]);

        // Revenue by court
        const revenueByCourt = await query(`
      SELECT c.name as court_name, COUNT(b.id) as booking_count, COALESCE(SUM(b.total_price), 0) as revenue
      FROM courts c
      LEFT JOIN bookings b ON c.id = b.court_id AND b.status_id IN ($1, $2)
      GROUP BY c.id, c.name
      ORDER BY revenue DESC
    `, [completedStatusId.id, confirmedStatusId.id]);

        // Revenue by month
        const revenueByMonth = await query(`
      SELECT TO_CHAR(booking_date, 'YYYY-MM') as month, COALESCE(SUM(total_price), 0) as revenue
      FROM bookings
      WHERE status_id IN ($1, $2)
      GROUP BY TO_CHAR(booking_date, 'YYYY-MM')
      ORDER BY month DESC
      LIMIT 12
    `, [completedStatusId.id, confirmedStatusId.id]);

        // Booking stats
        const bookingStats = {
            total: (await queryOne('SELECT COUNT(*) as count FROM bookings')).count,
            pending: (await queryOne('SELECT COUNT(*) as count FROM bookings WHERE status_id = $1', [pendingStatusId.id])).count,
            confirmed: (await queryOne('SELECT COUNT(*) as count FROM bookings WHERE status_id = $1', [confirmedStatusId.id])).count,
            completed: (await queryOne('SELECT COUNT(*) as count FROM bookings WHERE status_id = $1', [completedStatusId.id])).count,
            cancelled: (await queryOne('SELECT COUNT(*) as count FROM bookings WHERE status_id = $1', [cancelledStatusId.id])).count
        };

        res.json({
            totalRevenue: totalResult.total,
            revenueByCourt,
            revenueByMonth,
            bookingStats
        });
    } catch (error) {
        console.error('Revenue error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Get all customers
router.get('/customers', async (req, res) => {
    try {
        const customers = await query(`
      SELECT u.id, u.email, u.phone, u.full_name, u.is_locked, u.created_at,
        COUNT(b.id) as booking_count
      FROM users u
      LEFT JOIN bookings b ON u.id = b.user_id
      WHERE u.role_id = (SELECT id FROM roles WHERE name = 'user')
      GROUP BY u.id
      ORDER BY u.created_at DESC
    `);

        res.json(customers);
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Lock/unlock customer
router.put('/customers/:id/lock', async (req, res) => {
    try {
        const user = await queryOne('SELECT is_locked FROM users WHERE id = $1', [req.params.id]);
        if (!user) {
            return res.status(404).json({ error: 'Không tìm thấy người dùng' });
        }

        await query('UPDATE users SET is_locked = $1 WHERE id = $2', [!user.is_locked, req.params.id]);

        // Delete sessions if locking
        if (!user.is_locked) {
            await query('DELETE FROM sessions WHERE user_id = $1', [req.params.id]);
        }

        res.json({ message: user.is_locked ? 'Đã mở khóa tài khoản' : 'Đã khóa tài khoản' });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Delete customer
router.delete('/customers/:id', async (req, res) => {
    try {
        await query('DELETE FROM users WHERE id = $1', [req.params.id]);
        res.json({ message: 'Đã xóa tài khoản' });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Add court
router.post('/courts', async (req, res) => {
    try {
        const { name, address, district_id, price_per_hour, description, image_url } = req.body;

        const result = await queryOne(`
      INSERT INTO courts (name, address, district_id, price_per_hour, description, image_url)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id
    `, [name, address, district_id, price_per_hour, description, image_url]);

        // Create default time slots
        const timeSlots = [
            ['06:00', '07:30'], ['07:30', '09:00'], ['09:00', '10:30'],
            ['14:00', '15:30'], ['15:30', '17:00'], ['17:00', '18:30'],
            ['18:30', '20:00'], ['20:00', '21:30']
        ];

        for (const [start, end] of timeSlots) {
            await query(
                'INSERT INTO time_slots (court_id, start_time, end_time) VALUES ($1, $2, $3)',
                [result.id, start, end]
            );
        }

        res.status(201).json({ message: 'Thêm sân thành công', courtId: result.id });
    } catch (error) {
        console.error('Add court error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Update court
router.put('/courts/:id', async (req, res) => {
    try {
        const { name, address, district_id, price_per_hour, description, image_url } = req.body;

        await query(`
      UPDATE courts SET name = $1, address = $2, district_id = $3, price_per_hour = $4, description = $5, image_url = $6
      WHERE id = $7
    `, [name, address, district_id, price_per_hour, description, image_url, req.params.id]);

        res.json({ message: 'Cập nhật sân thành công' });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Delete court
router.delete('/courts/:id', async (req, res) => {
    try {
        await query('DELETE FROM courts WHERE id = $1', [req.params.id]);
        res.json({ message: 'Xóa sân thành công' });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Update time slots
router.put('/courts/:id/slots', async (req, res) => {
    try {
        const { slots } = req.body;

        for (const slot of slots) {
            await query(
                'UPDATE time_slots SET is_available = $1 WHERE id = $2 AND court_id = $3',
                [slot.is_available, slot.id, req.params.id]
            );
        }

        res.json({ message: 'Cập nhật khung giờ thành công' });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

module.exports = router;
