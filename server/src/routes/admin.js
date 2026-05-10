const express = require('express');
const { pool } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Dashboard stats
router.get('/dashboard', authenticate, requireAdmin, async (req, res) => {
  try {
    const totalCourts = await pool.query('SELECT COUNT(*) FROM courts');
    const totalUsers = await pool.query("SELECT COUNT(*) FROM users WHERE vaiTro != 'Admin'");
    const todayBookings = await pool.query("SELECT COUNT(*) FROM bookings WHERE ngayChoi = CURRENT_DATE AND trangThai NOT IN ('Đã hủy')");
    const monthlyRevenue = await pool.query(
      "SELECT COALESCE(SUM(soTien), 0) as total FROM payments WHERE ngayGiaoDich >= date_trunc('month', CURRENT_DATE)"
    );
    // Revenue by day (last 7 days)
    const revenueByDay = await pool.query(
      `SELECT TO_CHAR(ngayGiaoDich, 'DD/MM') as date, SUM(soTien) as revenue
       FROM payments WHERE ngayGiaoDich >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY TO_CHAR(ngayGiaoDich, 'DD/MM'), ngayGiaoDich ORDER BY ngayGiaoDich`
    );
    res.json({
      data: {
        stats: {
          totalCourts: parseInt(totalCourts.rows[0].count) || 0,
          totalUsers: parseInt(totalUsers.rows[0].count) || 0,
          todayBookings: parseInt(todayBookings.rows[0].count) || 0,
          monthlyRevenue: parseFloat(monthlyRevenue.rows[0].total) || 0,
        },
        revenueByDay: revenueByDay.rows || [],
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Reports
router.get('/reports', authenticate, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate || new Date().toISOString().slice(0, 10);
    const end = endDate || new Date().toISOString().slice(0, 10);

    const summary = await pool.query(
      `SELECT
        COALESCE(SUM(p.soTien), 0) as totalRevenue,
        COUNT(DISTINCT b.id) as totalBookings,
        COALESCE(SUM(CASE WHEN b.trangThai = 'Đã hủy' AND b.ghiChu != 'No-show' THEN p.soTien ELSE 0 END), 0) as cancelRevenue
       FROM payments p JOIN bookings b ON p.donDatId = b.id
       WHERE p.ngayGiaoDich::date BETWEEN $1 AND $2`,
      [start, end]
    );

    const revenueByDay = await pool.query(
      `SELECT TO_CHAR(p.ngayGiaoDich, 'DD/MM') as date, SUM(p.soTien) as revenue
       FROM payments p WHERE p.ngayGiaoDich::date BETWEEN $1 AND $2
       GROUP BY TO_CHAR(p.ngayGiaoDich, 'DD/MM'), p.ngayGiaoDich::date ORDER BY p.ngayGiaoDich::date`,
      [start, end]
    );

    const revenueByCourt = await pool.query(
      `SELECT c.tenSan as name, COALESCE(SUM(p.soTien), 0) as revenue
       FROM courts c LEFT JOIN bookings b ON c.id = b.sanId
       LEFT JOIN payments p ON b.id = p.donDatId AND p.ngayGiaoDich::date BETWEEN $1 AND $2
       GROUP BY c.id, c.tenSan ORDER BY revenue DESC`,
      [start, end]
    );

    res.json({
      data: {
        summary: summary.rows[0] || { totalRevenue: 0, totalBookings: 0, cancelRevenue: 0 },
        revenueByDay: revenueByDay.rows || [],
        revenueByCourt: revenueByCourt.rows || [],
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Services CRUD
router.get('/services', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM services ORDER BY created_at DESC');
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/services', authenticate, requireAdmin, async (req, res) => {
  try {
    const { tenDichVu, donGia, loaiDichVu, soLuongTon, trangThai } = req.body;
    if (!tenDichVu || !donGia) return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });
    const result = await pool.query(
      'INSERT INTO services (tenDichVu, donGia, loaiDichVu, soLuongTon, trangThai) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [tenDichVu, donGia, loaiDichVu, soLuongTon || 0, trangThai || 'Còn hàng']
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/services/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { tenDichVu, donGia, loaiDichVu, soLuongTon, trangThai } = req.body;
    const result = await pool.query(
      'UPDATE services SET tenDichVu = COALESCE($1, tenDichVu), donGia = COALESCE($2, donGia), loaiDichVu = COALESCE($3, loaiDichVu), soLuongTon = COALESCE($4, soLuongTon), trangThai = COALESCE($5, trangThai) WHERE id = $6 RETURNING *',
      [tenDichVu, donGia, loaiDichVu, soLuongTon !== undefined ? parseInt(soLuongTon) : null, trangThai, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/services/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM services WHERE id = $1', [req.params.id]);
    res.json({ message: 'Xóa thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Notifications
router.get('/notifications', authenticate, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const result = await pool.query(
      'SELECT * FROM notifications WHERE nguoiDungId = $1 ORDER BY thoiGianTao DESC LIMIT $2 OFFSET $3',
      [req.user.id, limit, offset]
    );
    const count = await pool.query('SELECT COUNT(*) FROM notifications WHERE nguoiDungId = $1', [req.user.id]);
    res.json({
      data: result.rows,
      total: parseInt(count.rows[0].count),
      page: parseInt(page), limit: parseInt(limit),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/notifications/unread-count', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE nguoiDungId = $1 AND daDoc = FALSE',
      [req.user.id]
    );
    res.json({ data: { count: parseInt(result.rows[0].count) } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/notifications/:id/read', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET daDoc = TRUE WHERE id = $1 AND nguoiDungId = $2', [req.params.id, req.user.id]);
    res.json({ message: 'Đã đọc' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.patch('/notifications/read-all', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET daDoc = TRUE WHERE nguoiDungId = $1', [req.user.id]);
    res.json({ message: 'Đã đọc tất cả' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Discounts CRUD
router.get('/discounts', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM discounts ORDER BY created_at DESC');
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/discounts', authenticate, requireAdmin, async (req, res) => {
  try {
    const { code, noiDung, moTa, loaiGiamGia, mucGiamGia, ngayBatDau, ngayKetThuc, soLuongBanDau, trangThai } = req.body;
    if (!code || !mucGiamGia) return res.status(400).json({ error: 'Vui lòng nhập mã và mức giảm giá' });
    const result = await pool.query(
      `INSERT INTO discounts (code, noiDung, moTa, loaiGiamGia, mucGiamGia, ngayBatDau, ngayKetThuc, soLuongBanDau, trangThai)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [code, noiDung, moTa, loaiGiamGia || 'percentage', mucGiamGia, ngayBatDau, ngayKetThuc, soLuongBanDau || 0, trangThai || 'Active']
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/discounts/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { code, noiDung, moTa, loaiGiamGia, mucGiamGia, ngayBatDau, ngayKetThuc, soLuongBanDau, trangThai } = req.body;
    const result = await pool.query(
      `UPDATE discounts SET code = COALESCE($1, code), noiDung = COALESCE($2, noiDung), moTa = COALESCE($3, moTa),
       loaiGiamGia = COALESCE($4, loaiGiamGia), mucGiamGia = COALESCE($5, mucGiamGia),
       ngayBatDau = COALESCE($6, ngayBatDau), ngayKetThuc = COALESCE($7, ngayKetThuc),
       soLuongBanDau = COALESCE($8, soLuongBanDau), trangThai = COALESCE($9, trangThai)
       WHERE id = $10 RETURNING *`,
      [code, noiDung, moTa, loaiGiamGia, mucGiamGia, ngayBatDau, ngayKetThuc, soLuongBanDau, trangThai, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/discounts/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    await pool.query('DELETE FROM discounts WHERE id = $1', [req.params.id]);
    res.json({ message: 'Xóa thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Export reports to Excel
router.get('/reports/export', authenticate, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const start = startDate || new Date().toISOString().slice(0, 10);
    const end = endDate || new Date().toISOString().slice(0, 10);

    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Báo cáo doanh thu');

    sheet.columns = [
      { header: 'Mã đơn', key: 'id', width: 10 },
      { header: 'Khách hàng', key: 'customer', width: 25 },
      { header: 'Sân', key: 'court', width: 20 },
      { header: 'Ngày chơi', key: 'date', width: 15 },
      { header: 'Khung giờ', key: 'timeslot', width: 20 },
      { header: 'Trạng thái', key: 'status', width: 18 },
      { header: 'Tổng tiền', key: 'total', width: 15 },
      { header: 'Đã cọc', key: 'deposit', width: 15 },
    ];

    const result = await pool.query(
      `SELECT b.id, u.hoTen as customer, c.tenSan as court, b.ngayChoi as date,
       t.gioBatDau || ' - ' || t.gioKetThuc as timeslot, b.trangThai as status,
       b.tongTien as total, b.tienDaCoc as deposit
       FROM bookings b
       JOIN users u ON b.nguoiDungId = u.id
       JOIN courts c ON b.sanId = c.id
       JOIN timeslots t ON b.khungGioId = t.id
       WHERE b.created_at::date BETWEEN $1 AND $2
       ORDER BY b.created_at DESC`,
      [start, end]
    );

    result.rows.forEach(row => {
      sheet.addRow({
        id: row.id, customer: row.customer, court: row.court,
        date: row.date, timeslot: row.timeslot, status: row.status,
        total: Number(row.total).toLocaleString('vi-VN'),
        deposit: Number(row.deposit).toLocaleString('vi-VN'),
      });
    });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=bao-cao-doanh-thu-${start}-${end}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Validate discount code
router.post('/discounts/validate', authenticate, async (req, res) => {
  try {
    const { code, totalAmount } = req.body;
    const result = await pool.query(
      `SELECT * FROM discounts WHERE code = $1 AND trangThai = 'Active'
       AND (ngayBatDau IS NULL OR ngayBatDau <= NOW())
       AND (ngayKetThuc IS NULL OR ngayKetThuc >= NOW())
       AND (soLuongBanDau = 0 OR soLuongDaDung < soLuongBanDau)`,
      [code]
    );
    if (result.rows.length === 0) return res.status(400).json({ error: 'Mã giảm giá không hợp lệ hoặc đã hết hạn' });
    const discount = result.rows[0];
    let discountAmount = 0;
    if (discount.loaigiamgia === 'percentage') {
      discountAmount = Math.round(totalAmount * discount.mucgiamgia / 100);
    } else {
      discountAmount = Math.min(Number(discount.mucgiamgia), totalAmount);
    }
    res.json({ data: { ...discount, discountAmount } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual trigger: cancel past auto-bookings (for testing)
router.post('/trigger-cancel-past', authenticate, requireAdmin, async (req, res) => {
  try {
    const { autoCancelPastBookings } = require('../services/scheduler');
    await autoCancelPastBookings();
    res.json({ message: 'Đã chạy autoCancelPastBookings' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Manual trigger: VIP auto-booking (for testing) — bypasses Monday check
router.post('/trigger-vip-auto-book', authenticate, requireAdmin, async (req, res) => {
  try {
    const { processVipAutoBooking } = require('../services/scheduler');
    await processVipAutoBooking(true);
    res.json({ message: 'Đã chạy VIP auto-booking (force mode)' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Schedule Board for Admin
router.get('/schedule-board', authenticate, requireAdmin, async (req, res) => {
  try {
    const { start_date, end_date, court_id } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'Vui lòng cung cấp start_date và end_date' });
    }

    const startDate = new Date(start_date);
    const endDate = new Date(end_date);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return res.status(400).json({ error: 'Định dạng ngày không hợp lệ (YYYY-MM-DD)' });
    }
    if (startDate > endDate) {
      return res.status(400).json({ error: 'start_date không được lớn hơn end_date' });
    }

    const params = [start_date, end_date];
    let courtFilter = '';
    if (court_id !== undefined && court_id !== '') {
      const cid = parseInt(court_id, 10);
      if (isNaN(cid) || cid <= 0) {
        return res.status(400).json({ error: 'court_id không hợp lệ' });
      }
      params.push(cid);
      courtFilter = `AND b.sanId = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT b.id AS booking_id,
              b.sanId AS court_id,
              c.tenSan AS court_name,
              b.khungGioId AS slot_id,
              t.gioBatDau AS start_time,
              t.gioKetThuc AS end_time,
              b.ngayChoi AS booking_date,
              u.hoTen AS user_name,
              u.isVIP AS is_vip,
              b.isAutoBooking AS is_auto_booking
       FROM bookings b
       JOIN timeslots t ON b.khungGioId = t.id
       JOIN users u ON b.nguoiDungId = u.id
       JOIN courts c ON b.sanId = c.id
       WHERE b.ngayChoi BETWEEN $1 AND $2
         AND b.trangThai != 'Đã hủy'
         ${courtFilter}
       ORDER BY b.ngayChoi, t.gioBatDau, c.tenSan`,
      params
    );

    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
