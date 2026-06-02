/**
 * Route quản trị hệ thống (Admin only) - Dashboard, Báo cáo, Dịch vụ, Thông báo, Giảm giá, Xuất Excel.
 *
 * File này cung cấp các API quản trị chỉ dành cho Admin (cần authenticate + requireAdmin):
 *
 * == Dashboard ==
 * 1. GET /dashboard - Thống kê tổng quan (số sân, số user, đơn hôm nay, doanh thu tháng, biểu đồ 7 ngày)
 *
 * == Báo cáo ==
 * 2. GET /reports - Báo cáo doanh thu theo khoảng ngày (theo ngày, theo sân, tổng hợp)
 * 3. GET /reports/export - Xuất báo cáo ra file Excel (.xlsx) với thông tin chi tiết từng đơn
 *
 * == Dịch vụ (Services CRUD) ==
 * 4. GET /services - Lấy danh sách tất cả dịch vụ (dụng cụ, đồ uống...)
 * 5. POST /services - Tạo dịch vụ mới (tenDichVu bắt buộc, donGia bắt buộc)
 * 6. PUT /services/:id - Cập nhật dịch vụ (dùng COALESCE chỉ cập nhật trường được gửi)
 * 7. DELETE /services/:id - Xóa dịch vụ
 *
 * == Thông báo (Notifications) ==
 * 8. GET /notifications - Lấy danh sách thông báo của user hiện tại (phân trang)
 * 9. GET /notifications/unread-count - Đếm số thông báo chưa đọc
 * 10. PATCH /notifications/:id/read - Đánh dấu 1 thông báo đã đọc
 * 11. PATCH /notifications/read-all - Đánh dấu tất cả thông báo đã đọc
 *
 * == Mã giảm giá (Discounts CRUD) ==
 * 12. GET /discounts - Lấy tất cả mã giảm giá (Admin xem tất cả)
 * 13. GET /discounts/my - Lấy mã giảm giá khả dụng cho user hiện tại (kèm điều kiện lọc)
 * 14. POST /discounts - Tạo mã giảm giá mới (code, mucGiamGia bắt buộc)
 * 15. PUT /discounts/:id - Cập nhật mã giảm giá
 * 16. DELETE /discounts/:id - Xóa mã giảm giá
 *
 * == Xác thực mã giảm giá ==
 * 17. POST /discounts/validate - Kiểm tra tính hợp lệ của mã giảm giá và tính số tiền giảm
 *     - Kiểm tra trạng thái, quyền sở hữu, ngày hiệu lực, số lượng còn, giới hạn/user
 *     - Kiểm tra điều kiện: min_order_value, applicable_court_ids, target_audience (new_user/vip)
 *     - Nếu isClaiming=true: tạo bản sao mã giảm giá riêng cho user (lưu vào kho voucher)
 *
 * == Trigger thủ công (dành cho testing/debug) ==
 * 18. POST /trigger-cancel-past - Gọi thủ công autoCancelPastBookings() từ scheduler
 * 19. POST /trigger-vip-auto-book - Gọi thủ công processVipAutoBooking(true) - bỏ qua kiểm tra thứ 2
 *
 * == Bảng lịch sân (Schedule Board) ==
 * 20. GET /schedule-board - Lấy dữ liệu lịch đặt sân trong khoảng ngày (dùng cho giao diện lịch tuần)
 *     - Query params: start_date, end_date (bắt buộc), court_id (tùy chọn để lọc theo sân)
 */

const express = require('express');
const { pool } = require('../config/database');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { normalizeCode, parseConditions, validateDiscountForUse, claimDiscountForUser } = require('../utils/discount');
const router = express.Router();

function formatDateLocal(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

async function countFutureServiceBookings(serviceId) {
  const result = await pool.query(
    `SELECT COUNT(*)::int AS count
     FROM booking_services bs
     JOIN bookings b ON b.id = bs.donDatId
     WHERE bs.dichVuId = $1
       AND b.ngayChoi >= CURRENT_DATE
       AND b.trangThai NOT IN ('Đã hủy')`,
    [serviceId]
  );
  return Number(result.rows[0]?.count || 0);
}

function futureBookingBlock(resourceName, count) {
  return `Không thể thay đổi ${resourceName} vì còn ${count} đơn đặt trong hôm nay hoặc tương lai. Vui lòng xử lý các đơn đặt trước.`;
}

function hasServiceContractChange(body) {
  return ['tenDichVu', 'donGia', 'loaiDichVu', 'trangThai'].some(key => body[key] !== undefined);
}

function parseOptionalDate(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  return value;
}

function parseNonNegativeInteger(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) return null;
  return number;
}

function normalizeDiscountConditions(raw) {
  const parsed = parseConditions(raw);
  const minOrder = parsed.min_order_value === null || parsed.min_order_value === undefined || parsed.min_order_value === ''
    ? null
    : Number(parsed.min_order_value);
  const courtIds = Array.isArray(parsed.applicable_court_ids)
    ? parsed.applicable_court_ids.map(Number).filter(id => Number.isInteger(id) && id > 0)
    : [];
  const targetAudience = ['all', 'new_user', 'vip'].includes(parsed.target_audience)
    ? parsed.target_audience
    : 'all';

  if (minOrder !== null && (!Number.isFinite(minOrder) || minOrder < 0)) return null;

  return {
    min_order_value: minOrder,
    applicable_court_ids: courtIds.length > 0 ? courtIds : null,
    target_audience: targetAudience,
  };
}

