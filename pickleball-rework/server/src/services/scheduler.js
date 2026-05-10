const { pool } = require('../config/database');

// Auto check-in for full-payment bookings at the start time
async function autoCheckIn() {
  const client = await pool.connect();
  try {
    // Check-in full-payment bookings that have reached start time
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const currentTime = now.toTimeString().slice(0, 5);

    const result = await client.query(
      `SELECT b.* FROM bookings b
       JOIN timeslots t ON b.khungGioId = t.id
       WHERE b.trangThai = 'Đã thanh toán Full'
       AND b.ngayChoi = $1
       AND t.gioBatDau <= $2::time`,
      [today, currentTime]
    );

    for (const booking of result.rows) {
      await client.query(
        "UPDATE bookings SET trangThai = 'Đang sử dụng', updated_at = NOW() WHERE id = $1",
        [booking.id]
      );
      await client.query(
        "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat) VALUES ($1, $2, $3, 'auto_checkin', $4)",
        [booking.nguoidungid, 'Tự động Check-in', `Hệ thống đã tự động check-in cho đơn #${booking.id}`, booking.id]
      );
    }

    // Auto check-out full-payment bookings past end time
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

    // Cancel no-shows (deposit bookings past 15 min of start time)
    const noShowResult = await client.query(
      `SELECT b.* FROM bookings b
       JOIN timeslots t ON b.khungGioId = t.id
       WHERE b.trangThai = 'Đã cọc'
       AND b.ngayChoi = $1
       AND t.gioBatDau <= ($2::time - INTERVAL '15 minutes')`,
      [today, currentTime]
    );

    for (const booking of noShowResult.rows) {
      await client.query(
        "UPDATE bookings SET trangThai = 'Đã hủy', ghiChu = 'No-show (tự động)', updated_at = NOW() WHERE id = $1",
        [booking.id]
      );
      await client.query(
        "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat) VALUES ($1, $2, $3, 'noshow', $4)",
        [booking.nguoidungid, 'Hủy vắng mặt', `Đơn #${booking.id} đã bị hủy do không đến đúng giờ. Khoản cọc không được hoàn lại.`, booking.id]
      );
    }
  } catch (err) {
    console.error('Auto check-in/out error:', err);
  } finally {
    client.release();
  }
}

// VIP auto-booking: create bookings for next week's same weekday
async function processVipAutoBooking() {
  const client = await pool.connect();
  try {
    // Check if today is Monday (day 1) to process weekly auto-bookings
    const today = new Date();
    if (today.getDay() !== 1) return; // Only run on Mondays

    // Get all VIP users who want auto-booking
    // This uses a simple approach - VIP users who checked "auto-booking" on their last booking
    const vipBookings = await client.query(
      `SELECT DISTINCT ON (b.nguoiDungId, b.sanId, b.khungGioId)
        b.nguoiDungId, b.sanId, b.khungGioId, u.email
       FROM bookings b
       JOIN users u ON b.nguoiDungId = u.id
       WHERE u.isVIP = TRUE
       AND b.isAutoBooking = TRUE
       AND b.trangThai NOT IN ('Đã hủy')
       AND b.ngayChoi >= CURRENT_DATE - INTERVAL '14 days'
       ORDER BY b.nguoiDungId, b.sanId, b.khungGioId, b.created_at DESC`
    );

    for (const vip of vipBookings.rows) {
      const nextWeek = new Date(today);
      nextWeek.setDate(nextWeek.getDate() + 7);
      const targetDate = nextWeek.toISOString().slice(0, 10);

      // Check if already booked for next week
      const existing = await client.query(
        `SELECT id FROM bookings WHERE nguoiDungId = $1 AND sanId = $2 AND khungGioId = $3
         AND ngayChoi = $4 AND trangThai NOT IN ('Đã hủy')`,
        [vip.nguoidungid, vip.sanid, vip.khunggioid, targetDate]
      );

      if (existing.rows.length > 0) continue; // Already booked

      // Check if slot is available
      const conflict = await client.query(
        `SELECT id FROM bookings WHERE sanId = $1 AND khungGioId = $2
         AND ngayChoi = $3 AND trangThai NOT IN ('Đã hủy')`,
        [vip.sanid, vip.khunggioid, targetDate]
      );

      if (conflict.rows.length > 0) {
        await client.query(
          "INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao) VALUES ($1, $2, $3, 'vip_auto_conflict')",
          [vip.nguoidungid, 'Lịch VIP bị trùng', `Khung giờ tự động tuần tới (${targetDate}) đã có người đặt. Vui lòng chọn khung giờ khác.`]
        );
        continue;
      }

      // Create the booking
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
  // Run every minute for auto check-in/out
  cron.schedule('* * * * *', autoCheckIn);

  // Run VIP auto-booking every Monday at 00:01
  cron.schedule('1 0 * * 1', processVipAutoBooking);

  console.log('Schedulers started: auto check-in/out (every min), VIP auto-booking (Monday 00:01)');
}

module.exports = { startScheduler, autoCheckIn, processVipAutoBooking };
