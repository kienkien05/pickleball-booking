/**
 * Route quản lý sân Pickleball và khung giờ.
 *
 * File này cung cấp API cho cả user và admin:
 *
 * == API cho User (không cần đăng nhập) ==
 * 1. GET / - Lấy danh sách sân (phân trang, tìm kiếm, lọc trạng thái):
 *    - Kèm avgRating (điểm đánh giá trung bình), reviewCount (số đánh giá), slotCount (số khung giờ)
 *    - User thường không thấy sân có trạng thái 'Ẩn'
 *
 * 2. GET /:id - Chi tiết sân:
 *    - Kèm danh sách ảnh (court_images), điểm đánh giá trung bình, số đánh giá
 *
 * 3. GET /:id/timeslots - Lấy khung giờ của sân theo ngày:
 *    - Trả về danh sách khung giờ kèm trạng thái đã đặt (isBooked) hay chưa
 *    - Tự động chặn các khung giờ đã qua (dựa trên BOOKING_LOCK_THRESHOLD_MINS)
 *    - Nếu sân có trạng thái 'Ẩn' -> trả về mảng rỗng
 *
 * == API cho Admin (cần authenticate + requireAdmin) ==
 * 4. GET /:id/timeslots/all - Lấy tất cả khung giờ của sân (không cần ngày)
 * 5. POST /:id/timeslots - Tạo khung giờ mới cho sân (kiểm tra trùng lặp)
 * 6. PUT /:courtId/timeslots/:id - Cập nhật khung giờ
 * 7. DELETE /:courtId/timeslots/:id - Xóa khung giờ
 * 8. POST / - Tạo sân mới (kiểm tra trùng tên)
 * 9. PUT /:id - Cập nhật thông tin sân
 * 10. DELETE /:id - Xóa mềm sân (đặt trạng thái 'Ẩn')
 * 11. DELETE /:courtId/images/:imageId - Xóa ảnh sân
 * 12. PUT /:courtId/images/:imageId/main - Đặt ảnh chính cho sân
 */

const express = require('express');
const { pool } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

