const express = require('express');
const { pool } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

router.get('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status } = req.query;
    const offset = (page - 1) * limit;
    let query = 'SELECT id, hoTen, email, soDienThoai, vaiTro, isVIP, trangThai, created_at FROM users WHERE 1=1';
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
      })),
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page), limit: parseInt(limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

router.patch('/:id/toggle-vip', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT isVIP FROM users WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    const newVip = !result.rows[0].isVIP;
    await pool.query('UPDATE users SET isVIP = $1 WHERE id = $2', [newVip, req.params.id]);
    res.json({ message: 'Đã thay đổi VIP', data: { isVIP: newVip } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
