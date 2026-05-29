function parseConditions(raw) {
  if (!raw) return {};
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) || {};
    } catch {
      return {};
    }
  }
  return typeof raw === 'object' ? raw : {};
}

function normalizeCode(code) {
  return String(code || '').trim().toUpperCase();
}

async function findDiscountForUser(db, code, userId) {
  const normalizedCode = normalizeCode(code);
  if (!normalizedCode) return null;

  const result = await db.query(
    `SELECT
       id,
       code,
       noiDung AS "noiDung",
       moTa AS "moTa",
       loaiGiamGia AS "loaiGiamGia",
       mucGiamGia AS "mucGiamGia",
       ngayBatDau AS "ngayBatDau",
       ngayKetThuc AS "ngayKetThuc",
       soLuongBanDau AS "soLuongBanDau",
       soLuongDaDung AS "soLuongDaDung",
       usage_limit_per_user AS "usageLimitPerUser",
       giamToiDa AS "giamToiDa",
       conditions,
       nguoiDungId AS "nguoiDungId",
       trangThai AS "trangThai",
       is_hidden AS "isHidden"
     FROM discounts
     WHERE UPPER(code) = $1
       AND (nguoiDungId IS NULL OR nguoiDungId = $2)
     ORDER BY CASE WHEN nguoiDungId = $2 THEN 0 ELSE 1 END
     LIMIT 1
     FOR UPDATE`,
    [normalizedCode, userId]
  );

  return result.rows[0] || null;
}

function calculateDiscountAmount(discount, totalAmount) {
  const type = discount.loaiGiamGia || 'percentage';
  const amount = Number(discount.mucGiamGia || 0);
  const maxAmount = Number(discount.giamToiDa || 0);

  if (type === 'percentage') {
    let discountAmount = Math.round(totalAmount * amount / 100);
    if (maxAmount > 0) discountAmount = Math.min(discountAmount, maxAmount);
    return Math.min(discountAmount, totalAmount);
  }

  return Math.min(amount, totalAmount);
}

async function validateDiscountForUse(db, { code, userId, totalAmount, courtId }) {
  const normalizedCode = normalizeCode(code);
  const amount = Number(totalAmount || 0);
  if (!normalizedCode) {
    return { valid: false, status: 400, error: 'Vui lòng nhập mã giảm giá' };
  }
  if (!Number.isFinite(amount) || amount < 0) {
    return { valid: false, status: 400, error: 'Tổng tiền không hợp lệ' };
  }

  const discount = await findDiscountForUser(db, normalizedCode, userId);
  if (!discount) {
    return { valid: false, status: 400, error: 'Mã giảm giá không tồn tại' };
  }

  if (String(discount.trangThai || '').toLowerCase() !== 'active') {
    return { valid: false, status: 400, error: 'Mã giảm giá hiện đang bị vô hiệu hóa' };
  }

  if (discount.nguoiDungId && Number(discount.nguoiDungId) !== Number(userId)) {
    return { valid: false, status: 400, error: 'Mã giảm giá này không thuộc sở hữu của bạn' };
  }

  const now = new Date();
  if (discount.ngayBatDau && new Date(discount.ngayBatDau) > now) {
    return { valid: false, status: 400, error: 'Mã giảm giá chưa đến ngày hiệu lực' };
  }
  if (discount.ngayKetThuc && new Date(discount.ngayKetThuc) < now) {
    return { valid: false, status: 400, error: 'Mã giảm giá đã hết hạn sử dụng' };
  }

  const initialQuantity = Number(discount.soLuongBanDau || 0);
  const usedQuantity = Number(discount.soLuongDaDung || 0);
  if (initialQuantity > 0 && usedQuantity >= initialQuantity) {
    return { valid: false, status: 400, error: 'Mã giảm giá đã được sử dụng hết số lượng' };
  }

  const usageLimit = discount.usageLimitPerUser !== undefined && discount.usageLimitPerUser !== null 
    ? Number(discount.usageLimitPerUser) 
    : 1;
  if (usageLimit > 0) {
    const userUsageRes = await db.query(
      "SELECT COUNT(*)::int AS count FROM bookings WHERE nguoiDungId = $1 AND UPPER(maGiamGia) = $2 AND trangThai != 'Đã hủy'",
      [userId, normalizedCode]
    );
    if (Number(userUsageRes.rows[0]?.count || 0) >= usageLimit) {
      return { valid: false, status: 400, error: `Bạn đã sử dụng mã này rồi. Giới hạn là ${usageLimit} lần/khách.` };
    }
  }

  const conditions = parseConditions(discount.conditions);
  const minOrderValue = Number(conditions.min_order_value || 0);
  if (minOrderValue > 0 && amount < minOrderValue) {
    return {
      valid: false,
      status: 400,
      error: `Đơn hàng tối thiểu phải từ ${minOrderValue.toLocaleString('vi-VN')}đ để dùng mã này`,
    };
  }

  const applicableCourtIds = Array.isArray(conditions.applicable_court_ids)
    ? conditions.applicable_court_ids.map(Number).filter(Number.isInteger)
    : [];
  if (applicableCourtIds.length > 0 && !applicableCourtIds.includes(Number(courtId))) {
    return { valid: false, status: 400, error: 'Mã này không áp dụng cho sân bạn chọn' };
  }

  if (conditions.target_audience === 'new_user') {
    const bookingCountRes = await db.query(
      "SELECT COUNT(*)::int AS count FROM bookings WHERE nguoiDungId = $1 AND trangThai != 'Đã hủy'",
      [userId]
    );
    if (Number(bookingCountRes.rows[0]?.count || 0) > 0) {
      return { valid: false, status: 400, error: 'Mã này chỉ dành cho khách hàng mới đặt lần đầu' };
    }
  }

  if (conditions.target_audience === 'vip') {
    const userRes = await db.query('SELECT isVIP AS "isVIP" FROM users WHERE id = $1', [userId]);
    if (!userRes.rows[0]?.isVIP && !userRes.rows[0]?.isvip) {
      return { valid: false, status: 400, error: 'Mã này chỉ dành cho thành viên VIP' };
    }
  }

  const discountAmount = calculateDiscountAmount(discount, amount);
  return { valid: true, discount, conditions, discountAmount, normalizedCode };
}

async function markDiscountUsed(db, discountId) {
  await db.query('UPDATE discounts SET soLuongDaDung = soLuongDaDung + 1 WHERE id = $1', [discountId]);
}

async function claimDiscountForUser(db, { discountId, userId }) {
  const result = await db.query(
    `INSERT INTO user_vouchers (nguoiDungId, discountId, trangThai)
     VALUES ($1, $2, 'Active')
     ON CONFLICT (nguoiDungId, discountId) DO NOTHING
     RETURNING id`,
    [userId, discountId]
  );
  return result.rows.length > 0;
}

module.exports = {
  normalizeCode,
  parseConditions,
  validateDiscountForUse,
  markDiscountUsed,
  claimDiscountForUser,
};
