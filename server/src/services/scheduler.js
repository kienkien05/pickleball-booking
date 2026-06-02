/**
 * Dịch vụ lập lịch (scheduler) cho hệ thống Pickleball - chạy các tác vụ tự động định kỳ.
 *
 * File này cung cấp các hàm tự động chạy theo lịch (cron job) để quản lý trạng thái booking:
 *
 * 1. handleBookingStatus() - Chạy mỗi phút (* * * * *):
 *    - Tự động check-out: các đơn 'Đang sử dụng' mà đã quá giờ kết thúc -> chuyển thành 'Hoàn thành'
 *    - Hủy vắng mặt (no-show): các đơn 'Đã thanh toán', 'Đã cọc' hoặc 'Đã đặt'
 *      mà quá 15 phút sau giờ bắt đầu vẫn chưa check-in -> tự động hủy có lý do rõ ràng
 *
 * 2. autoCancelPastBookings() - Chạy hàng ngày lúc 00:05 (5 0 * * *):
 *    - Hủy các đơn auto-booking của VIP mà đã quá ngày chơi nhưng chưa thanh toán
 *    - Chỉ hủy nếu trạng thái không phải 'Đã hủy', 'Hoàn thành', 'Đang sử dụng'
 *
 * 3. processVipAutoBooking(force) - Chạy mỗi thứ 2 lúc 00:01 (1 0 * * 1):
 *    - Luồng legacy cho dữ liệu VIP cũ chưa có autoBookingSeriesId.
 *      Luồng VIP mới tạo đủ booking 30 ngày ngay tại API /bookings.
 *    - Nếu khung giờ đã có người đặt -> gửi thông báo xung đột và tắt auto-booking
 *    - Nếu khung giờ trống -> tự động tạo đơn mới với trạng thái 'Đã cọc' (cọc 10%)
 *    - Tham số force: nếu true thì bỏ qua kiểm tra thứ 2 (dùng cho testing/admin trigger)
 *
 * 4. startScheduler(cron) - Khởi động tất cả cron jobs:
 *    - Đăng ký 3 cron job với thư viện node-cron
 *    - Log ra console để xác nhận scheduler đã chạy
 *
 * Các module được export để có thể gọi thủ công từ admin route (testing/debug).
 */

const { pool } = require('../config/database');
const { cancelBookingWithReason, getField, checkAndRewardLoyalty } = require('../utils/bookingCancellation');

