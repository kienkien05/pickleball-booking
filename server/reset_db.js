/**
 * Reset DB script — Xóa toàn bộ và seed lại từ đầu
 * Chạy: node reset_db.js
 */
const { pool } = require('./src/config/database');

async function resetDatabase() {
    const client = await pool.connect();
    try {
        console.log('Đang xóa sạch database...');

        // Xóa theo thứ tự FK
        const drops = [
            'booking_cancellations',
            'booking_equipment',
            'reviews',
            'bookings',
            'vip_auto_bookings',
            'equipment',
            'notifications',
            'sessions',
            'password_reset_tokens',
            'users',
            'slots',
            'courts',
            'districts',
            'payment_methods',
            'booking_statuses',
            'roles'
        ];

        for (const table of drops) {
            await client.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
            console.log(`  Đã xóa bảng: ${table}`);
        }

        console.log('\nReset xong. Bây giờ hãy chạy: node src/seed.js');
        process.exit(0);
    } catch (error) {
        console.error('Lỗi:', error.message);
        process.exit(1);
    } finally {
        client.release();
    }
}

resetDatabase();
