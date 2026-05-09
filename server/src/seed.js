/**
 * Seed script — Nạp dữ liệu mẫu vào database pickleball
 * Chạy: node src/seed.js
 */
const { pool, initDatabase } = require('./config/database');
const bcrypt = require('bcryptjs');

async function seed() {
    console.log('Đang khởi tạo database...');
    await initDatabase();
    console.log('Đang nạp dữ liệu mẫu siêu to khổng lồ...');

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // ── 1. Xóa sạch dữ liệu cũ + reset lại ID tự tăng ───────────────────
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

        // ── 2. Dữ liệu Danh mục cơ bản ──────────────────────────────────────
        await client.query(`
            INSERT INTO roles (id, name) VALUES
            (1, 'admin'), (2, 'user') ON CONFLICT (id) DO NOTHING;

            INSERT INTO booking_statuses (id, status_name) VALUES
            (1, 'Pending'), (2, 'Confirmed'), (3, 'Cancelled'), (4, 'Completed'), (5, 'In_Progress')
            ON CONFLICT (id) DO NOTHING;

            INSERT INTO payment_methods (id, method_name, display_name) VALUES
            (1, 'cash', 'Tiền mặt tại sân'), (2, 'bank_transfer', 'Chuyển khoản ngân hàng'),
            (3, 'momo', 'Ví MoMo'), (4, 'vnpay', 'VNPay') ON CONFLICT (id) DO NOTHING;

            INSERT INTO districts (id, name) VALUES
            (1, 'Quận 1'), (2, 'Quận 3'), (3, 'Quận 7'), (4, 'Thủ Đức'), (5, 'Bình Thạnh')
            ON CONFLICT (id) DO NOTHING;
        `);

        // ── 3. Users ─────────────────────────────────────────────────────────
        const adminHash = bcrypt.hashSync('admin123', 10);
        const userHash = bcrypt.hashSync('user123', 10);

        await client.query(`
            INSERT INTO users (email, phone, password_hash, full_name, role_id, is_vip, cancel_count) 
            VALUES
                ('admin@pickleball.com', NULL,         $1, 'Quản Trị Viên', 1, false, 0),
                ('user1@gmail.com',      '0901234567', $2, 'Nguyễn Văn An', 2, false, 0),
                ('vip@gmail.com',        '0912345678', $2, 'Trần Thị Bình', 2, true,  0),
                ('problem@gmail.com',    '0923456789', $2, 'Lê Văn Cường',  2, false, 3)
        `, [adminHash, userHash]);

        // ── 4. Courts ────────────────────────────────────────────────────────
        await client.query(`
            INSERT INTO courts (name, address, district_id, price_per_hour, description, image_url) 
            VALUES
                ('Sân Pickleball Landmark', '123 Đường ABC, Phường Bến Nghé', 1, 200000, 'Sân tiêu chuẩn quốc tế, có máy lạnh', '/uploads/court-1.jpg'),
                ('Sân Pickleball Sunrise', '456 Đường DEF, Phường Tân Phong', 3, 180000, 'Sân ngoài trời, view đẹp', '/uploads/court-2.jpg'),
                ('Sân Pickleball Green Park', '789 Đường GHI, Phường Hiệp Bình', 4, 150000, 'Không gian xanh mát, yên tĩnh', '/uploads/court-3.jpg'),
                ('Sân Pickleball Star', '321 Đường JKL, Phường Võ Thị Sáu', 2, 220000, 'Sân cao cấp, có quán cafe', '/uploads/court-4.jpg'),
                ('Sân Pickleball Victory', '654 Đường MNO, Phường 25', 5, 170000, 'Sân rộng rãi, nhiều bãi đổ xe', '/uploads/court-5.jpg')
        `);

        // ── 5. Slots ─────────────────────────────────────────────────────────
        await client.query(`
            INSERT INTO slots (name, start_time, end_time, duration_hours, price_modifier) 
            VALUES
                ('Ca Sáng 1',  '05:30', '07:00', 1.5, 1.0), ('Ca Sáng 2',  '07:00', '08:30', 1.5, 1.2),
                ('Ca Sáng 3',  '08:30', '10:00', 1.5, 1.2), ('Ca Trưa',    '10:00', '11:30', 1.5, 1.0),
                ('Ca Chiều 1', '11:50', '15:30', 1.5, 1.0), ('Ca Chiều 2', '15:30', '17:00', 1.5, 1.2),
                ('Ca Tối 1',   '17:00', '18:30', 1.5, 1.2), ('Ca Tối 2',   '18:30', '20:00', 1.5, 1.2),
                ('Ca Tối 3',   '20:00', '21:30', 1.5, 1.0)
        `);

        // ── Lấy ID động để gán dữ liệu ──────────────────────────────────────
        const userRes = await client.query(`SELECT id, email FROM users`);
        const uid1 = userRes.rows.find(u => u.email === 'user1@gmail.com').id;
        const uidVip = userRes.rows.find(u => u.email === 'vip@gmail.com').id;
        const uidProb = userRes.rows.find(u => u.email === 'problem@gmail.com').id;

        const courtRes = await client.query(`SELECT id, name FROM courts ORDER BY id`);
        const courts = courtRes.rows; // Mảng chứa 5 sân

        const slotRes = await client.query(`SELECT id FROM slots ORDER BY id`);
        const slotIds = slotRes.rows.map(r => r.id);

        // ── 6. LÀM GIÀU DỮ LIỆU EQUIPMENT CHO TỪNG SÂN ─────────────────────
        // Tạo một mảng chứa dữ liệu thiết bị cho tất cả các sân để dễ quản lý
        const equipmentData = [
            // Sân 1: Landmark (10 items)
            [courts[0].id, 'Vợt Pickleball (Landmark)', 'Vợt tiêu chuẩn dành cho người mới', 50000, 15, 'Dụng cụ'],
            [courts[0].id, 'Bóng Pickleball (Landmark)', 'Hộp 3 bóng thi đấu', 20000, 50, 'Dụng cụ'],
            [courts[0].id, 'Giày thể thao', 'Size 36-45, vệ sinh sạch sẽ', 30000, 14, 'Trang phục'],
            [courts[0].id, 'Bình nước thể thao', '500ml, tặng nước lọc miễn phí', 15000, 100, 'Đồ uống'],
            [courts[0].id, 'Khăn tắm', 'Khăn cotton mềm 100%', 10000, 50, 'Khác'],
            [courts[0].id, 'Băng đeo trán', 'Thấm hút mồ hôi tốt', 12000, 30, 'Trang phục'],
            [courts[0].id, 'Băng bảo vệ đầu gối', 'Hỗ trợ giảm chấn thương', 25000, 20, 'Trang phục'],
            [courts[0].id, 'Nước tăng lực', 'Chai 500ml', 18000, 80, 'Đồ uống'],
            [courts[0].id, 'Bánh năng lượng', 'Bổ sung năng lượng nhanh', 25000, 40, 'Đồ ăn'],
            [courts[0].id, 'Trái cây tươi', 'Đĩa trái cây theo mùa', 45000, 10, 'Đồ ăn'],

            // Sân 2: Sunrise (8 items)
            [courts[1].id, 'Vợt Carbon (Sunrise)', 'Vợt trợ lực tốt cho ngoài trời', 60000, 10, 'Dụng cụ'],
            [courts[1].id, 'Bóng Outdoor (Sunrise)', 'Hộp 3 bóng chuyên dụng ngoài trời', 25000, 40, 'Dụng cụ'],
            [courts[1].id, 'Nước suối Aquafina', 'Chai 500ml ướp lạnh', 10000, 100, 'Đồ uống'],
            [courts[1].id, 'Nước khoáng Revive', 'Chai 500ml bù khoáng', 15000, 50, 'Đồ uống'],
            [courts[1].id, 'Áo thun thể thao', 'Thoáng mát, mau khô', 40000, 15, 'Trang phục'],
            [courts[1].id, 'Quần đùi thể thao', 'Co giãn tốt', 45000, 10, 'Trang phục'],
            [courts[1].id, 'Kính mát thể thao', 'Chống tia UV', 50000, 5, 'Dụng cụ'],
            [courts[1].id, 'Kem chống nắng', 'Tuýp 50ml', 80000, 8, 'Khác'],

            // Sân 3: Green Park (7 items)
            [courts[2].id, 'Vợt Pickleball Cơ bản', 'Vợt tập luyện', 40000, 20, 'Dụng cụ'],
            [courts[2].id, 'Bóng Pickleball Lẻ', 'Bán lẻ 1 quả', 10000, 100, 'Dụng cụ'],
            [courts[2].id, 'Nước ép trái cây', 'Đóng chai theo ngày', 35000, 30, 'Đồ uống'],
            [courts[2].id, 'Sinh tố', 'Đa dạng hương vị', 40000, 25, 'Đồ uống'],
            [courts[2].id, 'Salad', 'Thanh mát, tốt cho sức khỏe', 55000, 15, 'Đồ ăn'],
            [courts[2].id, 'Khăn lạnh', 'Khăn ướp lạnh sảng khoái', 8000, 60, 'Khác'],
            [courts[2].id, 'Thuê vợt Carbon', 'Vợt nhẹ, dễ chơi', 70000, 12, 'Dụng cụ'],

            // Sân 4: Star (9 items)
            [courts[3].id, 'Vợt Pro Max (Star)', 'Vợt cao cấp nhất', 90000, 5, 'Dụng cụ'],
            [courts[3].id, 'Bóng Thi Đấu (Star)', 'Hộp 3 bóng chuẩn thi đấu', 35000, 20, 'Dụng cụ'],
            [courts[3].id, 'Cafe Sữa Đá', 'Pha máy chuẩn vị', 25000, 50, 'Đồ uống'],
            [courts[3].id, 'Thuê tủ đồ VIP', 'Tủ khóa từ an toàn', 20000, 20, 'Khác'],
            [courts[3].id, 'Set trà bánh', 'Dành cho hội nhóm', 150000, 5, 'Đồ ăn'],
            [courts[3].id, 'Nước ép mix', 'Công thức đặc biệt', 45000, 30, 'Đồ uống'],
            [courts[3].id, 'Túi đựng vợt', 'Chống sốc, thời trang', 30000, 15, 'Khác'],
            [courts[3].id, 'Giày thể thao Pro', 'Giày chuyên dụng', 60000, 8, 'Trang phục'],
            [courts[3].id, 'Dịch vụ quay phim', 'Quay lại trận đấu', 200000, 2, 'Dịch vụ'],

            // Sân 5: Victory (6 items)
            [courts[4].id, 'Vợt Luyện Tập (Victory)', 'Dành cho hội nhóm', 30000, 30, 'Dụng cụ'],
            [courts[4].id, 'Bóng Luyện Tập (Victory)', 'Combo 5 quả', 40000, 20, 'Dụng cụ'],
            [courts[4].id, 'Nước suối Dasani', 'Chai 500ml', 10000, 80, 'Đồ uống'],
            [courts[4].id, 'Mì xào', 'Tiếp sức nhanh', 35000, 40, 'Đồ ăn'],
            [courts[4].id, 'Xúc xích', 'Nạp năng lượng', 15000, 60, 'Đồ ăn'],
            [courts[4].id, 'Nước ngọt có ga', 'Đa dạng loại', 15000, 70, 'Đồ uống']
        ];

        // Vòng lặp Insert dữ liệu Equipment vào DB
        for (const item of equipmentData) {
            await client.query(`
                INSERT INTO equipment (court_id, name, description, price_per_booking, available_quantity, category) 
                VALUES ($1, $2, $3, $4, $5, $6)
            `, item);
        }

        // ── 7. Sample Bookings ───────────────────────────────────────────────
        await client.query(`
            INSERT INTO bookings (user_id, court_id, slot_id, booking_date, status_id, payment_method_id, payment_type, total_price, deposit_amount, amount_paid)
            VALUES 
                ($1, $2, $3, CURRENT_DATE + 1, 1, 1, 'deposit', 300000, 30000, 30000), -- user1, sân 1
                ($4, $5, $6, CURRENT_DATE + 2, 2, 3, 'full', 324000, 32400, 324000), -- VIP, sân 2
                ($1, $7, $8, CURRENT_DATE - 1, 4, 2, 'full', 225000, 22500, 225000), -- user1, sân 3 (Hoàn thành)
                ($9, $2, $10, CURRENT_DATE + 3, 1, 1, 'full', 300000, 30000, 300000) -- Prob, sân 1
        `, [uid1, courts[0].id, slotIds[1], uidVip, courts[1].id, slotIds[2], courts[2].id, slotIds[4], uidProb, slotIds[3]]);

        // ── 8. Review cho completed booking ──────────────────────────────────
        const completedBooking = await client.query(`SELECT id FROM bookings WHERE status_id = 4 LIMIT 1`);
        if (completedBooking.rows.length > 0) {
            await client.query(`
                INSERT INTO reviews (user_id, booking_id, court_id, rating, comment)
                VALUES ($1, $2, $3, 5, 'Không gian thoáng mát, nhân viên nhiệt tình. Sẽ quay lại!')
            `, [uid1, completedBooking.rows[0].id, courts[2].id]);
        }

        await client.query('COMMIT');

        console.log('\n✅ Seed hoàn tất! Kho thiết bị đã được phân bổ cho 5 sân.');
        console.log('─────────────────────────────────────────');
        console.log('Tài khoản test:');
        console.log('  Admin   : admin@pickleball.com  / admin123');
        console.log('  User    : user1@gmail.com       / user123');
        console.log('  VIP     : vip@gmail.com         / user123');
        console.log('  Warning : problem@gmail.com     / user123');
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