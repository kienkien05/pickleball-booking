const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:123456@localhost:5433/pickleball'
});

async function check() {
  // Check bookings for the user with initials 'T' (likely the user in screenshot)
  const userRes = await pool.query("SELECT id, email, hoTen FROM users WHERE hoTen LIKE 'T%' OR email LIKE 't%' LIMIT 5");
  console.log("Users found:", userRes.rows);
  
  for (const user of userRes.rows) {
    const bookings = await pool.query("SELECT id, trangThai FROM bookings WHERE nguoiDungId = $1", [user.id]);
    console.log(`User ${user.hoTen} has ${bookings.rows.length} bookings.`);
    
    const discounts = await pool.query("SELECT * FROM discounts WHERE nguoiDungId = $1", [user.id]);
    console.log(`User ${user.hoTen} has ${discounts.rows.length} discounts.`);
    if (discounts.rows.length > 0) {
      console.log("Discounts detail:", JSON.stringify(discounts.rows, null, 2));
    }
  }
  process.exit(0);
}
check();