function formatDateLocal(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/**
 * Xử lý tự động trạng thái booking: check-out khi hết giờ, hủy no-show khi quá hạn.
 *
 * Chạy mỗi phút để kiểm tra:
 * - Tìm các booking 'Đang sử dụng' có giờ kết thúc <= thời gian hiện tại -> tự động check-out
 * - Tìm các booking 'Đã thanh toán'/'Đã cọc'/'Đã đặt' quá 15 phút sau giờ bắt đầu -> hủy vắng mặt
 *
 * Mỗi lần cập nhật trạng thái đều gửi thông báo (notification) cho người dùng liên quan.
 */
async function handleBookingStatus() {
  const client = await pool.connect();
  try {
    const now = new Date();
    const today = formatDateLocal(now);
    const currentTime = now.toTimeString().slice(0, 5);
    const noShowCutoff = new Date(now.getTime() - 15 * 60 * 1000);
    const noShowCutoffDate = formatDateLocal(noShowCutoff);
    const noShowCutoffTime = noShowCutoff.toTimeString().slice(0, 5);
    console.log(`[Scheduler] Checking status at ${today} ${currentTime}`);

    // 1. Tự động check-out: tìm các booking 'Đang sử dụng' đã hết giờ
    // JOIN với timeslots để lấy giờ kết thúc, so sánh với thời gian hiện tại
    const checkoutResult = await client.query(
      `SELECT b.* FROM bookings b
       JOIN timeslots t ON b.khungGioId = t.id
       WHERE b.trangThai = 'Đang sử dụng'
       AND (
         b.ngayChoi < $1::date
         OR (b.ngayChoi = $1::date AND t.gioKetThuc <= $2::time)
       )`,
      [today, currentTime]
    );

    for (const booking of checkoutResult.rows) {
      const bookingId = getField(booking, 'id');
      const userId = getField(booking, 'nguoiDungId', 'nguoidungid');
      await client.query(
        "UPDATE bookings SET trangThai = 'Hoàn thành', updated_at = NOW() WHERE id = $1",
        [bookingId]
      );
      await client.query(
        "UPDATE payments SET trangThai = 'Thành công' WHERE donDatId = $1 AND trangThai IN ('Chờ thanh toán', 'Chờ xác nhận')",
        [bookingId]
      );
      await checkAndRewardLoyalty(client, userId);
      await client.query(
        "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat) VALUES ($1, $2, $3, 'auto_checkout', $4)",
        [userId, 'Tự động Check-out', `Hệ thống đã tự động check-out cho đơn #${bookingId}`, bookingId]
      );
    }

    // 2. Hủy quá hạn thanh toán: chỉ áp dụng cho đơn đã cọc/pending online
    const paymentTimeoutResult = await client.query(
      `SELECT DISTINCT b.*
       FROM bookings b
       JOIN payments p ON p.donDatId = b.id
       WHERE b.trangThai = 'Đã cọc'
       AND p.trangThai IN ('Chờ thanh toán', 'Chờ xác nhận')
       AND p.ngayGiaoDich <= NOW() - INTERVAL '15 minutes'`
    );

    if (paymentTimeoutResult.rows.length > 0) {
      console.log(`[Scheduler] Found ${paymentTimeoutResult.rows.length} payment-timeout bookings to cancel`);
    }

    for (const booking of paymentTimeoutResult.rows) {
      await cancelBookingWithReason(client, booking, 'PAYMENT_TIMEOUT');
    }

    // 3. Hủy vắng mặt (no-show): tìm booking đã thanh toán/đã đặt/đã cọc nhưng quá 15 phút chưa check-in
    const noShowResult = await client.query(
      `SELECT b.* FROM bookings b
       JOIN timeslots t ON b.khungGioId = t.id
       WHERE b.trangThai IN ('Đã thanh toán', 'Đã đặt', 'Đã cọc')
       AND (
         b.ngayChoi < $1::date
         OR (b.ngayChoi = $1::date AND t.gioBatDau <= $2::time)
       )`,
      [noShowCutoffDate, noShowCutoffTime]
    );

    if (noShowResult.rows.length > 0) {
      console.log(`[Scheduler] Found ${noShowResult.rows.length} no-shows to cancel`);
    }

    for (const booking of noShowResult.rows) {
      await cancelBookingWithReason(client, booking, 'AUTO_NOSHOW');
    }
  } catch (err) {
    console.error('Booking status handler error:', err);
  } finally {
    client.release();
  }
}

/**
 * Hủy các đơn auto-booking đã quá ngày chơi nhưng chưa thanh toán.
 *
 * Chạy hàng ngày, tìm tất cả booking:
 * - Có isAutoBooking = TRUE (được tạo tự động cho VIP)
 * - Ngày chơi < ngày hiện tại
 * - Trạng thái không phải 'Đã hủy', 'Hoàn thành', 'Đang sử dụng'
 * -> Cập nhật trạng thái thành 'Đã hủy' và gửi thông báo cho user.
 */
async function autoCancelPastBookings() {
  const client = await pool.connect();
  try {
    const today = formatDateLocal(new Date());
    const result = await client.query(
      `SELECT * FROM bookings
       WHERE isAutoBooking = TRUE
       AND ngayChoi < $1
       AND trangThai NOT IN ('Đã hủy', 'Hoàn thành', 'Đang sử dụng')
       ORDER BY ngayChoi ASC`,
      [today]
    );

    for (const booking of result.rows) {
      await cancelBookingWithReason(client, booking, 'AUTO_BOOKING_EXPIRED');
    }
  } catch (err) {
    console.error('Auto cancel past bookings error:', err);
  } finally {
    client.release();
  }
}

/**
 * Tự động đặt lịch cho khách VIP legacy - chạy mỗi thứ 2 lúc 00:01.
 *
 * Logic:
 * 1. Lấy danh sách tất cả VIP có lịch sử auto-booking cũ (isAutoBooking = TRUE, chưa có autoBookingSeriesId)
 * 2. Với mỗi VIP, lấy lịch đặt gần nhất và tính ngày tiếp theo (cách 7 ngày)
 * 3. Nếu ngày đó đã có booking trùng -> gửi thông báo xung đột và tắt auto-booking
 * 4. Nếu khung giờ còn trống -> tự động tạo booking mới trạng thái 'Đã cọc' (cọc 10%),
 *    gửi thông báo thành công cho VIP
 *
 * @param {boolean} force - Nếu true thì bỏ qua kiểm tra thứ 2 (dùng cho admin trigger thủ công)
 */
async function processVipAutoBooking(force = false) {
  const client = await pool.connect();
  try {
    const today = new Date();
    if (!force && today.getDay() !== 1) return;

    // Lấy danh sách VIP có auto-booking, mỗi user chỉ lấy lịch gần nhất
    const vipBookings = await client.query(
      `SELECT DISTINCT ON (b.nguoiDungId, b.sanId, b.khungGioId)
        b.nguoiDungId, b.sanId, b.khungGioId, b.ngayChoi as lastBookingDate, u.email
       FROM bookings b
       JOIN users u ON b.nguoiDungId = u.id
       WHERE u.isVIP = TRUE
       AND b.isAutoBooking = TRUE
       AND b.autoBookingSeriesId IS NULL
       AND b.trangThai NOT IN ('Đã hủy')
       ORDER BY b.nguoiDungId, b.sanId, b.khungGioId, b.ngayChoi DESC`
    );

    for (const vip of vipBookings.rows) {
      const courtCheck = await client.query('SELECT trangThai FROM courts WHERE id = $1', [vip.sanid]);
      if (courtCheck.rows.length === 0 || courtCheck.rows[0].trangThai === 'Ẩn' || courtCheck.rows[0].trangThai === 'Bảo trì') {
        await client.query(
          "UPDATE bookings SET isAutoBooking = FALSE, updated_at = NOW() WHERE nguoiDungId = $1 AND sanId = $2 AND khungGioId = $3 AND isAutoBooking = TRUE",
          [vip.nguoidungid, vip.sanid, vip.khunggioid]
        );
        await client.query(
          "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao) VALUES ($1, $2, $3, 'vip_auto_conflict')",
          [vip.nguoidungid, 'Lịch VIP tự động thất bại', 'Không thể đặt lịch tự động do sân đang bảo trì hoặc tạm ẩn. Tính năng tự động đặt đã bị tắt cho khung giờ này.']
        );
        continue;
      }

      const lastDate = new Date(vip.lastbookingdate);
      let nextDate = new Date(lastDate);
      nextDate.setDate(nextDate.getDate() + 7);

      // Nhảy qua các ngày trong quá khứ
      while (nextDate <= today) {
        nextDate.setDate(nextDate.getDate() + 7);
      }

      const targetDate = formatDateLocal(nextDate);

      // Kiểm tra đã có booking cho ngày đó chưa
      const existing = await client.query(
        `SELECT id FROM bookings WHERE nguoiDungId = $1 AND sanId = $2 AND khungGioId = $3
         AND ngayChoi = $4 AND trangThai NOT IN ('Đã hủy')`,
        [vip.nguoidungid, vip.sanid, vip.khunggioid, targetDate]
      );

      if (existing.rows.length > 0) continue;

      // Kiểm tra xung đột với người khác đã đặt
      const conflict = await client.query(
        `SELECT id FROM bookings WHERE sanId = $1 AND khungGioId = $2
         AND ngayChoi = $3 AND trangThai NOT IN ('Đã hủy')`,
        [vip.sanid, vip.khunggioid, targetDate]
      );

      if (conflict.rows.length > 0) {
        // Có xung đột: tắt auto-booking và thông báo cho VIP
        await client.query(
          "UPDATE bookings SET isAutoBooking = FALSE, updated_at = NOW() WHERE nguoiDungId = $1 AND sanId = $2 AND khungGioId = $3 AND isAutoBooking = TRUE",
          [vip.nguoidungid, vip.sanid, vip.khunggioid]
        );
        await client.query(
          "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao) VALUES ($1, $2, $3, 'vip_auto_conflict')",
          [vip.nguoidungid, 'Lịch VIP bị trùng', `Khung giờ tự động cho ngày ${targetDate} đã có người đặt trước. Tính năng tự động đặt đã bị tắt cho khung giờ này.`]
        );
        await notifyAdmins(client, {
          title: 'Lịch VIP bị trùng',
          message: `Lịch đặt tự động của VIP #${vip.nguoidungid} ngày ${targetDate} tại sân #${vip.sanid} bị trùng. Hệ thống đã tắt tính năng đặt tự động cho khung giờ này.`,
          type: 'vip_auto_conflict'
        });
        continue;
      }

      // Lấy giá khung giờ và tạo booking mới
      const slot = await client.query('SELECT mucGia FROM timeslots WHERE id = $1', [vip.khunggioid]);
      if (slot.rows.length === 0) continue;

      const slotPrice = parseFloat(slot.rows[0].mucgia);
      const booking = await client.query(
        `INSERT INTO bookings (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, trangThai, isAutoBooking)
         VALUES ($1, $2, $3, $4, $5, $6, 'Đã cọc', TRUE) RETURNING id`,
        [vip.nguoidungid, vip.sanid, vip.khunggioid, targetDate, slotPrice, Math.round(slotPrice * 0.1)]
      );

      // Gửi thông báo VIP đặt lịch thành công
      await client.query(
        "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat) VALUES ($1, $2, $3, 'vip_auto_success', $4)",
        [vip.nguoidungid, 'Đặt lịch VIP tự động', `Đã tự động đặt lịch cho ngày ${targetDate}. Vui lòng thanh toán trước ngày chơi.`, booking.rows[0].id]
      );
      await notifyAdmins(client, {
        title: 'Tự động đặt lịch VIP thành công',
        message: `Hệ thống đã tự động đặt thành công lịch chơi ngày ${targetDate} cho khách VIP #${vip.nguoidungid}. Mã đơn: #${booking.rows[0].id}.`,
        type: 'vip_auto_success',
        bookingId: booking.rows[0].id
      });
    }
  } catch (err) {
    console.error('VIP auto-booking error:', err);
  } finally {
    client.release();
  }
}

/**
 * Khởi động tất cả cron jobs cho hệ thống scheduler.
 *
 * Đăng ký 3 cron job:
 * 1. Mỗi phút: kiểm tra và cập nhật trạng thái booking (check-out, no-show)
 * 2. Hàng ngày 00:05: hủy auto-booking quá hạn chưa thanh toán
 * 3. Thứ 2 hàng tuần 00:01: tự động đặt lịch cho VIP tuần tiếp theo
 *
 * @param {Object} cron - Thư viện node-cron đã require
 */
function startScheduler(cron) {
  cron.schedule('* * * * *', handleBookingStatus);
  cron.schedule('5 0 * * *', autoCancelPastBookings);
  cron.schedule('1 0 * * 1', processVipAutoBooking);
  console.log('Schedulers started: check-in/out (every min), cancel past (daily 00:05), VIP auto-booking (Monday 00:01)');
}

module.exports = { startScheduler, handleBookingStatus, processVipAutoBooking, autoCancelPastBookings };
