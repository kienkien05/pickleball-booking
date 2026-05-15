const { pool } = require('../config/database');

// Auto check-out and No-show management
async function handleBookingStatus() {
  const client = await pool.connect();
  try {
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const currentTime = now.toTimeString().slice(0, 5);
    console.log(`[Scheduler] Checking status at ${today} ${currentTime}`);

    // 1. Auto check-out bookings past end time (only if they were actually checked in)
    const checkoutResult = await client.query(
      `SELECT b.* FROM bookings b
       JOIN timeslots t ON b.khungGioId = t.id
       WHERE b.trangThai = 'Đang sử dụng'
       AND b.ngayChoi = $1
       AND t.gioKetThuc <= $2::time`,
      [today, currentTime]
    );

    for (const booking of checkoutResult.rows) {
      await client.query(
        "UPDATE bookings SET trangThai = 'Hoàn thành', updated_at = NOW() WHERE id = $1",
        [booking.id]
      );
      await client.query(
        "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat) VALUES ($1, $2, $3, 'auto_checkout', $4)",
        [booking.nguoidungid, 'Tự động Check-out', `Hệ thống đã tự động check-out cho đơn #${booking.id}`, booking.id]
      );
    }

    // Cancel no-shows (paid bookings past 15 min of start time)
    const noShowResult = await client.query(
      `SELECT b.* FROM bookings b
       JOIN timeslots t ON b.khungGioId = t.id
       WHERE b.trangThai IN ('Đã thanh toán', 'Đã đặt')
       AND b.ngayChoi = $1
       AND t.gioBatDau <= ($2::time - INTERVAL '15 minutes')`,
      [today, currentTime]
    );

    if (noShowResult.rows.length > 0) {
      console.log(`[Scheduler] Found ${noShowResult.rows.length} no-shows to cancel`);
    }

    for (const booking of noShowResult.rows) {
      await client.query(
        "UPDATE bookings SET trangThai = 'Đã hủy', ghiChu = 'No-show (tự động)', updated_at = NOW() WHERE id = $1",
        [booking.id]
      );
      await client.query(
        "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat) VALUES ($1, $2, $3, 'noshow', $4)",
        [booking.nguoidungid, 'Hủy vắng mặt', `Đơn #${booking.id} đã bị hủy do không đến đúng giờ.`, booking.id]
      );
    }
  } catch (err) {
    console.error('Booking status handler error:', err);
  } finally {
    client.release();
  }
}

// Cancel auto-booked bookings from past days that were never paid
async function autoCancelPastBookings() {
  const client = await pool.connect();
  try {
    const result = await client.query(
      `UPDATE bookings SET trangThai = 'Đã hủy', ghiChu = 'Tự động hủy (quá hạn)', updated_at = NOW()
       WHERE isAutoBooking = TRUE
       AND ngayChoi < CURRENT_DATE
       AND trangThai NOT IN ('Đã hủy', 'Hoàn thành', 'Đang sử dụng')
       RETURNING id, nguoiDungId`
    );

    for (const booking of result.rows) {
      await client.query(
        "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat) VALUES ($1, $2, $3, 'auto_cancel', $4)",
        [booking.nguoidungid, 'Tự động hủy đơn quá hạn', `Đơn tự động #${booking.id} đã bị hủy do quá ngày chơi mà chưa thanh toán.`, booking.id]
      );
    }
  } catch (err) {
    console.error('Auto cancel past bookings error:', err);
  } finally {
    client.release();
  }
}

// VIP auto-booking: every Monday at 00:01, create bookings for the next occurrence
async function processVipAutoBooking(force = false) {
  const client = await pool.connect();
  try {
    const today = new Date();
    if (!force && today.getDay() !== 1) return;

    const vipBookings = await client.query(
      `SELECT DISTINCT ON (b.nguoiDungId, b.sanId, b.khungGioId)
        b.nguoiDungId, b.sanId, b.khungGioId, b.ngayChoi as lastBookingDate, u.email
       FROM bookings b
       JOIN users u ON b.nguoiDungId = u.id
       WHERE u.isVIP = TRUE
       AND b.isAutoBooking = TRUE
       AND b.trangThai NOT IN ('Đã hủy')
       ORDER BY b.nguoiDungId, b.sanId, b.khungGioId, b.ngayChoi DESC`
    );

    for (const vip of vipBookings.rows) {
      const lastDate = new Date(vip.lastbookingdate);
      let nextDate = new Date(lastDate);
      nextDate.setDate(nextDate.getDate() + 7);

      while (nextDate <= today) {
        nextDate.setDate(nextDate.getDate() + 7);
      }

      const targetDate = nextDate.toISOString().slice(0, 10);

      const existing = await client.query(
        `SELECT id FROM bookings WHERE nguoiDungId = $1 AND sanId = $2 AND khungGioId = $3
         AND ngayChoi = $4 AND trangThai NOT IN ('Đã hủy')`,
        [vip.nguoidungid, vip.sanid, vip.khunggioid, targetDate]
      );

      if (existing.rows.length > 0) continue;

      const conflict = await client.query(
        `SELECT id FROM bookings WHERE sanId = $1 AND khungGioId = $2
         AND ngayChoi = $3 AND trangThai NOT IN ('Đã hủy')`,
        [vip.sanid, vip.khunggioid, targetDate]
      );

      if (conflict.rows.length > 0) {
        await client.query(
          "UPDATE bookings SET isAutoBooking = FALSE, updated_at = NOW() WHERE nguoiDungId = $1 AND sanId = $2 AND khungGioId = $3 AND isAutoBooking = TRUE",
          [vip.nguoidungid, vip.sanid, vip.khunggioid]
        );
        await client.query(
          "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao) VALUES ($1, $2, $3, 'vip_auto_conflict')",
          [vip.nguoidungid, 'Lịch VIP bị trùng', `Khung giờ tự động cho ngày ${targetDate} đã có người đặt trước. Tính năng tự động đặt đã bị tắt cho khung giờ này.`]
        );
        continue;
      }

      const slot = await client.query('SELECT mucGia FROM timeslots WHERE id = $1', [vip.khunggioid]);
      if (slot.rows.length === 0) continue;

      const slotPrice = parseFloat(slot.rows[0].mucgia);
      const booking = await client.query(
        `INSERT INTO bookings (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, trangThai, isAutoBooking)
         VALUES ($1, $2, $3, $4, $5, $6, 'Đã cọc', TRUE) RETURNING id`,
        [vip.nguoidungid, vip.sanid, vip.khunggioid, targetDate, slotPrice, Math.round(slotPrice * 0.1)]
      );

      await client.query(
        "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat) VALUES ($1, $2, $3, 'vip_auto_success', $4)",
        [vip.nguoidungid, 'Đặt lịch VIP tự động', `Đã tự động đặt lịch cho ngày ${targetDate}. Vui lòng thanh toán trước ngày chơi.`, booking.rows[0].id]
      );
    }
  } catch (err) {
    console.error('VIP auto-booking error:', err);
  } finally {
    client.release();
  }
}

function startScheduler(cron) {
  cron.schedule('* * * * *', handleBookingStatus);
  cron.schedule('5 0 * * *', autoCancelPastBookings);
  cron.schedule('1 0 * * 1', processVipAutoBooking);
  console.log('Schedulers started: check-in/out (every min), cancel past (daily 00:05), VIP auto-booking (Monday 00:01)');
}

module.exports = { startScheduler, handleBookingStatus, processVipAutoBooking, autoCancelPastBookings };