function formatDateLocal(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * GET / - Lấy danh sách sân Pickleball.
 *
 * Query params:
 * - page, limit: phân trang
 * - search: tìm kiếm theo tên sân (ILIKE)
 * - status: lọc theo trạng thái
 * - isAdmin: nếu 'true' thì hiển thị cả sân ẩn, nếu không thì ẩn sân có trạng thái 'Ẩn'
 *
 * Mỗi sân kèm theo: avgRating, reviewCount, slotCount (tính từ subquery).
 */
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, isAdmin } = req.query;
    const offset = (page - 1) * limit;

    let query = `SELECT c.*,
      CAST((SELECT ROUND(COALESCE(AVG(diemSao), 0), 1) FROM reviews WHERE sanId = c.id OR donDatId IN (SELECT id FROM bookings WHERE sanId = c.id)) AS FLOAT) as "avgRating",
      CAST((SELECT COUNT(*) FROM reviews WHERE sanId = c.id OR donDatId IN (SELECT id FROM bookings WHERE sanId = c.id)) AS INTEGER) as "reviewCount",
      CAST((SELECT COUNT(*) FROM timeslots WHERE sanId = c.id) AS INTEGER) as "slotCount"
      FROM courts c WHERE 1=1`;

    const params = [];
    let idx = 1;

    // Nếu không phải admin thì mặc định ẩn các sân có trạng thái 'Ẩn'
    if (isAdmin !== 'true') {
      query += ` AND c.trangThai != 'Ẩn'`;
    }

    if (search) { query += ` AND c.tenSan ILIKE $${idx}`; params.push(`%${search}%`); idx++; }
    if (status) { query += ` AND c.trangThai = $${idx}`; params.push(status); idx++; }

    query += ' ORDER BY c.created_at DESC';
    query += ` LIMIT $${idx} OFFSET $${idx + 1}`; params.push(limit, offset);

    const result = await pool.query(query, params);
    const countResult = await pool.query('SELECT COUNT(*) FROM courts');
    res.json({
      data: result.rows,
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page), limit: parseInt(limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /:id - Lấy thông tin chi tiết của một sân.
 *
 * Response: { data: { ...court, images, avgRating, reviewCount } }
 * - images: danh sách ảnh của sân (sắp xếp ảnh chính trước)
 * - avgRating: điểm đánh giá trung bình (làm tròn 1 chữ số thập phân)
 * - reviewCount: tổng số lượt đánh giá
 */
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM courts WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy sân' });
    const images = await pool.query('SELECT * FROM court_images WHERE sanId = $1 ORDER BY isMain DESC, created_at ASC', [req.params.id]);
    const avgRating = await pool.query(
      'SELECT ROUND(COALESCE(AVG(diemSao), 0), 1) as avg FROM reviews WHERE sanId = $1 OR donDatId IN (SELECT id FROM bookings WHERE sanId = $1)',
      [req.params.id]
    );
    const reviewCount = await pool.query(
      'SELECT COUNT(*) FROM reviews WHERE sanId = $1 OR donDatId IN (SELECT id FROM bookings WHERE sanId = $1)',
      [req.params.id]
    );
    res.json({
      data: {
        ...result.rows[0],
        images: images.rows,
        avgRating: parseFloat(avgRating.rows[0].avg),
        reviewCount: parseInt(reviewCount.rows[0].count)
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /:id/timeslots - Lấy danh sách khung giờ của sân cho một ngày cụ thể.
 *
 * Query params: date (YYYY-MM-DD)
 * Response: { data: [...timeslots với isBooked] }
 *
 * Logic:
 * - Lấy tất cả khung giờ của sân
 * - Kiểm tra khung giờ nào đã có người đặt trong ngày đó (trừ 'Đã hủy')
 * - Đánh dấu isBooked = true nếu đã đặt hoặc đã qua thời gian cho phép
 * - Nếu sân đang 'Ẩn' -> trả về mảng rỗng
 */
router.get('/:id/timeslots', async (req, res) => {
  try {
    const { date } = req.query;
    const courtId = req.params.id;

    // Block timelots for courts that are not ready
    const courtCheck = await pool.query('SELECT trangThai FROM courts WHERE id = $1', [courtId]);
    if (courtCheck.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy sân' });
    if (courtCheck.rows[0].trangThai === 'Ẩn') {
      return res.json({ data: [] });
    }

    const slots = await pool.query(
      'SELECT * FROM timeslots WHERE sanId = $1 ORDER BY gioBatDau',
      [courtId]
    );
    let bookedSlotIds = new Set();
    const todayStr = formatDateLocal(new Date());
    if (date) {
      const bookings = await pool.query(
        "SELECT khungGioId FROM bookings WHERE sanId = $1 AND ngayChoi = $2 AND trangThai NOT IN ('Đã hủy')",
        [courtId, date]
      );
      bookings.rows.forEach(b => bookedSlotIds.add(b.khungGioId));
    }
    const data = slots.rows.map(s => {
      const now = new Date();
      const todayStr = formatDateLocal(now);
      const currentTimeStr = now.toTimeString().slice(0, 5);

      let isPast = false;
      if (date === todayStr) {
        // Nếu là ngày hôm nay: chặn khung giờ đã qua ngưỡng cho phép
        // (mặc định 15 phút sau giờ bắt đầu là không cho đặt)
        const thresholdMins = parseInt(process.env.BOOKING_LOCK_THRESHOLD_MINS) || 15;
        const gioBatDau = s.gioBatDau || '00:00';
        const [startH, startM] = gioBatDau.split(':').map(Number);
        const startTotalMins = startH * 60 + startM;

        const [nowH, nowM] = currentTimeStr.split(':').map(Number);
        const nowTotalMins = nowH * 60 + nowM;

        const isPastThreshold = nowTotalMins >= startTotalMins + thresholdMins;

        isPast = (s.gioKetThuc || '00:00') <= currentTimeStr || isPastThreshold;
      } else if (date < todayStr) {
        isPast = true;
      }

      return { ...s, isBooked: bookedSlotIds.has(s.id), isExpired: !bookedSlotIds.has(s.id) && isPast };
    });
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /:id/timeslots/all - Lấy tất cả khung giờ của sân (Admin).
 * Không cần query ngày, trả về toàn bộ khung giờ đã cấu hình cho sân.
 */
router.get('/:id/timeslots/all', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM timeslots WHERE sanId = $1 ORDER BY gioBatDau', [req.params.id]);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /:id/timeslots - Tạo khung giờ mới cho sân (Admin).
 *
 * Body: { gioBatDau, gioKetThuc, mucGia }
 * Response: 201 { data: newTimeslot }
 *
 * Kiểm tra trùng lặp: không được tạo khung giờ giao với khung giờ đã tồn tại.
 * Điều kiện trùng: gioBatDau mới < gioKetThuc cũ AND gioKetThuc mới > gioBatDau cũ
 */
router.post('/:id/timeslots', authenticate, requireAdmin, async (req, res) => {
  try {
    const { gioBatDau, gioKetThuc, mucGia } = req.body;
    if (!gioBatDau || !gioKetThuc || mucGia === undefined || mucGia === null) {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });
    }
    // Validate gioKetThuc > gioBatDau
    if (gioKetThuc <= gioBatDau) {
      return res.status(400).json({ error: 'Giờ kết thúc phải sau giờ bắt đầu' });
    }
    // Validate price not negative or zero
    if (Number(mucGia) <= 0) {
      return res.status(400).json({ error: 'Giá phải lớn hơn 0' });
    }
    // Kiểm tra trùng lặp khung giờ
    const overlap = await pool.query(
      'SELECT id FROM timeslots WHERE sanId = $1 AND gioBatDau < $3 AND gioKetThuc > $2',
      [req.params.id, gioBatDau, gioKetThuc]
    );
    if (overlap.rows.length > 0) {
      return res.status(400).json({ error: 'Thời gian này bị trùng lặp với một khung giờ đã tồn tại, vui lòng kiểm tra lại' });
    }
    const result = await pool.query(
      'INSERT INTO timeslots (sanId, gioBatDau, gioKetThuc, mucGia) VALUES ($1, $2, $3, $4) RETURNING *',
      [req.params.id, gioBatDau, gioKetThuc, mucGia]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /:courtId/timeslots/:id - Cập nhật khung giờ (Admin).
 * Dùng COALESCE để chỉ cập nhật trường được gửi lên.
 */
router.put('/:courtId/timeslots/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { gioBatDau, gioKetThuc, mucGia } = req.body;
    const result = await pool.query(
      'UPDATE timeslots SET gioBatDau = COALESCE($1, gioBatDau), gioKetThuc = COALESCE($2, gioKetThuc), mucGia = COALESCE($3, mucGia) WHERE id = $4 AND sanId = $5 RETURNING *',
      [gioBatDau, gioKetThuc, parseFloat(mucGia), req.params.id, req.params.courtId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /:courtId/timeslots/:id - Xóa khung giờ (Admin).
 */
router.delete('/:courtId/timeslots/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM timeslots WHERE id = $1 AND sanId = $2', [req.params.id, req.params.courtId]);
    res.json({ message: 'Xóa thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST / - Tạo sân mới (Admin).
 *
 * Body: { tenSan (bắt buộc), moTa?, hinhAnh?, trangThai? }
 * Kiểm tra trùng tên sân trước khi tạo.
 */
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { tenSan, moTa, hinhAnh, trangThai } = req.body;
    if (!tenSan || tenSan.trim() === '') {
      return res.status(400).json({ error: 'Vui lòng nhập tên sân' });
    }
    const trimmedName = tenSan.trim();
    const dup = await pool.query('SELECT id FROM courts WHERE tenSan = $1', [trimmedName]);
    if (dup.rows.length > 0) {
      return res.status(400).json({ error: 'Tên sân này đã có trong hệ thống, vui lòng chọn tên khác' });
    }
    const result = await pool.query(
      'INSERT INTO courts (tenSan, moTa, hinhAnh, trangThai) VALUES ($1, $2, $3, $4) RETURNING *',
      [trimmedName, moTa, hinhAnh, trangThai || 'Sẵn sàng']
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /:id - Cập nhật thông tin sân (Admin).
 * Dùng COALESCE để chỉ cập nhật trường được gửi lên.
 */
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { tenSan, moTa, hinhAnh, trangThai } = req.body;

    // Kiểm tra tên sân trống (nếu có truyền lên trong body)
    if (tenSan !== undefined && (!tenSan || tenSan.trim() === '')) {
      return res.status(400).json({ error: 'Tên sân không được để trống' });
    }

    // Nếu có đổi tên sân, kiểm tra xem tên mới có trùng với sân khác không
    if (tenSan) {
      const trimmedName = tenSan.trim();
      const dup = await pool.query('SELECT id FROM courts WHERE tenSan = $1 AND id != $2', [trimmedName, req.params.id]);
      if (dup.rows.length > 0) {
        return res.status(400).json({ error: 'Tên sân này đã có trong hệ thống, vui lòng chọn tên khác' });
      }
    }

    const result = await pool.query(
      'UPDATE courts SET tenSan = COALESCE($1, tenSan), moTa = COALESCE($2, moTa), hinhAnh = COALESCE($3, hinhAnh), trangThai = COALESCE($4, trangThai), updated_at = NOW() WHERE id = $5 RETURNING *',
      [tenSan ? tenSan.trim() : tenSan, moTa, hinhAnh, trangThai, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy sân' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /:courtId/images/:imageId - Xóa ảnh sân (Admin).
 */
router.delete('/:courtId/images/:imageId', authenticate, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM court_images WHERE id = $1 AND sanId = $2', [req.params.imageId, req.params.courtId]);
    res.json({ message: 'Xóa ảnh thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /:courtId/images/:imageId/main - Đặt ảnh chính cho sân (Admin).
 * Đầu tiên đặt tất cả ảnh của sân về isMain = FALSE, sau đó đặt ảnh được chọn thành TRUE.
 */
router.put('/:courtId/images/:imageId/main', authenticate, requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE court_images SET isMain = FALSE WHERE sanId = $1', [req.params.courtId]);
    await pool.query('UPDATE court_images SET isMain = TRUE WHERE id = $1 AND sanId = $2', [req.params.imageId, req.params.courtId]);
    res.json({ message: 'Đã đặt ảnh chính' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /:id - Xóa mềm sân (Admin).
 * Không xóa thật mà chỉ đặt trạng thái 'Ẩn' (soft delete).
 * Các dữ liệu liên quan (khung giờ, booking cũ) vẫn được giữ lại.
 */
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await pool.query("UPDATE courts SET trangThai = 'Ẩn', updated_at = NOW() WHERE id = $1", [req.params.id]);
    res.json({ message: 'Đã ẩn sân thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
