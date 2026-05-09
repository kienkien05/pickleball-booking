require('dotenv').config();
const { Pool } = require('pg');

// PostgreSQL connection pool
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'pickleball',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '123456'
});

// Helper function to run queries (returns rows array)
const query = async (text, params) => {
  const result = await pool.query(text, params);
  return result.rows;
};

// Get single row
const queryOne = async (text, params) => {
  const result = await pool.query(text, params);
  return result.rows[0];
};

// Initialize database tables
const initDatabase = async () => {
  const client = await pool.connect();

  try {
    await client.query(`
      -- ===== LOOKUP TABLES =====

      CREATE TABLE IF NOT EXISTS roles (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS booking_statuses (
        id SERIAL PRIMARY KEY,
        status_name VARCHAR(50) UNIQUE NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payment_methods (
        id SERIAL PRIMARY KEY,
        method_name VARCHAR(50) UNIQUE NOT NULL,
        display_name VARCHAR(100) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS districts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) UNIQUE NOT NULL
      );

      -- ===== USERS =====

      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        phone VARCHAR(20) UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        role_id INTEGER REFERENCES roles(id) DEFAULT 2,
        is_locked BOOLEAN DEFAULT FALSE,
        is_vip BOOLEAN DEFAULT FALSE,
        cancel_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        booking_id INTEGER,
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        notification_type VARCHAR(50) DEFAULT 'booking',
        is_read BOOLEAN DEFAULT FALSE,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- ===== COURTS & SLOTS =====

      CREATE TABLE IF NOT EXISTS courts (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        address TEXT NOT NULL,
        district_id INTEGER REFERENCES districts(id),
        price_per_hour DECIMAL(10,2) NOT NULL,
        description TEXT,
        image_url TEXT,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Global time slots shared across all courts
      -- price_modifier: 1.0 = normal, 1.2 = peak, 0.8 = off-peak
      CREATE TABLE IF NOT EXISTS slots (
        id SERIAL PRIMARY KEY,
        name VARCHAR(50) NOT NULL,
        start_time VARCHAR(10) NOT NULL,
        end_time VARCHAR(10) NOT NULL,
        duration_hours DECIMAL(4,2) DEFAULT 1.5,
        price_modifier DECIMAL(4,2) DEFAULT 1.0
      );

      -- ===== EQUIPMENT RENTAL =====

      CREATE TABLE IF NOT EXISTS equipment (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        price_per_booking DECIMAL(10,2) NOT NULL,
        available_quantity INTEGER DEFAULT 10,
        is_active BOOLEAN DEFAULT TRUE
      );

      -- ===== BOOKINGS =====

      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        court_id INTEGER REFERENCES courts(id) ON DELETE SET NULL,
        slot_id INTEGER REFERENCES slots(id) ON DELETE SET NULL,
        booking_date DATE NOT NULL,
        status_id INTEGER REFERENCES booking_statuses(id) DEFAULT 1,
        payment_method_id INTEGER REFERENCES payment_methods(id),
        payment_type VARCHAR(20) DEFAULT 'full',    -- 'deposit' | 'full'
        total_price DECIMAL(10,2) NOT NULL,
        deposit_amount DECIMAL(10,2),               -- 10% nếu chọn đặt cọc
        amount_paid DECIMAL(10,2) DEFAULT 0,        -- Đã thanh toán thực tế
        notes TEXT,
        is_auto_booking BOOLEAN DEFAULT FALSE,
        auto_booking_id INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- VIP weekly auto booking requests. Actual bookings are created at
      -- Monday 00:00 for the configured target date in that week.
      CREATE TABLE IF NOT EXISTS vip_auto_bookings (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        court_id INTEGER REFERENCES courts(id) ON DELETE CASCADE,
        slot_id INTEGER REFERENCES slots(id) ON DELETE CASCADE,
        target_weekday INTEGER NOT NULL CHECK (target_weekday BETWEEN 0 AND 6),
        target_booking_date DATE NOT NULL,
        next_run_at TIMESTAMP NOT NULL,
        status VARCHAR(20) DEFAULT 'active',
        payment_method_id INTEGER REFERENCES payment_methods(id),
        last_booking_id INTEGER,
        cancellation_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Equipment items attached to a booking
      CREATE TABLE IF NOT EXISTS booking_equipment (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
        equipment_id INTEGER REFERENCES equipment(id),
        quantity INTEGER NOT NULL DEFAULT 1,
        subtotal DECIMAL(10,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Cancellation log
      CREATE TABLE IF NOT EXISTS booking_cancellations (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
        reason TEXT,
        cancelled_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        cancelled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Reviews
      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE UNIQUE,
        court_id INTEGER REFERENCES courts(id) ON DELETE CASCADE,
        rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
        comment TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // -- PAYMENTS TABLE (ThanhToan theo doc KLTN) --
    await client.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        booking_id INTEGER REFERENCES bookings(id) ON DELETE CASCADE,
        amount DECIMAL(10,2) NOT NULL,
        payment_type VARCHAR(20) NOT NULL,
        payment_method_id INTEGER REFERENCES payment_methods(id),
        status VARCHAR(20) DEFAULT 'completed',
        transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Add missing columns to existing tables (safe migrations)
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_vip BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS cancel_count INTEGER DEFAULT 0;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS payment_type VARCHAR(20) DEFAULT 'full';
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS deposit_amount DECIMAL(10,2);
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(10,2) DEFAULT 0;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes TEXT;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_auto_booking BOOLEAN DEFAULT FALSE;
      ALTER TABLE bookings ADD COLUMN IF NOT EXISTS auto_booking_id INTEGER;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS booking_id INTEGER;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS notification_type VARCHAR(50) DEFAULT 'booking';
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS is_read BOOLEAN DEFAULT FALSE;
      ALTER TABLE notifications ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;
      ALTER TABLE equipment ADD COLUMN IF NOT EXISTS category VARCHAR(50);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_vip_auto_due
        ON vip_auto_bookings (status, next_run_at);

      CREATE INDEX IF NOT EXISTS idx_vip_auto_target
        ON vip_auto_bookings (status, court_id, slot_id, target_booking_date);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_vip_auto_user_weekly_unique
        ON vip_auto_bookings (user_id, court_id, slot_id, target_weekday)
        WHERE status = 'active';

      CREATE UNIQUE INDEX IF NOT EXISTS idx_booking_no_double
        ON bookings (court_id, slot_id, booking_date)
        WHERE status_id <> 3;
    `);

    console.log('[database] Tables ready');
  } catch (err) {
    console.error('initDatabase error:', err.message);
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { pool, query, queryOne, initDatabase };
