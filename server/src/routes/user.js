const express = require('express');
const bcrypt = require('bcryptjs');
const { pool, query, queryOne } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/users/profile
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const user = await queryOne(`
            SELECT
                u.id, u.email, u.phone, u.full_name,
                u.is_vip, u.cancel_count, u.created_at,
                r.name AS role
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE u.id = $1
        `, [req.user.id]);

        if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

        // Thêm thông tin hữu ích cho client
        const canUseDeposit = user.cancel_count < 3;
        res.json({ ...user, can_use_deposit: canUseDeposit });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// PUT /api/users/profile
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { full_name, phone, current_password, new_password } = req.body;

        if (!full_name) {
            return res.status(400).json({ error: 'Họ tên không được để trống' });
        }

        // Kiểm tra số điện thoại trùng
        if (phone) {
            const existingPhone = await queryOne(
                'SELECT id FROM users WHERE phone = $1 AND id != $2',
                [phone, req.user.id]
            );
            if (existingPhone) {
                return res.status(400).json({ error: 'Số điện thoại đã được sử dụng' });
            }
        }

        // Đổi mật khẩu
        if (new_password) {
            if (!current_password) {
                return res.status(400).json({ error: 'Vui lòng nhập mật khẩu hiện tại' });
            }
            const user = await queryOne('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
            const valid = bcrypt.compareSync(current_password, user.password_hash);
            if (!valid) {
                return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng' });
            }
            const newHash = bcrypt.hashSync(new_password, 10);
            await query(
                'UPDATE users SET full_name=$1, phone=$2, password_hash=$3 WHERE id=$4',
                [full_name, phone || null, newHash, req.user.id]
            );
        } else {
            await query(
                'UPDATE users SET full_name=$1, phone=$2 WHERE id=$3',
                [full_name, phone || null, req.user.id]
            );
        }

        res.json({ message: 'Cập nhật thành công' });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// DELETE /api/users/profile — Xóa tài khoản
router.delete('/profile', authenticateToken, async (req, res) => {
    try {
        const { password } = req.body;
        if (!password) return res.status(400).json({ error: 'Vui lòng nhập mật khẩu để xác nhận' });

        const user = await queryOne('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
        if (!bcrypt.compareSync(password, user.password_hash)) {
            return res.status(400).json({ error: 'Mật khẩu không đúng' });
        }

        await query('DELETE FROM users WHERE id = $1', [req.user.id]);
        res.json({ message: 'Xóa tài khoản thành công' });
    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// GET /api/users/notifications — Danh sách thông báo gần nhất
router.get('/notifications', authenticateToken, async (req, res) => {
    try {
        const [notifications, unread] = await Promise.all([
            pool.query(`
                SELECT id, booking_id, title, message, notification_type, is_read, metadata, created_at
                FROM notifications
                WHERE user_id = $1
                ORDER BY created_at DESC
                LIMIT 30
            `, [req.user.id]),
            pool.query(`
                SELECT COUNT(*)::int AS unread_count
                FROM notifications
                WHERE user_id = $1 AND is_read = false
            `, [req.user.id])
        ]);

        res.json({
            data: notifications.rows,
            unread_count: unread.rows[0]?.unread_count || 0
        });
    } catch (error) {
        console.error('Notifications error:', error);
        res.status(500).json({ error: 'Lỗi server khi lấy thông báo' });
    }
});

// PUT /api/users/notifications/read-all — Đánh dấu tất cả đã đọc
router.put('/notifications/read-all', authenticateToken, async (req, res) => {
    try {
        await pool.query(
            'UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false',
            [req.user.id]
        );
        res.json({ message: 'Đã đánh dấu tất cả thông báo là đã đọc' });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// PUT /api/users/notifications/:id/read — Đánh dấu một thông báo đã đọc
router.put('/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        const result = await pool.query(`
            UPDATE notifications
            SET is_read = true
            WHERE id = $1 AND user_id = $2
            RETURNING id
        `, [req.params.id, req.user.id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy thông báo' });
        }

        res.json({ message: 'Đã đọc thông báo' });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

module.exports = router;
