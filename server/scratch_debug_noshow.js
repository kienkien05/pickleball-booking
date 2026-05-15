const { pool } = require('./src/config/database');

async function debugBooking() {
  const today = '2026-05-15';
  const currentTime = '15:17';

  console.log('--- Searching for the booking ---');
  const res = await pool.query(
    `SELECT b.id, b.trangThai, b.ngayChoi, t.gioBatDau
     FROM bookings b
     JOIN timeslots t ON b.khungGioId = t.id
     WHERE b.ngayChoi = $1 AND t.gioBatDau = '15:00:00'`,
    [today]
  );
  console.log('Bookings found:', res.rows);

  console.log('--- Testing the scheduler query logic ---');
  const noShowRes = await pool.query(
    `SELECT b.id, b.trangThai, b.ngayChoi, t.gioBatDau, ($2::time - INTERVAL '15 minutes') as threshold
     FROM bookings b
     JOIN timeslots t ON b.khungGioId = t.id
     WHERE b.trangThai = 'Đã thanh toán'
     AND b.ngayChoi = $1
     AND t.gioBatDau <= ($2::time - INTERVAL '15 minutes')`,
    [today, currentTime]
  );
  console.log('No-show query results:', noShowRes.rows);

  process.exit(0);
}

debugBooking();
