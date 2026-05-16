/**
 * Route quản lý người dùng (Admin only).
 *
 * File này cung cấp các API quản lý người dùng chỉ dành cho Admin:
 *
 * 1. GET / - Lấy danh sách người dùng (phân trang, tìm kiếm, lọc trạng thái):
 *    - Hỗ trợ search theo tên, email, số điện thoại (ILIKE)
 *    - Hỗ trợ lọc theo trạng thái (Active/Locked)
 *    - Kèm thống kê: tổng số booking, số booking hoàn thành, số booking đã hủy
 *    - Trả về dạng { data, total, page, limit }
 *
 * 2. PUT /:id - Cập nhật thông tin người dùng (Admin):
 *    - Cập nhật full_name, phone_number, is_vip, address
 *    - Dùng COALESCE để chỉ cập nhật trường được gửi lên
 *
 * 3. PATCH /:id/toggle-status - Khóa/Mở khóa tài khoản (Admin):
 *    - Nếu đang Active -> đổi thành Locked
 *    - Nếu đang Locked -> đổi thành Active
 *
 * 4. PATCH /:id/toggle-vip - Bật/Tắt trạng thái VIP (Admin):
 *    - Nếu đang VIP -> tắt VIP
 *    - Nếu không VIP -> bật VIP
 *    - Người dùng VIP có đặc quyền tự động đặt lịch hàng tuần
 */

const express = require('express');
const { pool } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

/**
 * GET / - Lấy danh sách người dùng (Admin).
 *
 * Query params: page, limit, search, status
 * Response: { data: [...users], total, page, limit }
 *
 * Mỗi user trong data có thêm thống kê:
 * - totalBookings: tổng số đơn đã đặt
 * - completedBookings: số đơn đã hoàn thành
 * - cancelledBookings: số đơn đã hủy
 */
router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const offset = (page - 1) * limit;
    let query = `SELECT u.id, u.hoTen, u.email, u.soDienThoai, u.vaiTro, u.isVIP, u.trangThai, u.created_at,
      (SELECT COUNT(*) FROM bookings WHERE nguoiDungId = u.id) as totalBookings,
      (SELECT COUNT(*) FROM bookings WHERE nguoiDungId = u.id AND trangThai = 'Hoàn thành') as completedBookings,
      (SELECT COUNT(*) FROM bookings WHERE nguoiDungId = u.id AND trangThai = 'Đã hủy') as cancelledBookings
      FROM users u WHERE 1=1`;
    const params = [];
    let idx = 1;
    if (search) { query += ` AND (hoTen ILIKE $${idx} OR email ILIKE $${idx} OR soDienThoai ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    if (status) { query += ` AND trangThai = $${idx}`; params.push(status); idx++; }
    query += ' ORDER BY created_at DESC';
    query += ` LIMIT $${idx} OFFSET $${idx + 1}`; params.push(limit, offset);
    const result = await pool.query(query, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM users');
    res.json({
      data: result.rows.map(u => ({
        id: String(u.id), full_name: u.hoTen, email: u.email,
        phone_number: u.soDienThoai, role: u.vaiTro === 'Admin' ? 'admin' : 'user',
        is_vip: u.isVIP, is_active: u.trangThai !== 'Locked', trangThai: u.trangThai,
        vaiTro: u.vaiTro, created_at: u.created_at,
        stats: {
          totalBookings: parseInt(u.totalbookings) || 0,
          completedBookings: parseInt(u.completedbookings) || 0,
          cancelledBookings: parseInt(u.cancelledbookings) || 0,
        }
      })),
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page), limit: parseInt(limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /:id - Cập nhật thông tin người dùng (Admin).
 *
 * Body: { full_name?, phone_number?, is_vip?, address? }
 * Response: { message: 'Cập nhật thành công' }
 *
 * Dùng COALESCE để chỉ cập nhật các trường được gửi lên (giữ nguyên nếu không gửi).
 * Luôn cập nhật updated_at = NOW().
 */
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { full_name, phone_number, is_vip, address } = req.body;
    await pool.query(
      'UPDATE users SET hoTen = COALESCE($1, hoTen), soDienThoai = COALESCE($2, soDienThoai), isVIP = COALESCE($3, isVIP), diaChi = COALESCE($4, diaChi), updated_at = NOW() WHERE id = $5',
      [full_name, phone_number, is_vip, address, id]
    );
    res.json({ message: 'Cập nhật thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /:id/toggle-status - Khóa/Mở khóa tài khoản người dùng.
 *
 * Response: { message, data: { trangThai } }
 *
 * - Nếu tài khoản đang Active -> khóa (Locked), người dùng không thể đăng nhập
 * - Nếu tài khoản đang Locked -> mở khóa (Active)
 */
router.patch('/:id/toggle-status', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT trangThai FROM users WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    const newStatus = result.rows[0].trangThai === 'Locked' ? 'Active' : 'Locked';
    await pool.query('UPDATE users SET trangThai = $1 WHERE id = $2', [newStatus, req.params.id]);
    res.json({ message: 'Đã thay đổi trạng thái', data: { trangThai: newStatus } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /:id/toggle-vip - Bật/Tắt trạng thái VIP của người dùng.
 *
 * Response: { message, data: { isVIP } }
 *
 * Người dùng VIP có đặc quyền tự động đặt lịch hàng tuần.
 * Khi bật VIP -> isVIP = true, hệ thống sẽ tự động đặt lịch mỗi thứ 2.
 * Khi tắt VIP -> isVIP = false.
 */
router.patch('/:id/toggle-vip', authenticate, requireAdmin, async (req, res) => {
  try {
    const userId = req.params.id;
    const result = await pool.query('SELECT isVIP FROM users WHERE id = $1', [userId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    const newVip = !result.rows[0].isVIP;
    await pool.query('UPDATE users SET isVIP = $1 WHERE id = $2', [newVip, userId]);

    // Khi bật VIP: tặng voucher ưu đãi 15%, tối đa giảm 200k, hiệu lực 30 ngày
    if (newVip) {
      const vipCode = `VIP-${userId}-${String(Math.floor(1000 + Math.random() * 9000))}`;
      await pool.query(
        `INSERT INTO discounts (code, noiDung, moTa, loaiGiamGia, mucGiamGia, giamToiDa, ngayBatDau, ngayKetThuc, soLuongBanDau, nguoiDungId, trangThai)
         VALUES ($1, $2, $3, 'percentage', 15, 200000, NOW(), NOW() + INTERVAL '30 days', 1, $4, 'Active')`,
        [vipCode, 'Ưu đãi VIP', 'Giảm 15% (tối đa 200k) chào mừng thành viên VIP', userId]
      );

      // Gửi thông báo cho user
      await pool.query(
        `INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao)
         VALUES ($1, $2, $3, 'vip')`,
        [userId, 'Chúc mừng bạn đã trở thành VIP!', `Bạn được tặng mã giảm giá ${vipCode} giảm 15% (tối đa 200k). Mã có hiệu lực trong 30 ngày.`]
      );
    }

    res.json({ message: 'Đã thay đổi VIP', data: { isVIP: newVip } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
