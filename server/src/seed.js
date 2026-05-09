/**
 * Seed script — Nạp dữ liệu mẫu vào database pickleball
 * Chạy: node src/seed.js
 */
const { pool, initDatabase } = require('./config/database');
const bcrypt = require('bcryptjs');

async function seed() {
    console.log('Đang khởi tạo database...');
    await initDatabase();
    console.log('Đang nạp dữ liệu mẫu...');

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // ── Xóa sạch dữ liệu cũ + reset lại ID tự tăng ───────────────────
        // RESTART IDENTITY giúp id quay lại từ 1
        // CASCADE giúp tự xử lý các bảng có khóa ngoại liên quan
        await client.query(`
            TRUNCATE TABLE
                booking_cancellations,
                booking_equipment,
                reviews,
                bookings,
                vip_auto_bookings,
                equipment,
                notifications,
                sessions,
                password_reset_tokens,
                users,
                slots,
                courts,
                districts,
                payment_methods,
                booking_statuses,
                roles
            RESTART IDENTITY CASCADE
        `);

        // ── Roles ────────────────────────────────────────────────────────
        await client.query(`
            INSERT INTO roles (id, name) VALUES
            (1, 'admin'),
            (2, 'user')
            ON CONFLICT (id) DO NOTHING
        `);

        // ── Booking statuses ─────────────────────────────────────────────
        await client.query(`
            INSERT INTO booking_statuses (id, status_name) VALUES
            (1, 'Pending'),
            (2, 'Confirmed'),
            (3, 'Cancelled'),
            (4, 'Completed'),
            (5, 'In_Progress')
            ON CONFLICT (id) DO NOTHING
        `);

        // ── Payment methods ───────────────────────────────────────────────
        // Có id cố định vì bookings phía dưới dùng payment_method_id = 1,2,3
        await client.query(`
            INSERT INTO payment_methods (id, method_name, display_name) VALUES
            (1, 'cash',          'Tiền mặt tại sân'),
            (2, 'bank_transfer', 'Chuyển khoản ngân hàng'),
            (3, 'momo',          'Ví MoMo'),
            (4, 'vnpay',         'VNPay')
            ON CONFLICT (id) DO NOTHING
        `);

        // ── Districts ─────────────────────────────────────────────────────
        // Có id cố định vì courts phía dưới dùng district_id = 1..5
        await client.query(`
            INSERT INTO districts (id, name) VALUES
            (1, 'Quận 1'),
            (2, 'Quận 3'),
            (3, 'Quận 7'),
            (4, 'Thủ Đức'),
            (5, 'Bình Thạnh')
            ON CONFLICT (id) DO NOTHING
        `);

        // ── Users ─────────────────────────────────────────────────────────
        const adminHash = bcrypt.hashSync('admin123', 10);
        const userHash = bcrypt.hashSync('user123', 10);

        await client.query(`
            INSERT INTO users 
                (email, phone, password_hash, full_name, role_id, is_vip, cancel_count) 
            VALUES
                ('admin@pickleball.com', NULL,          $1, 'Quản Trị Viên', 1, false, 0),
                ('user1@gmail.com',      '0901234567',  $2, 'Nguyễn Văn An', 2, false, 0),
                ('vip@gmail.com',        '0912345678',  $2, 'Trần Thị Bình', 2, true,  0),
                ('problem@gmail.com',    '0923456789',  $2, 'Lê Văn Cường',  2, false, 3)
        `, [adminHash, userHash]);

        // ── Courts ────────────────────────────────────────────────────────
        await client.query(`
            INSERT INTO courts 
                (name, address, district_id, price_per_hour, description, image_url) 
            VALUES
                (
                    'Sân Pickleball Landmark',
                    '123 Đường ABC, Phường Bến Nghé',
                    1,
                    200000,
                    'Sân tiêu chuẩn quốc tế, có máy lạnh',
                    '/uploads/court-1.jpg'
                ),
                (
                    'Sân Pickleball Sunrise',
                    '456 Đường DEF, Phường Tân Phong',
                    3,
                    180000,
                    'Sân ngoài trời, view đẹp',
                    '/uploads/court-2.jpg'
                ),
                (
                    'Sân Pickleball Green Park',
                    '789 Đường GHI, Phường Hiệp Bình',
                    4,
                    150000,
                    'Không gian xanh mát, yên tĩnh',
                    '/uploads/court-3.jpg'
                ),
                (
                    'Sân Pickleball Star',
                    '321 Đường JKL, Phường Võ Thị Sáu',
                    2,
                    220000,
                    'Sân cao cấp, có quán cafe',
                    '/uploads/court-4.jpg'
                ),
                (
                    'Sân Pickleball Victory',
                    '654 Đường MNO, Phường 25',
                    5,
                    170000,
                    'Sân rộng rãi, nhiều bãi đổ xe',
                    '/uploads/court-5.jpg'
                )
        `);

        // ── Slots ─────────────────────────────────────────────────────────
        // duration_hours = 1.5h
        // price_modifier: 1.0 bình thường, 1.2 giờ cao điểm
        await client.query(`
            INSERT INTO slots 
                (name, start_time, end_time, duration_hours, price_modifier) 
            VALUES
                ('Ca Sáng 1',  '05:30', '07:00', 1.5, 1.0),
                ('Ca Sáng 2',  '07:00', '08:30', 1.5, 1.2),
                ('Ca Sáng 3',  '08:30', '10:00', 1.5, 1.2),
                ('Ca Trưa',    '10:00', '11:30', 1.5, 1.0),
                ('Ca Chiều 1', '11:50', '15:30', 1.5, 1.0),
                ('Ca Chiều 2', '15:30', '17:00', 1.5, 1.2),
                ('Ca Tối 1',   '17:00', '18:30', 1.5, 1.2),
                ('Ca Tối 2',   '18:30', '20:00', 1.5, 1.2),
                ('Ca Tối 3',   '20:00', '21:30', 1.5, 1.0)
        `);

        // ── Equipment ─────────────────────────────────────────────────────
        await client.query(`
            INSERT INTO equipment 
                (name, description, price_per_booking, available_quantity, category) 
            VALUES
                ('Vợt Pickleball',     'Vợt tiêu chuẩn dành cho người mới', 50000,  20,  'Dụng cụ'),
                ('Bóng Pickleball',    'Hộp 3 bóng',                        20000,  50,  'Dụng cụ'),
                ('Giày thể thao',      'Size 36–45, vệ sinh sạch sẽ',       30000,  15,  'Dụng cụ'),
                ('Bình nước thể thao', '500ml, tặng nước lọc miễn phí',     15000,  100, 'Đồ uống'),
                ('Khăn tắm',           'Khăn cotton mềm',                   10000,  50,  'Dụng cụ')
        `);

        // ── Lấy id mẫu ────────────────────────────────────────────────────
        const user1 = await client.query(`
            SELECT id FROM users WHERE email = 'user1@gmail.com'
        `);

        const vipUser = await client.query(`
            SELECT id FROM users WHERE email = 'vip@gmail.com'
        `);

        const probUser = await client.query(`
            SELECT id FROM users WHERE email = 'problem@gmail.com'
        `);

        const court1Res = await client.query(`
            SELECT id FROM courts ORDER BY id LIMIT 1
        `);

        const court2Res = await client.query(`
            SELECT id FROM courts ORDER BY id OFFSET 1 LIMIT 1
        `);

        const court3Res = await client.query(`
            SELECT id FROM courts ORDER BY id OFFSET 2 LIMIT 1
        `);

        const slots = await client.query(`
            SELECT id FROM slots ORDER BY id
        `);

        const uid1 = user1.rows[0].id;
        const uidVip = vipUser.rows[0].id;
        const uidProb = probUser.rows[0].id;

        const cid1 = court1Res.rows[0].id;
        const cid2 = court2Res.rows[0].id;
        const cid3 = court3Res.rows[0].id;

        const slotIds = slots.rows.map(row => row.id);

        // ── Sample bookings ───────────────────────────────────────────────

        // Booking pending: user1, sân 1, ngày mai
        await client.query(`
            INSERT INTO bookings
                (
                    user_id,
                    court_id,
                    slot_id,
                    booking_date,
                    status_id,
                    payment_method_id,
                    payment_type,
                    total_price,
                    deposit_amount,
                    amount_paid
                )
            VALUES 
                ($1, $2, $3, CURRENT_DATE + 1, 1, 1, 'deposit', 300000, 30000, 30000)
        `, [uid1, cid1, slotIds[1]]);

        // Booking confirmed: VIP user, sân 2, ngày kia
        await client.query(`
            INSERT INTO bookings
                (
                    user_id,
                    court_id,
                    slot_id,
                    booking_date,
                    status_id,
                    payment_method_id,
                    payment_type,
                    total_price,
                    deposit_amount,
                    amount_paid
                )
            VALUES 
                ($1, $2, $3, CURRENT_DATE + 2, 2, 3, 'full', 324000, 32400, 324000)
        `, [uidVip, cid2, slotIds[2]]);

        // Booking completed: user1, sân 3, hôm qua
        await client.query(`
            INSERT INTO bookings
                (
                    user_id,
                    court_id,
                    slot_id,
                    booking_date,
                    status_id,
                    payment_method_id,
                    payment_type,
                    total_price,
                    deposit_amount,
                    amount_paid
                )
            VALUES 
                ($1, $2, $3, CURRENT_DATE - 1, 4, 2, 'full', 225000, 22500, 225000)
        `, [uid1, cid3, slotIds[4]]);

        // Booking pending: problem user — phải trả toàn phần
        await client.query(`
            INSERT INTO bookings
                (
                    user_id,
                    court_id,
                    slot_id,
                    booking_date,
                    status_id,
                    payment_method_id,
                    payment_type,
                    total_price,
                    deposit_amount,
                    amount_paid
                )
            VALUES 
                ($1, $2, $3, CURRENT_DATE + 3, 1, 1, 'full', 300000, 30000, 300000)
        `, [uidProb, cid1, slotIds[3]]);

        // ── Review cho completed booking ──────────────────────────────────
        const completedBooking = await client.query(`
            SELECT id 
            FROM bookings 
            WHERE user_id = $1 AND status_id = 4 
            LIMIT 1
        `, [uid1]);

        if (completedBooking.rows.length > 0) {
            await client.query(`
                INSERT INTO reviews 
                    (user_id, booking_id, court_id, rating, comment)
                VALUES 
                    ($1, $2, $3, 5, 'Không gian thoáng mát, nhân viên nhiệt tình. Sẽ quay lại!')
            `, [uid1, completedBooking.rows[0].id, cid3]);
        }

        await client.query('COMMIT');

        console.log('\nSeed hoàn tất!');
        console.log('─────────────────────────────────────────');
        console.log('Tài khoản test:');
        console.log('  Admin   : admin@pickleball.com  / admin123');
        console.log('  User    : user1@gmail.com       / user123');
        console.log('  VIP     : vip@gmail.com         / user123');
        console.log('  Warning : problem@gmail.com     / user123  (đã hủy 3 lần)');
        console.log('─────────────────────────────────────────');

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Seed lỗi:', err.message);
        throw err;
    } finally {
        client.release();
        await pool.end();
    }
}

seed().catch(err => {
    console.error(err);
    process.exit(1);
});