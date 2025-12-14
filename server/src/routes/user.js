const express = require('express');
const bcrypt = require('bcryptjs');
const { query, queryOne } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Get profile
router.get('/profile', authenticateToken, async (req, res) => {
    try {
        const user = await queryOne(`
      SELECT id, email, phone, full_name, created_at 
      FROM users WHERE id = $1
    `, [req.user.id]);

        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Update profile
router.put('/profile', authenticateToken, async (req, res) => {
    try {
        const { full_name, phone, current_password, new_password } = req.body;

        if (!full_name) {
            return res.status(400).json({ error: 'Họ tên không được để trống' });
        }

        // Check phone uniqueness
        if (phone) {
            const existingPhone = await queryOne(
                'SELECT id FROM users WHERE phone = $1 AND id != $2',
                [phone, req.user.id]
            );
            if (existingPhone) {
                return res.status(400).json({ error: 'Số điện thoại đã được sử dụng' });
            }
        }

        // Handle password change
        if (new_password) {
            if (!current_password) {
                return res.status(400).json({ error: 'Vui lòng nhập mật khẩu hiện tại' });
            }

            const user = await queryOne('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
            const validPassword = bcrypt.compareSync(current_password, user.password_hash);

            if (!validPassword) {
                return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng' });
            }

            const newPasswordHash = bcrypt.hashSync(new_password, 10);
            await query(
                'UPDATE users SET full_name = $1, phone = $2, password_hash = $3 WHERE id = $4',
                [full_name, phone || null, newPasswordHash, req.user.id]
            );
        } else {
            await query(
                'UPDATE users SET full_name = $1, phone = $2 WHERE id = $3',
                [full_name, phone || null, req.user.id]
            );
        }

        res.json({ message: 'Cập nhật thành công' });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Delete account
router.delete('/profile', authenticateToken, async (req, res) => {
    try {
        const { password } = req.body;

        if (!password) {
            return res.status(400).json({ error: 'Vui lòng nhập mật khẩu' });
        }

        const user = await queryOne('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
        const validPassword = bcrypt.compareSync(password, user.password_hash);

        if (!validPassword) {
            return res.status(400).json({ error: 'Mật khẩu không đúng' });
        }

        await query('DELETE FROM users WHERE id = $1', [req.user.id]);

        res.json({ message: 'Xóa tài khoản thành công' });
    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

module.exports = router;
