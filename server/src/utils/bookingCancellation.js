const DEFAULT_NO_REFUND_TEXT = 'Theo chính sách mặc định, khoản đã thanh toán/cọc không được hoàn lại.';

function getField(row, ...keys) {
  for (const key of keys) {
    if (row && row[key] !== undefined && row[key] !== null) return row[key];
  }
  return undefined;
}

function isPaidBooking(booking) {
  const status = getField(booking, 'trangThai', 'trangthai');
  return status === 'Đã thanh toán' || status === 'Đã cọc';
}

function withNoRefundIfPaid(booking, message) {
  return isPaidBooking(booking) ? `${message} ${DEFAULT_NO_REFUND_TEXT}` : message;
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
    note: (booking) => withNoRefundIfPaid(booking, 'Lịch VIP tự động bị hủy do khung giờ đã có người đặt trước.'),
    message: (id, booking) => withNoRefundIfPaid(booking, `Đơn VIP tự động #${id} đã bị hủy do khung giờ đã có người đặt trước.`),
  },
  SYSTEM_CHANGE: {
    type: 'auto_cancel',
    title: 'Hủy do thay đổi từ hệ thống',
    note: (booking) => withNoRefundIfPaid(booking, 'Đơn bị hủy do sân/khung giờ có thay đổi từ hệ thống.'),
    message: (id, booking) => withNoRefundIfPaid(booking, `Đơn #${id} đã bị hủy do sân/khung giờ có thay đổi từ hệ thống.`),
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
  await client.query(
    "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat) VALUES ($1, $2, $3, $4, $5)",
    [userId, title, message, type, bookingId]
  );
}

module.exports = {
  CANCELLATION_REASONS,
  DEFAULT_NO_REFUND_TEXT,
  cancelBookingWithReason,
  getField,
  isPaidBooking,
};
