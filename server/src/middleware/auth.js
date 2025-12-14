const jwt = require('jsonwebtoken');
const { query, queryOne } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'pickleball-secret-key-2025';

// Generate JWT token
const generateToken = (userId) => {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
};

// Verify token middleware
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({ error: 'Token không hợp lệ' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);

        // Check session
        const session = await queryOne(
            'SELECT * FROM sessions WHERE token = $1 AND expires_at > NOW()',
            [token]
        );

        if (!session) {
            return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn' });
        }

        // Get user with role
        const user = await queryOne(`
      SELECT u.*, r.name as role 
      FROM users u 
      JOIN roles r ON u.role_id = r.id 
      WHERE u.id = $1
    `, [decoded.userId]);

        if (!user) {
            return res.status(401).json({ error: 'Người dùng không tồn tại' });
        }

        if (user.is_locked) {
            return res.status(403).json({ error: 'Tài khoản đã bị khóa' });
        }

        req.user = user;
        req.token = token;
        next();
    } catch (error) {
        return res.status(401).json({ error: 'Token không hợp lệ' });
    }
};

// Check admin role
const requireAdmin = (req, res, next) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Không có quyền truy cập' });
    }
    next();
};

module.exports = { generateToken, authenticateToken, requireAdmin, JWT_SECRET };