function buildDiscountPayload(body, existing = {}) {
  const has = key => Object.prototype.hasOwnProperty.call(body, key);
  const code = has('code') ? normalizeCode(body.code) : normalizeCode(existing.code);
  const type = has('loaiGiamGia') ? String(body.loaiGiamGia || 'percentage') : (existing.loaiGiamGia || 'percentage');
  const rawDiscountValue = has('mucGiamGia') ? body.mucGiamGia : existing.mucGiamGia;
  const discountValue = Number(rawDiscountValue);
  const rawMaxDiscount = has('giamToiDa') ? body.giamToiDa : existing.giamToiDa;
  const maxDiscount = rawMaxDiscount === undefined || rawMaxDiscount === null || rawMaxDiscount === '' ? null : Number(rawMaxDiscount);
  const initialQuantity = parseNonNegativeInteger(has('soLuongBanDau') ? body.soLuongBanDau : existing.soLuongBanDau, 0);
  const usageLimit = parseNonNegativeInteger(
    has('usageLimitPerUser') ? body.usageLimitPerUser : (has('usage_limit_per_user') ? body.usage_limit_per_user : existing.usageLimitPerUser),
    1
  );
  const startDate = has('ngayBatDau') ? parseOptionalDate(body.ngayBatDau) : (existing.ngayBatDau || null);
  const endDate = has('ngayKetThuc') ? parseOptionalDate(body.ngayKetThuc) : (existing.ngayKetThuc || null);
  const conditions = has('conditions') ? normalizeDiscountConditions(body.conditions) : normalizeDiscountConditions(existing.conditions);

  if (!code) return { error: 'Vui lòng nhập mã giảm giá' };
  if (!['percentage', 'fixed'].includes(type)) return { error: 'Loại giảm giá không hợp lệ' };
  if (!Number.isFinite(discountValue) || discountValue <= 0) return { error: 'Mức giảm giá phải lớn hơn 0' };
  if (type === 'percentage' && discountValue > 100) return { error: 'Mức giảm phần trăm không được vượt quá 100%' };
  if (maxDiscount !== null && (!Number.isFinite(maxDiscount) || maxDiscount <= 0)) return { error: 'Giảm tối đa phải lớn hơn 0' };
  if (initialQuantity === null) return { error: 'Số lượng không hợp lệ' };
  if (usageLimit === null || usageLimit < 0) return { error: 'Lượt dùng mỗi khách không hợp lệ' };
  if (!conditions) return { error: 'Điều kiện áp dụng không hợp lệ' };
  if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
    return { error: 'Ngày bắt đầu không được sau ngày kết thúc' };
  }
  const status = has('trangThai') ? (body.trangThai || 'Active') : (existing.trangThai || 'Active');
  if (!['Active', 'Inactive'].includes(status)) return { error: 'Trạng thái mã giảm giá không hợp lệ' };

  return {
    value: {
      code,
      noiDung: has('noiDung') ? body.noiDung : (existing.noiDung || null),
      moTa: has('moTa') ? body.moTa : (existing.moTa || null),
      loaiGiamGia: type,
      mucGiamGia: discountValue,
      ngayBatDau: startDate,
      ngayKetThuc: endDate,
      soLuongBanDau: initialQuantity,
      usageLimitPerUser: usageLimit,
      giamToiDa: type === 'percentage' ? maxDiscount : null,
      conditions,
      trangThai: status,
      isHidden: has('isHidden') ? body.isHidden === true : (existing.isHidden === true),
    },
  };
}

/**
 * GET /admin/dashboard - Lấy dữ liệu thống kê tổng quan cho trang Dashboard Admin.
 *
 * Trả về:
 * - stats: { totalCourts, totalUsers, todayBookings, monthlyRevenue }
 *   - totalCourts: tổng số sân trong hệ thống
 *   - totalUsers: tổng số người dùng (không tính Admin)
 *   - todayBookings: số đơn đặt hôm nay (không tính đã hủy)
 *   - monthlyRevenue: tổng doanh thu từ đầu tháng đến hiện tại
 * - revenueByDay: mảng 7 ngày gần nhất [{ date: "DD/MM", revenue: số tiền }]
 *   - Doanh thu được quy đổi về múi giờ Việt Nam (Asia/Ho_Chi_Minh)
 *   - Những ngày không có doanh thu sẽ hiển thị revenue = 0
 *
 * Yêu cầu: authenticate + requireAdmin (phải là Admin đã đăng nhập)
 */
