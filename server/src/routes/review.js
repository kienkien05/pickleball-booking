/**
 * Route đánh giá (Review) - Xem đánh giá theo sân và Tạo đánh giá mới.
 *
 * File này cung cấp API đánh giá cho người dùng:
 *
 * 1. GET /court/:courtId - Lấy danh sách đánh giá của một sân:
 *    - Phân trang (page, limit)
 *    - Kèm tên người đánh giá (full_name)
 *    - Trả về total (tổng số đánh giá), avgRating (điểm trung bình)
 *    - Đánh giá có thể gắn với sân trực tiếp (sanId) hoặc qua đơn đặt (donDatId)
 *
 * 2. POST / - Tạo đánh giá mới:
 *    - Hỗ trợ 2 kiểu đánh giá:
 *      a. Đánh giá theo đơn (booking_id): chỉ đánh giá được đơn đã 'Hoàn thành', mỗi đơn chỉ 1 lần
 *      b. Đánh giá theo sân (courtId): giới hạn 1 lần/24 giờ để chống spam
 *    - Body: { booking_id?, rating (bắt buộc), comment?, courtId? }
 */

const express = require('express');
const { pool } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

/**
 * GET /reviews/court/:courtId - Lấy danh sách đánh giá của một sân.
 *
 * Query params:
 * - page: số trang (mặc định 1)
 * - limit: số lượng mỗi trang (mặc định 20)
 *
 * Trả về:
 * - data: mảng các review [{ id, diemSao, binhLuan, ngayTao, full_name, ... }]
 * - total: tổng số review của sân
 * - avgRating: điểm đánh giá trung bình (làm tròn 1 chữ số thập phân)
 * - page, limit: thông tin phân trang
 *
 * Logic tìm review:
 * - Lấy review có sanId = courtId HOẶC review có donDatId thuộc về sân đó
 *   (vì có review gắn trực tiếp vào sân, có review gắn qua đơn đặt sân)
 * - Sắp xếp theo ngày tạo giảm dần (mới nhất lên trước)
 */
router.get('/court/:courtId', async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    // Lấy review: có thể gắn trực tiếp với sân (sanId) hoặc gián tiếp qua đơn đặt (donDatId -> bookings.sanId)
    const result = await pool.query(
      `SELECT r.*, u.hoTen as full_name
       FROM reviews r JOIN users u ON r.nguoiDungId = u.id
       WHERE r.sanId = $1 OR r.donDatId IN (SELECT id FROM bookings WHERE sanId = $1)
       ORDER BY r.ngayTao DESC LIMIT $2 OFFSET $3`,
      [req.params.courtId, limit, offset]
    );
    // Đếm tổng số review của sân
    const count = await pool.query(
      "SELECT COUNT(*) FROM reviews WHERE sanId = $1 OR donDatId IN (SELECT id FROM bookings WHERE sanId = $1)",
      [req.params.courtId]
    );
    // Tính điểm trung bình
    const avg = await pool.query(
      "SELECT ROUND(COALESCE(AVG(diemSao), 0), 1) as avg FROM reviews WHERE sanId = $1 OR donDatId IN (SELECT id FROM bookings WHERE sanId = $1)",
      [req.params.courtId]
    );
    res.json({
      data: result.rows,
      total: parseInt(count.rows[0].count),
      avgRating: parseFloat(avg.rows[0].avg),
      page: parseInt(page), limit: parseInt(limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /reviews - Tạo đánh giá mới (hỗ trợ cả đánh giá theo đơn và đánh giá theo sân).
 *
 * Body: { booking_id?, rating (bắt buộc, 1-5 sao), comment?, courtId? }
 *
 * 2 kiểu đánh giá:
 *
 * A. Đánh giá theo đơn (có booking_id):
 *    - Kiểm tra đơn tồn tại và thuộc về user hiện tại
 *    - Chỉ đánh giá được đơn đã 'Hoàn thành'
 *    - Mỗi đơn chỉ được đánh giá 1 lần (kiểm tra trùng donDatId)
 *
 * B. Đánh giá theo sân (có courtId, không có booking_id):
 *    - Giới hạn 1 lần/24 giờ để chống spam (kiểm tra review gần nhất của user)
 *    - Đánh giá không gắn với đơn cụ thể (donDatId = NULL)
 *
 * Response: 201 { data: newReview }
 * Yêu cầu: authenticate
 */
router.post('/', authenticate, async (req, res) => {
  try {
    const { booking_id, rating, comment, courtId } = req.body;
    const parsedRating = Number(rating);
    if (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      return res.status(400).json({ error: 'Vui lòng chọn số sao' });
    }

    let donDatId = null;
    let finalCourtId = courtId || null;
    if (booking_id && booking_id !== '0') {
      // ── Đánh giá theo đơn đặt sân ──
      const booking = await pool.query('SELECT * FROM bookings WHERE id = $1 AND nguoiDungId = $2', [booking_id, req.user.id]);
      if (booking.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy đơn đặt sân' });
      // Chỉ cho đánh giá đơn đã hoàn thành
      if (booking.rows[0].trangThai !== 'Hoàn thành') {
        return res.status(400).json({ error: 'Chỉ đánh giá đơn đã hoàn thành' });
      }
      // Mỗi đơn chỉ được đánh giá 1 lần
      const existing = await pool.query('SELECT id FROM reviews WHERE donDatId = $1', [booking_id]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Bạn đã đánh giá đơn này rồi' });
      }
      donDatId = booking_id;
      finalCourtId = booking.rows[0].sanId || booking.rows[0].sanid || null;
    } else if (courtId) {
      // ── Đánh giá trực tiếp sân (không qua đơn) ──
      const court = await pool.query("SELECT id FROM courts WHERE id = $1 AND trangThai != 'Ẩn'", [courtId]);
      if (court.rows.length === 0) {
        return res.status(404).json({ error: 'Không tìm thấy sân để đánh giá' });
      }
      // Giới hạn 1 lần/24 giờ để chống spam đánh giá
      const recent = await pool.query(
        'SELECT id FROM reviews WHERE nguoiDungId = $1 AND donDatId IS NULL AND ngayTao > NOW() - INTERVAL \'1 day\'',
        [req.user.id]
      );
      if (recent.rows.length > 0) {
        return res.status(400).json({ error: 'Bạn vừa đánh giá gần đây. Vui lòng đợi 24 giờ.' });
      }
    } else {
      return res.status(400).json({ error: 'Thiếu thông tin đơn đặt sân hoặc sân' });
    }

    // Lưu review vào database
    const result = await pool.query(
      'INSERT INTO reviews (donDatId, nguoiDungId, diemSao, binhLuan, sanId) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [donDatId, req.user.id, parsedRating, comment || null, finalCourtId]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /reviews/:id - Admin xóa đánh giá để kiểm duyệt spam (Admin only).
 */
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const check = await pool.query('SELECT id FROM reviews WHERE id = $1', [req.params.id]);
    if (check.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy đánh giá' });
    await pool.query('DELETE FROM reviews WHERE id = $1', [req.params.id]);
    res.json({ message: 'Xóa đánh giá thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
