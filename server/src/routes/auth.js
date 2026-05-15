/**
 * Route xác thực người dùng - Đăng ký, Đăng nhập, Quên mật khẩu, Profile.
 *
 * File này quản lý tất cả API liên quan đến xác thực và tài khoản người dùng:
 *
 * 1. POST /register - Đăng ký tài khoản mới:
 *    - Nhận email, password, confirm_password, full_name, phone_number
 *    - Kiểm tra email và số điện thoại chưa được sử dụng
 *    - Tạo OTP 6 số, lưu vào otpStore (Map trong bộ nhớ) với thời hạn 10 phút
 *    - Trong môi trường production nên dùng Redis hoặc DB thay vì Map
 *
 * 2. POST /verify-register - Xác thực OTP và hoàn tất đăng ký:
 *    - Kiểm tra OTP khớp và chưa hết hạn
 *    - Hash mật khẩu bằng bcryptjs (10 vòng salt), tạo user trong DB
 *    - Tặng mã chào mừng (WELCOME + userId) giảm 20% cho lần đầu đặt sân
 *    - Tạo JWT token (hết hạn 7 ngày) và trả về thông tin user + token
 *
 * 3. POST /login - Đăng nhập:
 *    - Tìm user theo email, kiểm tra trạng thái (không bị khóa)
 *    - Dùng bcrypt.compare() để so sánh mật khẩu với hash trong DB
 *    - Tạo JWT token và trả về thông tin user (id, email, full_name, role, is_vip, avatar...)
 *
 * 4. POST /forgot-password - Gửi OTP reset mật khẩu qua email
 * 5. POST /reset-password - Đổi mật khẩu mới sau khi xác thực OTP
 *
 * 6. GET /profile - Lấy thông tin profile người dùng hiện tại (cần authenticate)
 * 7. PUT /profile - Cập nhật profile (full_name, phone_number, address, avatar_url, gender)
 *
 * JWT Secret lấy từ biến môi trường JWT_SECRET, mặc định là 'pickleball_jwt_secret_key_2026'.
 */

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/database');
const { authenticate } = require('../middleware/auth');
const crypto = require('crypto');
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || 'pickleball_jwt_secret_key_2026';

// Store OTPs temporarily (in production, use Redis or DB)
// Bộ nhớ tạm lưu OTP - key: "register:email" hoặc "reset:email", value: { otp, expires, ...data }
// Lưu ý: Map sẽ bị xóa khi server restart, trong production nên dùng Redis
const otpStore = new Map();

/**
 * Sinh mã OTP ngẫu nhiên 6 chữ số.
 * Dùng Math.random() để tạo số từ 100000 đến 999999.
 *
 * @returns {string} Mã OTP 6 chữ số
 */
function generateOTP() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

/**
 * POST /register - Đăng ký tài khoản mới.
 *
 * Body: { email, password, confirm_password, full_name, phone_number? }
 * Response: { message: 'Mã OTP đã được gửi' }
 *
 * Quy trình:
 * 1. Validate dữ liệu đầu vào (bắt buộc email, password, full_name)
 * 2. Kiểm tra password và confirm_password khớp nhau
 * 3. Kiểm tra email và số điện thoại chưa tồn tại trong DB
 * 4. Tạo OTP 6 số, lưu vào otpStore với key "register:{email}", hết hạn sau 10 phút
 * 5. Trả về thông báo thành công (OTP được log ra console thay vì gửi email thật)
 */