router.get('/dashboard', authenticate, requireAdmin, async (req, res) => {
  try {
    const { month } = req.query; // YYYY-MM, vd: "2026-05"

    // Lấy các chỉ số thống kê cơ bản từ database
    const totalCourts = await pool.query('SELECT COUNT(*) FROM courts');
    const totalUsers = await pool.query("SELECT COUNT(*) FROM users WHERE vaiTro != 'Admin'");
    const todayBookings = await pool.query("SELECT COUNT(*) FROM bookings WHERE ngayChoi = CURRENT_DATE AND trangThai NOT IN ('Đã hủy')");
    const monthlyRevenue = await pool.query(
      "SELECT COALESCE(SUM(soTien), 0) as total FROM payments WHERE trangThai = 'Thành công' AND ngayGiaoDich >= date_trunc('month', CURRENT_DATE)"
    );

    let dbRevenue;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      // Lấy doanh thu theo ngày cho tháng được chọn
      const [y, m] = month.split('-').map(Number);
      const daysInMonth = new Date(y, m, 0).getDate(); // m là 1-based, Date constructor nhận 0-based month
      dbRevenue = await pool.query(
        `SELECT TO_CHAR(ngayGiaoDich AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM') as date, SUM(soTien) as revenue
         FROM payments
         WHERE (ngayGiaoDich AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= $1::date
           AND (ngayGiaoDich AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date <= $2::date
           AND trangThai = 'Thành công'
         GROUP BY 1`,
        [`${month}-01`, `${month}-${String(daysInMonth).padStart(2, '0')}`]
      );

      // Tạo mảng đủ tất cả các ngày trong tháng
      const revenueLookup = {};
      dbRevenue.rows.forEach(row => {
        revenueLookup[row.date] = parseFloat(row.revenue);
      });

      const revenueByDay = [];
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}`;
        revenueByDay.push({
          date: dateStr,
          revenue: revenueLookup[dateStr] || 0
        });
      }

      return res.json({
        data: {
          stats: {
            totalCourts: parseInt(totalCourts.rows[0].count) || 0,
            totalUsers: parseInt(totalUsers.rows[0].count) || 0,
            todayBookings: parseInt(todayBookings.rows[0].count) || 0,
            monthlyRevenue: parseFloat(monthlyRevenue.rows[0].total) || 0,
          },
          revenueByDay
        }
      });
    }

    // Mặc định: lấy doanh thu 7 ngày gần nhất
    dbRevenue = await pool.query(
      `SELECT TO_CHAR(ngayGiaoDich AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM') as date, SUM(soTien) as revenue
       FROM payments
       WHERE (ngayGiaoDich AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date >= (CURRENT_DATE AT TIME ZONE 'Asia/Ho_Chi_Minh') - INTERVAL '7 days'
       AND trangThai = 'Thành công'
       GROUP BY 1`
    );

    // Tạo map tra cứu nhanh doanh thu theo ngày (key = "DD/MM")
    const revenueLookup7 = {};
    dbRevenue.rows.forEach(row => {
      revenueLookup7[row.date] = parseFloat(row.revenue);
    });

    // Tạo mảng đủ 7 ngày (dùng giờ local server), đảm bảo ngày nào cũng có dữ liệu
    const revenueByDay7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);

      const day = String(d.getDate()).padStart(2, '0');
      const monthStr = String(d.getMonth() + 1).padStart(2, '0');
      const dateStr = `${day}/${monthStr}`;

      revenueByDay7.push({
        date: dateStr,
        revenue: revenueLookup7[dateStr] || 0
      });
    }

    res.json({
      data: {
        stats: {
          totalCourts: parseInt(totalCourts.rows[0].count) || 0,
          totalUsers: parseInt(totalUsers.rows[0].count) || 0,
          todayBookings: parseInt(todayBookings.rows[0].count) || 0,
          monthlyRevenue: parseFloat(monthlyRevenue.rows[0].total) || 0,
        },
        revenueByDay: revenueByDay7
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /admin/reports - Lấy báo cáo doanh thu chi tiết theo khoảng ngày.
 *
 * Query params:
 * - startDate: ngày bắt đầu (YYYY-MM-DD), mặc định là hôm nay
 * - endDate: ngày kết thúc (YYYY-MM-DD), mặc định là hôm nay
 *
 * Trả về:
 * - summary: { totalRevenue (tổng doanh thu), totalBookings (tổng số đơn), cancelRevenue (doanh thu đơn hủy) }
 * - revenueByDay: mảng doanh thu theo ngày + theo từng sân (dạng pivoted cho stacked chart)
 *   Mỗi phần tử: { date: "DD/MM", "Tên sân 1": số tiền, "Tên sân 2": số tiền, ... }
 * - revenueByCourt: mảng doanh thu tổng theo từng sân [{ name, revenue }]
 *
 * Tất cả doanh thu được quy đổi về múi giờ Việt Nam (Asia/Ho_Chi_Minh).
 * Yêu cầu: authenticate + requireAdmin
 */
router.get('/reports', authenticate, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    // Nếu không truyền ngày thì mặc định lấy hôm nay
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const start = startDate || todayStr;
    const end = endDate || todayStr;
    const countedRevenueCase = `CASE
          WHEN p.trangThai = 'Thành công' THEN p.soTien
          ELSE 0
        END`;

    // Tổng hợp doanh thu: chỉ tính doanh thu giữ lại của đơn hủy khi ghi chú có policy không hoàn tiền
    const summary = await pool.query(
      `SELECT
        COALESCE(SUM(${countedRevenueCase}), 0) as totalRevenue,
        COUNT(DISTINCT b.id) as totalBookings,
        COALESCE(SUM(CASE
          WHEN p.trangThai = 'Thành công' AND b.trangThai = 'Đã hủy' AND b.ghiChu ILIKE '%không được hoàn lại%' THEN p.soTien
          ELSE 0
        END), 0) as cancelRevenue
       FROM payments p JOIN bookings b ON p.donDatId = b.id
       WHERE (p.ngayGiaoDich AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1 AND $2`,
      [start, end]
    );

    // Doanh thu chi tiết theo ngày + theo sân (dữ liệu thô từ DB)
    // Dùng TO_CHAR để format ngày thành DD/MM, group by date và court_name
    const dailyRevenueRaw = await pool.query(
      `SELECT
        TO_CHAR(p.ngayGiaoDich AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh', 'DD/MM') as date,
        c.tenSan as court_name,
        SUM(${countedRevenueCase}) as revenue
       FROM payments p
       JOIN bookings b ON p.donDatId = b.id
       JOIN courts c ON b.sanId = c.id
       WHERE (p.ngayGiaoDich AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1 AND $2
       GROUP BY 1, 2, (p.ngayGiaoDich AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date
       ORDER BY (p.ngayGiaoDich AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`,
      [start, end]
    );

    // Pivot dữ liệu: gộp các dòng cùng ngày thành 1 object với key là tên sân
    // Ví dụ: { date: "15/05", "Sân Landmark": 500000, "Sân Sunrise": 300000 }
    const dailyMap = {};
    dailyRevenueRaw.rows.forEach(row => {
      if (!dailyMap[row.date]) dailyMap[row.date] = { date: row.date };
      dailyMap[row.date][row.court_name] = parseFloat(row.revenue);
    });
    const revenueByDay = Object.values(dailyMap);

    // Tổng doanh thu theo từng sân (dùng LEFT JOIN để hiển thị cả sân không có doanh thu)
    const revenueByCourt = await pool.query(
      `SELECT c.tenSan as name, COALESCE(SUM(${countedRevenueCase}), 0) as revenue
       FROM courts c LEFT JOIN bookings b ON c.id = b.sanId
       LEFT JOIN payments p ON b.id = p.donDatId AND (p.ngayGiaoDich AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date BETWEEN $1 AND $2
       GROUP BY c.id, c.tenSan ORDER BY revenue DESC`,
      [start, end]
    );

    res.json({
      data: {
        summary: summary.rows[0] || { totalRevenue: 0, totalBookings: 0, cancelRevenue: 0 },
        revenueByDay,
        revenueByCourt: revenueByCourt.rows || [],
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /admin/services - Lấy danh sách tất cả dịch vụ trong hệ thống.
 *
 * Trả về: { data: [...services] } - mảng các dịch vụ (dụng cụ, đồ uống...)
 * Sắp xếp theo created_at giảm dần (mới nhất lên trước).
 * Yêu cầu: authenticate (cả admin và user đều xem được danh sách dịch vụ)
 */
router.get('/services', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM services ORDER BY created_at DESC');
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /admin/services - Tạo dịch vụ mới (Admin only).
 *
 * Body: { tenDichVu (bắt buộc), donGia (bắt buộc), loaiDichVu?, soLuongTon?, trangThai? }
 * - loaiDichVu: phân loại dịch vụ (vd: "Dụng cụ", "Đồ uống")
 * - soLuongTon: số lượng tồn kho, mặc định 0
 * - trangThai: trạng thái, mặc định 'Còn hàng'
 *
 * Response: 201 { data: newService }
 * Yêu cầu: authenticate + requireAdmin
 */
router.post('/services', authenticate, requireAdmin, async (req, res) => {
  try {
    const { tenDichVu, donGia, loaiDichVu, soLuongTon, trangThai } = req.body;
    const serviceName = typeof tenDichVu === 'string' ? tenDichVu.trim() : '';
    const price = Number(donGia);
    const stock = soLuongTon === undefined || soLuongTon === null || soLuongTon === '' ? 0 : Number(soLuongTon);
    if (!serviceName || donGia === undefined || donGia === null || donGia === '') {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ thông tin' });
    }
    // Validate negative values
    if (!Number.isFinite(price) || price < 0) {
      return res.status(400).json({ error: 'Đơn giá không hợp lệ' });
    }
    if (!Number.isInteger(stock) || stock < 0) {
      return res.status(400).json({ error: 'Số lượng tồn kho không hợp lệ' });
    }
    if (trangThai !== undefined && !['Còn hàng', 'Hết hàng'].includes(trangThai)) {
      return res.status(400).json({ error: 'Trạng thái dịch vụ không hợp lệ' });
    }
    const result = await pool.query(
      'INSERT INTO services (tenDichVu, donGia, loaiDichVu, soLuongTon, trangThai) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [serviceName, price, loaiDichVu, stock, trangThai || 'Còn hàng']
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /admin/services/:id - Cập nhật thông tin dịch vụ (Admin only).
 *
 * Body: { tenDichVu?, donGia?, loaiDichVu?, soLuongTon?, trangThai? }
 * - Dùng COALESCE: chỉ cập nhật các trường được gửi lên, giữ nguyên các trường không gửi
 * - soLuongTon được parse về Integer trước khi lưu
 *
 * Response: { data: updatedService }
 * Yêu cầu: authenticate + requireAdmin
 */
router.put('/services/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const { tenDichVu, donGia, loaiDichVu, soLuongTon, trangThai } = req.body;
    if (hasServiceContractChange(req.body)) {
      const futureBookingCount = await countFutureServiceBookings(req.params.id);
      if (futureBookingCount > 0) {
        return res.status(400).json({ error: futureBookingBlock('dịch vụ', futureBookingCount) });
      }
    }
    // Validate negative values
    if (tenDichVu !== undefined && (!String(tenDichVu).trim())) {
      return res.status(400).json({ error: 'Tên dịch vụ không được để trống' });
    }
    const price = donGia === undefined || donGia === null || donGia === '' ? null : Number(donGia);
    const stock = soLuongTon === undefined || soLuongTon === null || soLuongTon === '' ? null : Number(soLuongTon);
    if (price !== null && (!Number.isFinite(price) || price < 0)) {
      return res.status(400).json({ error: 'Đơn giá không hợp lệ' });
    }
    if (stock !== null && (!Number.isInteger(stock) || stock < 0)) {
      return res.status(400).json({ error: 'Số lượng tồn kho không hợp lệ' });
    }
    if (trangThai !== undefined && !['Còn hàng', 'Hết hàng'].includes(trangThai)) {
      return res.status(400).json({ error: 'Trạng thái dịch vụ không hợp lệ' });
    }
    const result = await pool.query(
      'UPDATE services SET tenDichVu = COALESCE($1, tenDichVu), donGia = COALESCE($2, donGia), loaiDichVu = COALESCE($3, loaiDichVu), soLuongTon = COALESCE($4, soLuongTon), trangThai = COALESCE($5, trangThai) WHERE id = $6 RETURNING *',
      [tenDichVu !== undefined ? String(tenDichVu).trim() : null, price, loaiDichVu, stock, trangThai, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    res.json({ data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /admin/services/:id - Xóa dịch vụ khỏi hệ thống (Admin only).
 *
 * Response: { message: 'Xóa thành công' }
 * Yêu cầu: authenticate + requireAdmin
 */
router.delete('/services/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const futureBookingCount = await countFutureServiceBookings(req.params.id);
    if (futureBookingCount > 0) {
      return res.status(400).json({ error: futureBookingBlock('dịch vụ', futureBookingCount) });
    }
    const used = await pool.query('SELECT id FROM booking_services WHERE dichVuId = $1 LIMIT 1', [req.params.id]);
    if (used.rows.length > 0) {
      return res.status(400).json({ error: 'Không thể xóa dịch vụ đã có trong đơn đặt. Vui lòng vô hiệu hóa thay vì xóa.' });
    }
    await pool.query('DELETE FROM services WHERE id = $1', [req.params.id]);
    res.json({ message: 'Xóa thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /admin/notifications - Lấy danh sách thông báo của người dùng hiện tại.
 *
 * Query params:
 * - page: số trang (mặc định 1)
 * - limit: số lượng mỗi trang (mặc định 20)
 *
 * Trả về: { data: [...notifications], total, page, limit }
 * - Mỗi thông báo có: tieuDe, noiDung, loaiThongBao, maDonDat, daDoc, thoiGianTao
 * - Sắp xếp theo thời gian tạo giảm dần (mới nhất lên trước)
 *
 * Yêu cầu: authenticate (cả admin và user đều dùng chung endpoint này)
 */
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

/**
 * GET /admin/notifications/unread-count - Đếm số thông báo chưa đọc của user hiện tại.
 *
 * Trả về: { data: { count: số lượng } }
 * Dùng để hiển thị badge số trên chuông thông báo ở frontend.
 * Yêu cầu: authenticate
 */
router.get('/notifications/unread-count', authenticate, async (req, res, next) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*) as count FROM notifications WHERE nguoiDungId = $1 AND daDoc = FALSE',
      [req.user.id]
    );
    res.json({ data: { count: parseInt(result.rows[0].count) } });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /admin/notifications/:id/read - Đánh dấu 1 thông báo là đã đọc.
 *
 * Chỉ đánh dấu thông báo thuộc về user hiện tại (kiểm tra nguoiDungId).
 * Response: { message: 'Đã đọc' }
 * Yêu cầu: authenticate
 */
router.patch('/notifications/:id/read', authenticate, async (req, res) => {
  try {
    // Check notification exists first
    const check = await pool.query(
      'SELECT id, nguoiDungId FROM notifications WHERE id = $1',
      [req.params.id]
    );
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'Thông báo không tồn tại' });
    }
    // Check ownership - dùng loose equality để tránh type mismatch (DB number vs JWT string)
    const ownerId = check.rows[0].nguoidungid ?? check.rows[0].nguoiDungId;
    if (String(ownerId) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Bạn không có quyền truy cập thông báo này' });
    }
    await pool.query('UPDATE notifications SET daDoc = TRUE WHERE id = $1 AND nguoiDungId = $2', [req.params.id, req.user.id]);
    res.json({ message: 'Đã đọc' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /admin/notifications/read-all - Đánh dấu tất cả thông báo của user là đã đọc.
 *
 * Cập nhật hàng loạt: SET daDoc = TRUE cho tất cả thông báo của user hiện tại.
 * Response: { message: 'Đã đọc tất cả' }
 * Yêu cầu: authenticate
 */
router.patch('/notifications/read-all', authenticate, async (req, res) => {
  try {
    await pool.query('UPDATE notifications SET daDoc = TRUE WHERE nguoiDungId = $1', [req.user.id]);
    res.json({ message: 'Đã đọc tất cả' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /admin/discounts - Lấy danh sách tất cả mã giảm giá (Admin xem toàn bộ).
 *
 * Trả về: { data: [...discounts] } - tất cả mã giảm giá trong hệ thống
 * Sắp xếp theo created_at giảm dần.
 * Yêu cầu: authenticate (admin dùng để quản lý, user cũng xem được để biết mã nào đang có)
 */
router.get('/discounts', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM discounts ORDER BY created_at DESC');
    res.json({ data: result.rows });
  } catch (err) {
    console.error('[Discounts Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /admin/discounts/my - Lấy danh sách mã giảm giá khả dụng cho user hiện tại.
 *
 * Logic lọc mã giảm giá:
 * - Mã chung (nguoiDungId IS NULL): ai cũng dùng được
 * - Mã riêng (nguoiDungId = user hiện tại): chỉ user sở hữu mới thấy
 * - Phải đang Active
 * - Trong thời gian hiệu lực (ngayBatDau <= NOW() <= ngayKetThuc)
 * - Còn số lượng (soLuongDaDung < soLuongBanDau, hoặc soLuongBanDau = 0 là không giới hạn)
 * - Chưa vượt giới hạn sử dụng/user (usage_limit_per_user, mặc định 1)
 * - Không bị ẩn (is_hidden = FALSE)
 * - Kiểm tra target_audience:
 *   + 'all' hoặc NULL: ai cũng dùng được
 *   + 'new_user': chỉ user chưa có đơn nào (không tính đã hủy)
 *   + 'vip': chỉ user có isVIP = TRUE
 *
 * Trả về: { data: [...discounts] }
 * Yêu cầu: authenticate
 */
router.get('/discounts/my', authenticate, async (req, res) => {
  try {
    // Lấy mã chung (nguoiDungId IS NULL) và mã riêng của user
    // JOIN với subquery đếm số lần user đã dùng mỗi mã để kiểm tra giới hạn
    const result = await pool.query(
      `SELECT DISTINCT d.* FROM discounts d
       LEFT JOIN user_vouchers uv
         ON uv.discountId = d.id
        AND uv.nguoiDungId = $1
        AND uv.trangThai = 'Active'
       LEFT JOIN (
         SELECT UPPER(maGiamGia) AS maGiamGia, COUNT(*) as used_count
         FROM bookings
         WHERE nguoiDungId = $1 AND trangThai != 'Đã hủy'
         GROUP BY UPPER(maGiamGia)
       ) u ON UPPER(d.code) = u.maGiamGia
       WHERE (d.nguoiDungId IS NULL OR d.nguoiDungId = $1)
       AND d.trangThai = 'Active'
       AND (d.ngayBatDau IS NULL OR d.ngayBatDau <= NOW())
       AND (d.ngayKetThuc IS NULL OR d.ngayKetThuc >= NOW())
       AND (d.soLuongBanDau = 0 OR d.soLuongDaDung < d.soLuongBanDau)
       AND (u.used_count IS NULL OR u.used_count < COALESCE(d.usage_limit_per_user, 1))
       AND (COALESCE(d.is_hidden, FALSE) = FALSE OR uv.id IS NOT NULL)
       AND (
         d.conditions->>'target_audience' IS NULL
         OR d.conditions->>'target_audience' = 'all'
         OR (d.conditions->>'target_audience' = 'new_user' AND (SELECT COUNT(*) FROM bookings WHERE nguoiDungId = $1 AND trangThai != 'Đã hủy') = 0)
         OR (d.conditions->>'target_audience' = 'vip' AND (SELECT isVIP FROM users WHERE id = $1) = TRUE)
       )
       ORDER BY d.created_at DESC`,
      [req.user.id]
    );
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /admin/discounts - Tạo mã giảm giá mới (Admin only).
 *
 * Body: { code (bắt buộc), mucGiamGia (bắt buộc), noiDung?, moTa?, loaiGiamGia?, ngayBatDau?, ngayKetThuc?, soLuongBanDau?, trangThai? }
 * - loaiGiamGia: 'percentage' (giảm %) hoặc 'fixed' (giảm thẳng tiền), mặc định 'percentage'
 * - soLuongBanDau: số lượng mã phát hành, 0 = không giới hạn
 * - trangThai: mặc định 'Active'
 *
 * Response: 201 { data: newDiscount }
 * Yêu cầu: authenticate + requireAdmin
 */
router.post('/discounts', authenticate, requireAdmin, async (req, res) => {
  try {
    const parsed = buildDiscountPayload(req.body);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }
    const discount = parsed.value;
    const result = await pool.query(
      `INSERT INTO discounts
        (code, noiDung, moTa, loaiGiamGia, mucGiamGia, ngayBatDau, ngayKetThuc, soLuongBanDau,
         usage_limit_per_user, giamToiDa, conditions, trangThai, is_hidden)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
       RETURNING *`,
      [
        discount.code,
        discount.noiDung,
        discount.moTa,
        discount.loaiGiamGia,
        discount.mucGiamGia,
        discount.ngayBatDau,
        discount.ngayKetThuc,
        discount.soLuongBanDau,
        discount.usageLimitPerUser,
        discount.giamToiDa,
        JSON.stringify(discount.conditions),
        discount.trangThai,
        discount.isHidden,
      ]
    );
    res.status(201).json({ data: result.rows[0] });
  } catch (err) {
    // PostgreSQL unique violation: code = 23505
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Mã giảm giá đã tồn tại' });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /admin/discounts/:id - Cập nhật mã giảm giá (Admin only).
 *
 * Body: { code?, noiDung?, moTa?, loaiGiamGia?, mucGiamGia?, ngayBatDau?, ngayKetThuc?, soLuongBanDau?, trangThai? }
 * - Dùng COALESCE: chỉ cập nhật trường được gửi lên, giữ nguyên trường không gửi
 *
 * Response: { data: updatedDiscount }
 * Yêu cầu: authenticate + requireAdmin
 */
router.put('/discounts/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const existing = await pool.query('SELECT * FROM discounts WHERE id = $1', [req.params.id]);
    if (existing.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });

    const parsed = buildDiscountPayload(req.body, existing.rows[0]);
    if (parsed.error) {
      return res.status(400).json({ error: parsed.error });
    }
    const discount = parsed.value;
    const result = await pool.query(
      `UPDATE discounts
       SET code = $1,
           noiDung = $2,
           moTa = $3,
           loaiGiamGia = $4,
           mucGiamGia = $5,
           ngayBatDau = $6,
           ngayKetThuc = $7,
           soLuongBanDau = $8,
           usage_limit_per_user = $9,
           giamToiDa = $10,
           conditions = $11::jsonb,
           trangThai = $12,
           is_hidden = $13
       WHERE id = $14
       RETURNING *`,
      [
        discount.code,
        discount.noiDung,
        discount.moTa,
        discount.loaiGiamGia,
        discount.mucGiamGia,
        discount.ngayBatDau,
        discount.ngayKetThuc,
        discount.soLuongBanDau,
        discount.usageLimitPerUser,
        discount.giamToiDa,
        JSON.stringify(discount.conditions),
        discount.trangThai,
        discount.isHidden,
        req.params.id,
      ]
    );
    res.json({ data: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Mã giảm giá đã tồn tại' });
    }
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /admin/discounts/:id - Xóa mã giảm giá (Admin only).
 *
 * Response: { message: 'Xóa thành công' }
 * Yêu cầu: authenticate + requireAdmin
 */
router.delete('/discounts/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const discount = await pool.query('SELECT code FROM discounts WHERE id = $1', [req.params.id]);
    if (discount.rows.length === 0) return res.status(404).json({ error: 'Không tìm thấy' });
    const used = await pool.query("SELECT id FROM bookings WHERE maGiamGia = $1 AND trangThai != 'Đã hủy' LIMIT 1", [discount.rows[0].code]);
    if (used.rows.length > 0) {
      return res.status(400).json({ error: 'Không thể xóa mã giảm giá đang được sử dụng bởi đơn đặt chưa hủy.' });
    }
    await pool.query('DELETE FROM discounts WHERE id = $1', [req.params.id]);
    res.json({ message: 'Xóa thành công' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /admin/reports/export - Xuất báo cáo doanh thu ra file Excel (.xlsx).
 *
 * Query params:
 * - startDate: ngày bắt đầu (YYYY-MM-DD), mặc định hôm nay
 * - endDate: ngày kết thúc (YYYY-MM-DD), mặc định hôm nay
 *
 * File Excel gồm các cột:
 * - Mã đơn, Khách hàng, Sân, Ngày chơi, Khung giờ, Trạng thái, Tổng tiền, Đã cọc
 *
 * Sử dụng thư viện exceljs để tạo workbook.
 * Response trả về file .xlsx với header Content-Type phù hợp để browser tự động tải về.
 *
 * Yêu cầu: authenticate + requireAdmin
 */
router.get('/reports/export', authenticate, requireAdmin, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const todayStr = formatDateLocal(new Date());
    const start = startDate || todayStr;
    const end = endDate || todayStr;

    // Tạo workbook Excel với thư viện exceljs
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Báo cáo doanh thu');

    // Định nghĩa các cột trong file Excel
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

    // Lấy dữ liệu booking trong khoảng ngày, JOIN với các bảng liên quan
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

    // Thêm từng dòng dữ liệu vào sheet, format tiền theo kiểu Việt Nam
    result.rows.forEach(row => {
      sheet.addRow({
        id: row.id, customer: row.customer, court: row.court,
        date: row.date, timeslot: row.timeslot, status: row.status,
        total: Number(row.total).toLocaleString('vi-VN'),
        deposit: Number(row.deposit).toLocaleString('vi-VN'),
      });
    });

    // Set header để browser hiểu đây là file Excel và tự động tải về
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=bao-cao-doanh-thu-${start}-${end}.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /admin/discounts/validate - Kiểm tra tính hợp lệ của mã giảm giá và tính số tiền được giảm.
 *
 * Body: { code (bắt buộc), totalAmount, courtId, isClaiming? }
 * - totalAmount: tổng tiền đơn hàng hiện tại (để kiểm tra min_order_value và tính % giảm)
 * - courtId: ID sân đang chọn (để kiểm tra applicable_court_ids)
 * - isClaiming: nếu true -> "săn" mã về kho cá nhân (tạo bản sao riêng cho user)
 *
 * Quy trình kiểm tra:
 * 1. Tìm mã giảm giá theo code (ưu tiên mã riêng của user trước)
 * 2. Kiểm tra trạng thái Active
 * 3. Kiểm tra quyền sở hữu (nếu mã có nguoiDungId thì phải khớp với user)
 * 4. Kiểm tra ngày hiệu lực (ngayBatDau <= NOW <= ngayKetThuc)
 * 5. Kiểm tra số lượng còn (soLuongDaDung < soLuongBanDau)
 * 6. Kiểm tra giới hạn sử dụng/user (usage_limit_per_user)
 * 7. Kiểm tra điều kiện bổ sung từ JSONB conditions:
 *    - min_order_value: giá trị đơn tối thiểu
 *    - applicable_court_ids: chỉ áp dụng cho sân cụ thể
 *    - target_audience: 'new_user' (chưa có đơn nào) hoặc 'vip' (phải là VIP)
 * 8. Tính số tiền giảm:
 *    - percentage: discountAmount = totalAmount * mucGiamGia / 100 (có giới hạn giamToiDa)
 *    - fixed: discountAmount = min(mucGiamGia, totalAmount) (không giảm quá tổng tiền)
 * 9. Nếu isClaiming = true: tạo bản sao mã riêng cho user (lưu vào kho voucher)
 *
 * Response: { data: { ...discount, discountAmount, conditions } }
 * Yêu cầu: authenticate
 */
router.post('/discounts/validate', authenticate, async (req, res) => {
  try {
    const { code, totalAmount, courtId, isClaiming } = req.body;
    const userId = req.user.id;
    const validation = await validateDiscountForUse(pool, { code, userId, totalAmount, courtId });
    if (!validation.valid) {
      return res.status(validation.status || 400).json({ error: validation.error });
    }

    const { discount, discountAmount, conditions, normalizedCode } = validation;

    if (isClaiming) {
      const claimed = await claimDiscountForUser(pool, { discountId: discount.id, userId });
      if (!claimed) {
        return res.status(400).json({ error: 'Bạn đã sở hữu mã giảm giá này trong kho voucher rồi!' });
      }

      await pool.query(
        "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao) VALUES ($1, $2, $3, 'promotion')",
        [userId, 'Săn mã thành công!', `Chúc mừng! Bạn đã săn thành công mã giảm giá: ${normalizedCode}. Mã đã được thêm vào kho của bạn.`]
      );
    }

    res.json({ data: { ...discount, code: normalizedCode, discountAmount, conditions } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /admin/trigger-cancel-past - Trigger thủ công: hủy các đơn auto-booking quá hạn (Admin only).
 *
 * Gọi trực tiếp hàm autoCancelPastBookings() từ scheduler module.
 * Hữu ích cho việc testing và debug mà không cần đợi cron job chạy.
 *
 * Response: { message: 'Đã chạy autoCancelPastBookings' }
 * Yêu cầu: authenticate + requireAdmin
 */
router.post('/trigger-cancel-past', authenticate, requireAdmin, async (req, res) => {
  try {
    const { autoCancelPastBookings } = require('../services/scheduler');
    await autoCancelPastBookings();
    res.json({ message: 'Đã chạy autoCancelPastBookings' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /admin/trigger-vip-auto-book - Trigger thủ công: chạy VIP auto-booking (Admin only).
 *
 * Gọi processVipAutoBooking(true) với force = true để bỏ qua kiểm tra "chỉ chạy thứ 2".
 * Hữu ích cho testing và debug.
 *
 * Response: { message: 'Đã chạy VIP auto-booking (force mode)' }
 * Yêu cầu: authenticate + requireAdmin
 */
router.post('/trigger-vip-auto-book', authenticate, requireAdmin, async (req, res) => {
  try {
    const { processVipAutoBooking } = require('../services/scheduler');
    await processVipAutoBooking(true);
    res.json({ message: 'Đã chạy VIP auto-booking (force mode)' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /admin/schedule-board - Lấy dữ liệu bảng lịch sân cho giao diện lịch tuần (Admin only).
 *
 * Query params:
 * - start_date (bắt buộc): ngày bắt đầu khoảng thời gian (YYYY-MM-DD)
 * - end_date (bắt buộc): ngày kết thúc khoảng thời gian (YYYY-MM-DD)
 * - court_id (tùy chọn): lọc theo sân cụ thể, nếu không truyền thì lấy tất cả sân
 *
 * Validate:
 * - start_date và end_date phải là ngày hợp lệ
 * - start_date không được lớn hơn end_date
 * - court_id nếu có phải là số dương hợp lệ
 *
 * Trả về: { data: [...bookings] }
 * Mỗi booking có: booking_id, court_id, court_name, slot_id, start_time, end_time,
 *                 booking_date, user_name, is_vip, is_auto_booking, status
 *
 * Sắp xếp theo: ngày chơi -> giờ bắt đầu -> tên sân
 * Yêu cầu: authenticate + requireAdmin
 */
router.get('/schedule-board', authenticate, requireAdmin, async (req, res) => {
  try {
    const { start_date, end_date, court_id } = req.query;

    if (!start_date || !end_date) {
      return res.status(400).json({ error: 'Vui lòng cung cấp start_date và end_date' });
    }

    // Validate định dạng ngày
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
    // Nếu có court_id, thêm điều kiện lọc theo sân
    if (court_id !== undefined && court_id !== '') {
      const cid = parseInt(court_id, 10);
      if (isNaN(cid) || cid <= 0) {
        return res.status(400).json({ error: 'court_id không hợp lệ' });
      }
      params.push(cid);
      courtFilter = `AND b.sanId = $${params.length}`;
    }

    // JOIN 4 bảng: bookings + timeslots + users + courts để lấy đủ thông tin hiển thị
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
              b.isAutoBooking AS is_auto_booking,
              b.trangThai AS status
       FROM bookings b
       JOIN timeslots t ON b.khungGioId = t.id
       JOIN users u ON b.nguoiDungId = u.id
       JOIN courts c ON b.sanId = c.id
       WHERE b.ngayChoi BETWEEN $1 AND $2
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
