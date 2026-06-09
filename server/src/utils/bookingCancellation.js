const DEFAULT_NO_REFUND_TEXT = 'Theo chính sách mặc định, khoản đã thanh toán/cọc không được hoàn lại.';
const { notifyAdmins } = require('./notifications');

function getField(row, ...keys) {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

function isPaidBooking(booking) {
  const status = getField(booking, 'trangThai', 'trangthai');
  return status === 'Đã thanh toán';
}

function withNoRefundIfPaid(booking, message) {
  return isPaidBooking(booking) ? `${message} ${DEFAULT_NO_REFUND_TEXT}` : message;
}

function withRefundOptionIfPaid(booking, message) {
  return isPaidBooking(booking) ? `${message} Khoản thanh toán/cọc của bạn sẽ được hệ thống hoàn trả hoặc bảo lưu.` : message;
}

const CANCELLATION_REASONS = {
  USER_CANCEL: {
    type: 'booking_cancelled',
    title: 'Hủy đặt sân',
    note: (booking) => withNoRefundIfPaid(booking, 'Khách tự hủy lịch đặt sân.'),
    message: (id, booking) => withNoRefundIfPaid(booking, `Đơn #${id} đã được hủy theo yêu cầu của bạn.`),
  },
  ADMIN_NOSHOW: {
    type: 'noshow',
    title: 'Hủy do vắng mặt',
    note: (booking) => withNoRefundIfPaid(booking, 'Khách không đến/check-in đúng hạn.'),
    message: (id, booking) => withNoRefundIfPaid(booking, `Đơn #${id} đã bị hủy vì bạn không đến/check-in đúng hạn.`),
  },
  AUTO_NOSHOW: {
    type: 'noshow',
    title: 'Tự động hủy do vắng mặt',
    note: (booking) => withNoRefundIfPaid(booking, 'Hệ thống tự động hủy do quá 15 phút từ giờ bắt đầu nhưng chưa check-in.'),
    message: (id, booking) => withNoRefundIfPaid(booking, `Đơn #${id} đã bị hủy vì bạn không đến/check-in trong 15 phút từ giờ bắt đầu.`),
  },
  PAYMENT_TIMEOUT: {
    type: 'auto_cancel',
    title: 'Tự động hủy do quá hạn thanh toán',
    note: (booking) => withNoRefundIfPaid(booking, 'Hệ thống tự động hủy do quá 15 phút nhưng đơn chưa hoàn tất thanh toán.'),
    message: (id, booking) => withNoRefundIfPaid(booking, `Đơn #${id} đã bị tự động hủy do quá 15 phút nhưng chưa hoàn tất thanh toán.`),
  },
  AUTO_BOOKING_EXPIRED: {
    type: 'auto_cancel',
    title: 'Tự động hủy đơn quá hạn',
    note: (booking) => withNoRefundIfPaid(booking, 'Hệ thống tự động hủy do quá ngày chơi nhưng đơn tự động chưa hoàn tất thanh toán.'),
    message: (id, booking) => withNoRefundIfPaid(booking, `Đơn tự động #${id} đã bị hủy do quá ngày chơi nhưng chưa hoàn tất thanh toán.`),
  },
  VIP_CONFLICT: {
    type: 'vip_auto_conflict',
    title: 'Hủy lịch VIP tự động',
    note: (booking) => withRefundOptionIfPaid(booking, 'Lịch VIP tự động bị hủy do khung giờ đã có người đặt trước.'),
    message: (id, booking) => withRefundOptionIfPaid(booking, `Đơn VIP tự động #${id} đã bị hủy do khung giờ đã có người đặt trước.`),
  },
  SYSTEM_CHANGE: {
    type: 'auto_cancel',
    title: 'Hủy do thay đổi từ hệ thống',
    note: (booking) => withRefundOptionIfPaid(booking, 'Đơn bị hủy do sân/khung giờ có thay đổi từ hệ thống.'),
    message: (id, booking) => withRefundOptionIfPaid(booking, `Đơn #${id} đã bị hủy do sân/khung giờ có thay đổi từ hệ thống.`),
  },
};

async function cancelBookingWithReason(client, booking, reasonKey, overrides = {}) {
  const reason = CANCELLATION_REASONS[reasonKey] || CANCELLATION_REASONS.SYSTEM_CHANGE;
  const bookingId = getField(booking, 'id');
  const userId = getField(booking, 'nguoiDungId', 'nguoidungid');
  const note = overrides.note || (typeof reason.note === 'function' ? reason.note(booking) : reason.note);
  const title = overrides.title || reason.title;
  const message = overrides.message || reason.message(bookingId, booking);
  const type = overrides.type || reason.type;

  if (!bookingId || !userId) {
    throw new Error('Thiếu thông tin booking để hủy');
  }

  await client.query(
    "UPDATE bookings SET trangThai = 'Đã hủy', ghiChu = $2, updated_at = NOW() WHERE id = $1",
    [bookingId, note]
  );

  // Đơn đã thanh toán giữ payment = 'Thành công' để vẫn tính doanh thu/phí giữ chỗ.
  // Chỉ các payment chưa thu tiền thật mới chuyển sang 'Đã hủy'.
  await client.query(
    "UPDATE payments SET trangThai = 'Đã hủy' WHERE donDatId = $1 AND trangThai IN ('Chờ thanh toán', 'Chờ xác nhận')",
    [bookingId]
  );

  // Hoàn lại stock dịch vụ khi hủy đơn
  const bookingServices = await client.query(
    'SELECT dichVuId, soLuong FROM booking_services WHERE donDatId = $1',
    [bookingId]
  );
  for (const bs of bookingServices.rows) {
    await client.query(
      'UPDATE services SET soLuongTon = soLuongTon + $1 WHERE id = $2',
      [bs.soluong, bs.dichvuid]
    );
  }

  // Không hoàn trạng thái/lượt dùng voucher khi hủy đơn. usage_limit_per_user
  // được hiểu là lịch sử đã dùng mã, nên hủy booking không cho user dùng lại mã đó.

  await client.query(
    "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat) VALUES ($1, $2, $3, $4, $5)",
    [userId, title, message, type, bookingId]
  );

  await notifyAdmins(client, {
    title: `Đơn #${bookingId}: ${title}`,
    message: note,
    type,
    bookingId,
  });
}

async function checkAndRewardLoyalty(client, userId) {
  const countRes = await client.query(
    "SELECT COUNT(*)::int as count FROM bookings WHERE nguoiDungId = $1 AND trangThai = 'Hoàn thành'",
    [userId]
  );
  const totalCompleted = countRes.rows[0].count || 0;

  if (totalCompleted > 0 && totalCompleted % 3 === 0) {
    const randomStr = Math.random().toString(36).substring(2, 6).toUpperCase();
    const rewardCode = `LTY10-${randomStr}`;
    
    await client.query(
      `INSERT INTO discounts (code, noiDung, moTa, loaiGiamGia, mucGiamGia, ngayBatDau, ngayKetThuc, soLuongBanDau, soLuongDaDung, trangThai, nguoiDungId)
       VALUES ($1, 'Quà tặng đặt sân', 'Mã giảm giá 10% tri ân mỗi 3 đơn đặt sân hoàn thành', 'percentage', 10, NOW(), '2026-12-31', 1, 0, 'Active', $2)`,
      [rewardCode, userId]
    );

    await client.query(
      "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao) VALUES ($1, $2, $3, 'promotion')",
      [userId, 'Quà tặng tri ân!', `Bạn vừa hoàn thành thêm đơn đặt sân thứ ${totalCompleted}! Hệ thống tặng bạn mã giảm giá 10% tri ân: ${rewardCode}`]
    );
    
    await notifyAdmins(client, {
      title: 'Tặng quà tri ân loyalty',
      message: `User #${userId} đạt mốc ${totalCompleted} đơn đặt sân hoàn thành. Đã tặng mã ${rewardCode}.`,
      type: 'promotion'
    });
  }
}

module.exports = {
  CANCELLATION_REASONS,
  DEFAULT_NO_REFUND_TEXT,
  cancelBookingWithReason,
  getField,
  isPaidBooking,
  checkAndRewardLoyalty,
};
