const { Pool } = require('pg');
const pool = new Pool({
  connectionString: 'postgresql://postgres:postgres@localhost:5433/pickleball'
});

async function check() {
  const res = await pool.query("SELECT * FROM discounts WHERE code = 'SUMMER50'");
  console.log(JSON.stringify(res.rows[0], null, 2));
  process.exit(0);
}
check();
