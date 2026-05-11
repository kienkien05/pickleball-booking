const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:123456@localhost:5433/pickleball'
});

async function run() {
  const userId = 3;
  const sql = `
    SELECT d.code, u.used_count, d.usage_limit_per_user 
    FROM discounts d
    LEFT JOIN (
      SELECT maGiamGia, COUNT(*) as used_count 
      FROM bookings 
      WHERE nguoiDungId = $1 AND trangThai != 'Đã hủy'
      GROUP BY maGiamGia
    ) u ON d.code = u.maGiamGia
    WHERE (d.nguoiDungId IS NULL OR d.nguoiDungId = $1)
    AND d.trangThai = 'Active'
    AND (d.ngayBatDau IS NULL OR d.ngayBatDau <= NOW())
    AND (d.ngayKetThuc IS NULL OR d.ngayKetThuc >= NOW())
    AND (d.soLuongBanDau = 0 OR d.soLuongDaDung < d.soLuongBanDau)
    AND (u.used_count IS NULL OR CAST(u.used_count AS INTEGER) < COALESCE(d.usage_limit_per_user, 1))
  `;
  try {
    const res = await pool.query(sql, [userId]);
    console.log('API would return:', JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
  }
  process.exit(0);
}
run();
