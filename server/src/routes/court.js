const express = require('express');
const { pool } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Get all courts
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, isAdmin } = req.query;
    const offset = (page - 1) * limit;
    
    let query = `SELECT c.*,
      (SELECT ROUND(COALESCE(AVG(diemSao), 0), 1) FROM reviews WHERE donDatId IN (SELECT id FROM bookings WHERE sanId = c.id)) as avgRating,
      (SELECT COUNT(*) FROM timeslots WHERE sanId = c.id) as slotCount
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

// Get court by ID
router.get('/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM courts WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy sân' });
    const images = await pool.query('SELECT * FROM court_images WHERE sanId = $1 ORDER BY isMain DESC, created_at ASC', [req.params.id]);
    const avgRating = await pool.query(
      'SELECT ROUND(COALESCE(AVG(diemSao), 0), 1) as avg FROM reviews r JOIN bookings b ON r.donDatId = b.id WHERE b.sanId = $1',
      [req.params.id]
    );
    res.json({ data: { ...result.rows[0], images: images.rows, avgRating: parseFloat(avgRating.rows[0].avg) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get time slots for a court on a specific date (with booking status)
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
    const todayStr = new Date().toISOString().slice(0, 10);
    if (date) {
      const bookings = await pool.query(
        "SELECT khungGioId FROM bookings WHERE sanId = $1 AND ngayChoi = $2 AND trangThai NOT IN ('Đã hủy')",
        [courtId, date]
      );
      bookings.rows.forEach(b => bookedSlotIds.add(b.khungGioId));
    }
    const data = slots.rows.map(s => {
      const isPast = date === todayStr && s.gioKetThuc <= new Date().toTimeString().slice(0, 5);
      return { ...s, isBooked: bookedSlotIds.has(s.id) || isPast };
    });
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all time slots for a court (admin)
router.get('/:id/timeslots/all', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM timeslots WHERE sanId = $1 ORDER BY gioBatDau', [req.params.id]);
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create time slot for a court (admin)
router.post('/:id/timeslots', authenticate, requireAdmin, async (req, res) => {
  try {
    const { gioBatDau, gioKetThuc, mucGia } = req.body;
    if (!gioBatDau || !gioKetThuc || !mucGia) {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });
    }
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

// Update time slot (admin)
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

// Delete time slot (admin)
router.delete('/:courtId/timeslots/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM timeslots WHERE id = $1 AND sanId = $2', [req.params.id, req.params.courtId]);
    res.json({ message: 'Xóa thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create court (admin)
router.post('/', authenticate, requireAdmin, async (req, res) => {
  try {
    const { tenSan, moTa, hinhAnh, trangThai } = req.body;
    if (!tenSan) return res.status(400).json({ error: 'Vui lòng nhập tên sân' });
    const dup = await pool.query('SELECT id FROM courts WHERE tenSan = $1', [tenSan]);
    if (dup.rows.length > 0) return res.status(400).json({ error: 'Tên sân này đã có trong hệ thống, vui lòng chọn tên khác' });
    const result = await pool.query(
      'INSERT INTO courts (tenSan, moTa, hinhAnh, trangThai) VALUES ($1, $2, $3, $4) RETURNING *',
      [tenSan, moTa, hinhAnh, trangThai || 'Sẵn sàng']
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update court (admin)
router.put('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { tenSan, moTa, hinhAnh, trangThai } = req.body;
    const result = await pool.query(
      'UPDATE courts SET tenSan = COALESCE($1, tenSan), moTa = COALESCE($2, moTa), hinhAnh = COALESCE($3, hinhAnh), trangThai = COALESCE($4, trangThai), updated_at = NOW() WHERE id = $5 RETURNING *',
      [tenSan, moTa, hinhAnh, trangThai, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy sân' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete court image (admin)
router.delete('/:courtId/images/:imageId', authenticate, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM court_images WHERE id = $1 AND sanId = $2', [req.params.imageId, req.params.courtId]);
    res.json({ message: 'Xóa ảnh thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Set main image (admin)
router.put('/:courtId/images/:imageId/main', authenticate, requireAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE court_images SET isMain = FALSE WHERE sanId = $1', [req.params.courtId]);
    await pool.query('UPDATE court_images SET isMain = TRUE WHERE id = $1 AND sanId = $2', [req.params.imageId, req.params.courtId]);
    res.json({ message: 'Đã đặt ảnh chính' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete court (admin) - soft delete by setting status to 'Ẩn'
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await pool.query("UPDATE courts SET trangThai = 'Ẩn', updated_at = NOW() WHERE id = $1", [req.params.id]);
    res.json({ message: 'Đã ẩn sân thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