router.post('/register', async (req, res) => {
  try {
    const { email, password, confirm_password, full_name, phone_number } = req.body;
    if (!email || !password || !full_name) {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });
    }
    if (password !== confirm_password) {
      return res.status(400).json({ error: 'Mật khẩu xác nhận không khớp' });
    }
    const existingEmail = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existingEmail.rows.length > 0) {
      return res.status(400).json({ error: 'Email đã được sử dụng' });
    }
    if (phone_number) {
      const existingPhone = await pool.query('SELECT id FROM users WHERE soDienThoai = $1', [phone_number]);
      if (existingPhone.rows.length > 0) {
        return res.status(400).json({ error: 'Số điện thoại đã được sử dụng' });
      }
    }
    const otp = generateOTP();
    otpStore.set(`register:${email}`, { otp, password, full_name, phone_number, expires: Date.now() + 10 * 60 * 1000 });
    console.log(`[OTP] Register OTP for ${email}: ${otp}`);
    res.json({ message: 'Mã OTP đã được gửi (kiểm tra console)' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /verify-register - Xác thực OTP và hoàn tất đăng ký.
 *
 * Body: { email, otp, password, full_name }
 * Response: { data: { token, user: { id, email, full_name, phone_number, role, is_vip, is_active } } }
 *
 * Quy trình:
 * 1. Kiểm tra OTP khớp với otpStore và chưa hết hạn
 * 2. Hash mật khẩu bằng bcryptjs (10 vòng salt)
 * 3. INSERT user vào DB
 * 4. Tạo mã chào mừng WELCOME{userId} giảm 20%, hết hạn sau 30 ngày
 * 5. Tạo JWT token (7 ngày) và xóa OTP khỏi otpStore
 * 6. Trả về token + thông tin user
 */
router.post('/verify-register', async (req, res) => {
  try {
    const { email, otp, password, full_name } = req.body;
    const stored = otpStore.get(`register:${email}`);
    if (!stored || stored.otp !== otp || Date.now() > stored.expires) {
      return res.status(400).json({ error: 'Mã OTP không chính xác hoặc đã hết hạn' });
    }
    const hashedPw = await bcrypt.hash(stored.password, 10);
    const result = await pool.query(
      'INSERT INTO users (hoTen, email, matKhau, soDienThoai) VALUES ($1, $2, $3, $4) RETURNING id, hoTen, email, soDienThoai, vaiTro, isVIP, trangThai',
      [stored.full_name, email, hashedPw, stored.phone_number || null]
    );
    const user = result.rows[0];

    // Tặng mã chào mừng 20% cho user mới - mã riêng chỉ user này dùng được
    const welcomeCode = `WELCOME${user.id}`;
    await pool.query(
      `INSERT INTO discounts (code, noiDung, moTa, loaiGiamGia, mucGiamGia, ngayBatDau, ngayKetThuc, soLuongBanDau, nguoiDungId, trangThai)
       VALUES ($1, $2, $3, 'percentage', 20, NOW(), NOW() + INTERVAL '30 days', 1, $4, 'Active')`,
      [welcomeCode, 'Chào mừng thành viên mới!', 'Giảm 20% cho lần đặt sân đầu tiên', user.id]
    );

    const token = jwt.sign({ id: user.id, email: user.email, role: user.vaiTro }, JWT_SECRET, { expiresIn: '7d' });
    otpStore.delete(`register:${email}`);
    res.json({
      data: {
        token,
        user: {
          id: String(user.id), email: user.email, full_name: user.hoTen,
          phone_number: user.soDienThoai, role: user.vaiTro === 'Admin' ? 'admin' : 'user',
          is_vip: user.isVIP, is_active: user.trangThai !== 'Locked',
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /login - Đăng nhập vào hệ thống.
 *
 * Body: { email, password }
 * Response: { data: { token, user: { id, email, full_name, phone_number, role, is_vip, is_active, avatar_url, address, gender } } }
 *
 * Quy trình:
 * 1. Tìm user theo email trong DB
 * 2. Kiểm tra tài khoản không bị khóa (trangThai !== 'Locked')
 * 3. So sánh mật khẩu với hash bằng bcrypt.compare()
 * 4. Tạo JWT token (7 ngày) và trả về thông tin user đầy đủ
 *
 * Lưu ý: Hiện tại login trực tiếp không cần OTP (SKIP_OTP).
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Vui lòng nhập email và mật khẩu' });
    }
    const result = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    }
    const user = result.rows[0];
    if (user.trangThai === 'Locked') {
      return res.status(403).json({ error: 'Tài khoản đã bị khóa. Vui lòng liên hệ Admin' });
    }
    const valid = await bcrypt.compare(password, user.matKhau);
    if (!valid) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    }
    // Direct login (SKIP_OTP for simplicity)
    const token = jwt.sign({ id: user.id, email: user.email, role: user.vaiTro }, JWT_SECRET, { expiresIn: '7d' });
    res.json({
      data: {
        token,
        user: {
          id: String(user.id), email: user.email, full_name: user.hoTen,
          phone_number: user.soDienThoai, role: user.vaiTro === 'Admin' ? 'admin' : 'user',
          is_vip: user.isVIP, is_active: user.trangThai !== 'Locked',
          avatar_url: user.avatar_url, address: user.diachi, gender: user.gioitinh,
        }
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /forgot-password - Gửi OTP để đặt lại mật khẩu.
 *
 * Body: { email }
 * Response: { message: 'Mã OTP đã được gửi' }
 *
 * Kiểm tra email tồn tại trong hệ thống, tạo OTP 6 số và lưu vào otpStore.
 * OTP được log ra console (trong production sẽ gửi qua email thật).
 */
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const result = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Email chưa được đăng ký' });
    }
    const otp = generateOTP();
    otpStore.set(`reset:${email}`, { otp, expires: Date.now() + 10 * 60 * 1000 });
    console.log(`[OTP] Reset password OTP for ${email}: ${otp}`);
    res.json({ message: 'Mã OTP đã được gửi (kiểm tra console)' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /reset-password - Đặt lại mật khẩu mới sau khi xác thực OTP.
 *
 * Body: { email, otp, new_password }
 * Response: { message: 'Đổi mật khẩu thành công' }
 *
 * Quy trình:
 * 1. Kiểm tra OTP khớp và chưa hết hạn
 * 2. Hash mật khẩu mới bằng bcryptjs
 * 3. UPDATE mật khẩu trong DB
 * 4. Xóa OTP khỏi otpStore
 */
router.post('/reset-password', async (req, res) => {
  try {
    const { email, otp, new_password } = req.body;
    const stored = otpStore.get(`reset:${email}`);
    if (!stored || stored.otp !== otp || Date.now() > stored.expires) {
      return res.status(400).json({ error: 'Mã OTP không chính xác hoặc đã hết hạn' });
    }
    const hashedPw = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET matKhau = $1 WHERE email = $2', [hashedPw, email]);
    otpStore.delete(`reset:${email}`);
    res.json({ message: 'Đổi mật khẩu thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /profile - Lấy thông tin profile của người dùng hiện tại.
 * Yêu cầu: authenticate middleware (phải có token hợp lệ)
 *
 * Response: { data: { id, email, full_name, phone_number, role, is_vip, gender, address, avatar_url, is_active } }
 */
router.get('/profile', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query('SELECT id, hoTen, email, soDienThoai, vaiTro, isVIP, gioiTinh, diaChi, avatar_url, trangThai FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    const u = result.rows[0];
    res.json({
      data: {
        id: String(u.id), email: u.email, full_name: u.hoTen, phone_number: u.soDienThoai,
        role: u.vaiTro === 'Admin' ? 'admin' : 'user', is_vip: u.isVIP,
        gender: u.gioitinh, address: u.diachi, avatar_url: u.avatar_url,
        is_active: u.trangThai !== 'Locked',
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /profile - Cập nhật thông tin profile người dùng.
 * Yêu cầu: authenticate middleware
 *
 * Body: { full_name?, phone_number?, address?, avatar_url?, gender? }
 * - Chỉ cập nhật các trường được gửi lên (dùng COALESCE hoặc build query động)
 * - Nếu không có thay đổi nào -> trả về message 'Không có thay đổi'
 *
 * Response: { data: { id, email, full_name, phone_number, role, is_vip, gender, address, avatar_url } }
 */
router.put('/profile', authenticate, async (req, res) => {
  try {
    const { full_name, phone_number, address, avatar_url, gender } = req.body;
    const fields = [];
    const values = [];
    let idx = 1;
    if (full_name !== undefined) { fields.push(`hoTen = $${idx++}`); values.push(full_name); }
    if (phone_number !== undefined) { fields.push(`soDienThoai = $${idx++}`); values.push(phone_number); }
    if (address !== undefined) { fields.push(`diaChi = $${idx++}`); values.push(address); }
    if (avatar_url !== undefined) { fields.push(`avatar_url = $${idx++}`); values.push(avatar_url); }
    if (gender !== undefined) { fields.push(`gioiTinh = $${idx++}`); values.push(gender); }
    if (fields.length === 0) return res.json({ message: 'Không có thay đổi' });
    fields.push(`updated_at = NOW()`);
    values.push(req.user.id);
    const result = await pool.query(`UPDATE users SET ${fields.join(', ')} WHERE id = $${idx} RETURNING id, hoTen, email, soDienThoai, vaiTro, isVIP, gioiTinh, diaChi, avatar_url, trangThai`, values);
    const u = result.rows[0];
    res.json({
      data: {
        id: String(u.id), email: u.email, full_name: u.hoTen, phone_number: u.soDienThoai,
        role: u.vaiTro === 'Admin' ? 'admin' : 'user', is_vip: u.isVIP,
        gender: u.gioitinh, address: u.diachi, avatar_url: u.avatar_url,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
