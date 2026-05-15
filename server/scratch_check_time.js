const { pool } = require('./src/config/database');

async function checkTime() {
  const now = new Date();
  console.log('Server JS Time:', now.toString());
  console.log('Server JS ISO:', now.toISOString());
  console.log('Server today string (scheduler logic):', now.toISOString().slice(0, 10));
  console.log('Server time string (scheduler logic):', now.toTimeString().slice(0, 5));

  const dbRes = await pool.query('SELECT NOW() as db_now, CURRENT_TIME as db_time, CURRENT_DATE as db_date');
  console.log('DB Time:', dbRes.rows[0]);
  
  const testInterval = await pool.query("SELECT ('15:16'::time - INTERVAL '15 minutes') as test_val");
  console.log('DB Interval Test (15:16 - 15min):', testInterval.rows[0].test_val);

  process.exit(0);
}

checkTime();
