const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { query, queryOne } = require('../config/database');
const { generateToken, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
    try {
        const { email, phone, password, full_name } = req.body;

        if (!email || !password || !full_name) {
            return res.status(400).json({ error: 'Vui lòng điền đầy đủ thông tin' });
        }

        // Check existing email
        const existingEmail = await queryOne('SELECT id FROM users WHERE email = $1', [email]);
        if (existingEmail) {
            return res.status(400).json({ error: 'Email đã được sử dụng' });
        }

        // Check existing phone
        if (phone) {
            const existingPhone = await queryOne('SELECT id FROM users WHERE phone = $1', [phone]);
            if (existingPhone) {
                return res.status(400).json({ error: 'Số điện thoại đã được sử dụng' });
            }
        }

        const passwordHash = bcrypt.hashSync(password, 10);

        const result = await queryOne(
            'INSERT INTO users (email, phone, password_hash, full_name) VALUES ($1, $2, $3, $4) RETURNING id',
            [email, phone || null, passwordHash, full_name]
        );

        res.status(201).json({ message: 'Đăng ký thành công', userId: result.id });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Vui lòng nhập email và mật khẩu' });
        }

        // Find user by email or phone
        const user = await queryOne(`
      SELECT u.*, r.name as role 
      FROM users u 
      JOIN roles r ON u.role_id = r.id 
      WHERE u.email = $1 OR u.phone = $1
    `, [email]);

        if (!user) {
            return res.status(401).json({ error: 'Thông tin đăng nhập không chính xác' });
        }

        if (user.is_locked) {
            return res.status(403).json({ error: 'Tài khoản đã bị khóa' });
        }

        const validPassword = bcrypt.compareSync(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Thông tin đăng nhập không chính xác' });
        }

        const token = generateToken(user.id);

        // Create session
        await query(
            "INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '7 days')",
            [user.id, token]
        );

        res.json({
            message: 'Đăng nhập thành công',
            token,
            user: {
                id: user.id,
                email: user.email,
                phone: user.phone,
                full_name: user.full_name,
                role: user.role
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Logout
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        await query('DELETE FROM sessions WHERE token = $1', [req.token]);
        res.json({ message: 'Đăng xuất thành công' });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        const user = await queryOne('SELECT id FROM users WHERE email = $1', [email]);
        if (!user) {
            return res.status(404).json({ error: 'Email không tồn tại trong hệ thống' });
        }

        // Generate 6-digit token
        const token = Math.floor(100000 + Math.random() * 900000).toString();

        // Delete old tokens
        await query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);

        // Create new token (expires in 15 minutes)
        await query(
            "INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, NOW() + INTERVAL '15 minutes')",
            [user.id, token]
        );

        // In production, send email here
        console.log(`[DEV] Password reset token for ${email}: ${token}`);

        res.json({
            message: 'Mã xác nhận đã được gửi đến email của bạn',
            dev_token: process.env.NODE_ENV !== 'production' ? token : undefined
        });
    } catch (error) {
        console.error('Forgot password error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Reset password
router.post('/reset-password', async (req, res) => {
    try {
        const { email, token, new_password } = req.body;

        const user = await queryOne('SELECT id FROM users WHERE email = $1', [email]);
        if (!user) {
            return res.status(404).json({ error: 'Email không tồn tại' });
        }

        const resetToken = await queryOne(
            'SELECT * FROM password_reset_tokens WHERE user_id = $1 AND token = $2 AND expires_at > NOW()',
            [user.id, token]
        );

        if (!resetToken) {
            return res.status(400).json({ error: 'Mã xác nhận không hợp lệ hoặc đã hết hạn' });
        }

        const passwordHash = bcrypt.hashSync(new_password, 10);

        await query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, user.id]);
        await query('DELETE FROM password_reset_tokens WHERE user_id = $1', [user.id]);

        res.json({ message: 'Đổi mật khẩu thành công' });
    } catch (error) {
        console.error('Reset password error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

module.exports = router;
