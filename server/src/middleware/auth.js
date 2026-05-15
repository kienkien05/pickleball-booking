/**
 * Middleware xác thực và phân quyền cho hệ thống Pickleball.
 *
 * File này cung cấp 2 middleware chính:
 * 1. authenticate: xác thực người dùng qua JWT token
 *    - Kiểm tra header Authorization có bắt đầu bằng 'Bearer ' không
 *    - Giải mã token bằng JWT_SECRET để lấy thông tin user (id, email, role)
 *    - Gán thông tin user vào req.user để các route sau sử dụng
 *    - Nếu token không hợp lệ hoặc hết hạn -> trả về 401
 *
 * 2. requireAdmin: kiểm tra quyền admin
 *    - Phải chạy sau authenticate (cần req.user)
 *    - Kiểm tra role/vaiTro của user có phải Admin không
 *    - Nếu không phải admin -> trả về 403 Forbidden
 *
 * Cách sử dụng trong route:
 *   router.get('/protected', authenticate, (req, res) => { ... })
 *   router.get('/admin-only', authenticate, requireAdmin, (req, res) => { ... })
 */

const jwt = require('jsonwebtoken');

/**
 * Middleware xác thực người dùng bằng JWT (JSON Web Token).
 *
 * Cách hoạt động:
 * 1. Đọc header Authorization từ request (vd: "Bearer abc123...")
 * 2. Nếu không có header hoặc không đúng format -> trả về 401 "Token không tồn tại"
 * 3. Dùng jwt.verify() để giải mã token với JWT_SECRET (từ biến môi trường hoặc giá trị mặc định)
 * 4. Nếu token hợp lệ -> gán thông tin đã giải mã vào req.user và gọi next() để tiếp tục
 * 5. Nếu token không hợp lệ hoặc hết hạn -> trả về 401
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token không tồn tại' });
  }
  try {
    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'pickleball_jwt_secret_key_2026');
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token không hợp lệ hoặc đã hết hạn' });
  }
}

/**
 * Middleware kiểm tra quyền Admin - phải chạy SAU authenticate.
 *
 * Cách hoạt động:
 * 1. Kiểm tra req.user.role hoặc req.user.vaiTro có phải 'admin' hoặc 'Admin' không
 * 2. Nếu không có quyền admin -> trả về 403 "Không có quyền truy cập"
 * 3. Nếu là admin -> gọi next() cho phép truy cập route
 *
 * @param {Object} req - Express request object (phải có req.user từ authenticate)
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin' && req.user?.role !== 'Admin' && req.user?.vaiTro !== 'Admin') {
    return res.status(403).json({ error: 'Không có quyền truy cập' });
  }
  next();
}

module.exports = { authenticate, requireAdmin };
