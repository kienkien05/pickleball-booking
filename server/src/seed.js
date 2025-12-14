const { pool, query, queryOne, initDatabase } = require('./config/database');
const bcrypt = require('bcryptjs');

async function seed() {
    console.log('Initializing database...');
    await initDatabase();

    console.log('Seeding data...');

    // Check if already seeded
    const existingRoles = await query('SELECT * FROM roles');
    if (existingRoles.length > 0) {
        console.log('Database already seeded. Skipping...');
        process.exit(0);
    }

    // Insert roles
    await query("INSERT INTO roles (name) VALUES ('admin'), ('user')");

    // Insert booking statuses
    await query("INSERT INTO booking_statuses (name) VALUES ('pending'), ('confirmed'), ('cancelled'), ('completed')");

    // Insert payment methods
    await query(`
    INSERT INTO payment_methods (name, display_name) VALUES 
    ('cash', 'Tiền mặt'),
    ('bank_transfer', 'Chuyển khoản'),
    ('momo', 'Ví MoMo'),
    ('vnpay', 'VNPay')
  `);

    // Insert districts
    await query(`
    INSERT INTO districts (name) VALUES 
    ('Quận 1'), ('Quận 3'), ('Quận 7'), ('Thủ Đức'), ('Bình Thạnh')
  `);

    // Insert users
    const adminPasswordHash = bcrypt.hashSync('admin123', 10);
    const userPasswordHash = bcrypt.hashSync('user123', 10);

    await query(`
    INSERT INTO users (email, phone, password_hash, full_name, role_id) VALUES
    ('admin@pickleball.com', NULL, $1, 'Quản Trị Viên', 1)
  `, [adminPasswordHash]);

    await query(`
    INSERT INTO users (email, phone, password_hash, full_name, role_id) VALUES
    ('user1@gmail.com', '0901234567', $1, 'Nguyễn Văn A', 2),
    ('user2@gmail.com', '0912345678', $1, 'Trần Thị B', 2),
    ('user3@gmail.com', '0923456789', $1, 'Lê Văn C', 2)
  `, [userPasswordHash]);

    // Insert courts
    await query(`
    INSERT INTO courts (name, address, district_id, price_per_hour, description) VALUES
    ('Sân Pickleball Landmark', '123 Đường ABC, Phường Bến Nghé', 1, 200000, 'Sân tiêu chuẩn quốc tế, có máy lạnh'),
    ('Sân Pickleball Sunrise', '456 Đường DEF, Phường Tân Phong', 3, 180000, 'Sân ngoài trời, view đẹp'),
    ('Sân Pickleball Green Park', '789 Đường GHI, Phường Hiệp Bình', 4, 150000, 'Không gian xanh mát'),
    ('Sân Pickleball Star', '321 Đường JKL, Phường Võ Thị Sáu', 2, 220000, 'Sân cao cấp, có quán cafe'),
    ('Sân Pickleball Victory', '654 Đường MNO, Phường 25', 5, 170000, 'Sân rộng rãi, nhiều bãi đổ xe')
  `);

    // Insert time slots for each court
    const courts = await query('SELECT id FROM courts');
    const timeSlots = [
        ['06:00', '07:30'], ['07:30', '09:00'], ['09:00', '10:30'],
        ['14:00', '15:30'], ['15:30', '17:00'], ['17:00', '18:30'],
        ['18:30', '20:00'], ['20:00', '21:30']
    ];

    for (const court of courts) {
        for (const [start, end] of timeSlots) {
            await query(
                'INSERT INTO time_slots (court_id, start_time, end_time) VALUES ($1, $2, $3)',
                [court.id, start, end]
            );
        }
    }

    // Insert sample bookings
    const user1 = await queryOne("SELECT id FROM users WHERE email = 'user1@gmail.com'");
    const user2 = await queryOne("SELECT id FROM users WHERE email = 'user2@gmail.com'");
    const court1 = await queryOne("SELECT id, price_per_hour FROM courts WHERE name = 'Sân Pickleball Landmark'");
    const court2 = await queryOne("SELECT id, price_per_hour FROM courts WHERE name = 'Sân Pickleball Sunrise'");
    const slot = await queryOne("SELECT id FROM time_slots WHERE court_id = $1 LIMIT 1", [court1.id]);
    const slot2 = await queryOne("SELECT id FROM time_slots WHERE court_id = $1 LIMIT 1", [court2.id]);

    await query(`
    INSERT INTO bookings (user_id, court_id, slot_id, booking_date, status_id, payment_method_id, total_price) VALUES
    ($1, $2, $3, CURRENT_DATE + 1, 2, 3, $4),
    ($5, $6, $7, CURRENT_DATE + 2, 1, 1, $8)
  `, [user1.id, court1.id, slot.id, court1.price_per_hour * 1.5, user2.id, court2.id, slot2.id, court2.price_per_hour * 1.5]);

    // Insert a completed booking for user1 on court Green Park
    const court3 = await queryOne("SELECT id, price_per_hour FROM courts WHERE name = 'Sân Pickleball Green Park'");
    const slot3 = await queryOne("SELECT id FROM time_slots WHERE court_id = $1 LIMIT 1", [court3.id]);

    await query(`
    INSERT INTO bookings (user_id, court_id, slot_id, booking_date, status_id, payment_method_id, total_price) VALUES
    ($1, $2, $3, CURRENT_DATE - 1, 4, 2, $4)
  `, [user1.id, court3.id, slot3.id, court3.price_per_hour * 1.5]);

    // Add a review for the completed booking
    const completedBooking = await queryOne("SELECT id FROM bookings WHERE user_id = $1 AND status_id = 4 LIMIT 1", [user1.id]);

    await query(`
    INSERT INTO reviews (user_id, booking_id, court_id, rating, comment) VALUES
    ($1, $2, $3, 5, 'Không gian thoáng mát, sẽ quay lại!')
  `, [user1.id, completedBooking.id, court3.id]);

    console.log('Database seeded successfully!');
    console.log('\nTest accounts:');
    console.log('  Admin: admin@pickleball.com / admin123');
    console.log('  User:  user1@gmail.com / user123');
    console.log('  User:  user2@gmail.com / user123');
    console.log('  User:  user3@gmail.com / user123');

    process.exit(0);
}

seed().catch(err => {
    console.error('Seed error:', err);
    process.exit(1);
});
