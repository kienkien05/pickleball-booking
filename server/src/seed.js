/**
 * Seed script - Nạp dữ liệu mẫu vào database pickleball_rework
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

    // ── Xóa dữ liệu cũ ─────────────────────────────────────────────────
    await client.query(`
      TRUNCATE TABLE
        booking_services, payments, reviews, notifications,
        bookings, court_images, discounts,
        timeslots, services, users, courts
      RESTART IDENTITY CASCADE
    `);

    // ── Users ──────────────────────────────────────────────────────────
    const adminHash = bcrypt.hashSync('admin123', 10);
    const userHash = bcrypt.hashSync('user123', 10);

    await client.query(`
      INSERT INTO users (hoTen, email, soDienThoai, matKhau, vaiTro, isVIP, trangThai, diaChi, gioiTinh)
      VALUES
        ('Quản Trị Viên', 'admin@pickleball.com',  NULL,          '${adminHash}', 'Admin', false, 'Active', 'TP. Hồ Chí Minh', 'Nam'),
        ('Nguyễn Văn An', 'user1@gmail.com',      '0901234567',  '${userHash}', 'Customer', false, 'Active', 'Quận 1, TP.HCM', 'Nam'),
        ('Trần Thị Bình', 'vip@gmail.com',        '0912345678',  '${userHash}', 'Customer', true,  'Active', 'Quận 7, TP.HCM', 'Nữ'),
        ('Lê Văn Cường',  'problem@gmail.com',    '0923456789',  '${userHash}', 'Customer', false, 'Active', 'Thủ Đức, TP.HCM', 'Nam'),
        ('Phạm Thị Dung', 'dung@gmail.com',       '0934567890',  '${userHash}', 'Customer', false, 'Active', 'Bình Thạnh, TP.HCM', 'Nữ'),
        ('Hoàng Văn Em',  'em@gmail.com',         '0945678901',  '${userHash}', 'Customer', true,  'Active', 'Quận 3, TP.HCM', 'Nam')
    `);

    // ── Courts ─────────────────────────────────────────────────────────
    // Sân 1
    await client.query(`
      INSERT INTO courts (tenSan, moTa, hinhAnh, trangThai) VALUES
        ('Sân Pickleball Landmark', 'Sân tiêu chuẩn quốc tế, có mái che, đèn chiếu sáng LED, mặt sân acrylic chuyên nghiệp. Có phòng thay đồ và quầy nước.', '/uploads/courts/court-1.jpg', 'Sẵn sàng'),
        ('Sân Pickleball Sunrise', 'Sân ngoài trời view đẹp, không gian thoáng mát. Mặt sân được bảo trì hàng tuần.', '/uploads/courts/court-2.jpg', 'Sẵn sàng'),
        ('Sân Pickleball Green Park', 'Không gian xanh mát giữa lòng thành phố. Sân có bóng mát tự nhiên, phù hợp chơi mọi thời điểm.', '/uploads/courts/court-3.jpg', 'Sẵn sàng'),
        ('Sân Pickleball Star', 'Sân cao cấp, có quán cafe phục vụ tại chỗ. Hệ thống âm thanh, wifi miễn phí.', '/uploads/courts/court-4.jpg', 'Sẵn sàng'),
        ('Sân Pickleball Victory', 'Sân rộng rãi, nhiều bãi đỗ xe. Có khu vực khởi động và huấn luyện viên chuyên nghiệp.', '/uploads/courts/court-5.jpg', 'Bảo trì')
    `);

    // Court images (1 ảnh chính cho mỗi sân)
    await client.query(`
      INSERT INTO court_images (sanId, duongDanAnh, isMain) VALUES
        (1, '/uploads/courts/court-1.jpg', true),
        (2, '/uploads/courts/court-2.jpg', true),
        (3, '/uploads/courts/court-3.jpg', true),
        (4, '/uploads/courts/court-4.jpg', true),
        (5, '/uploads/courts/court-5.jpg', true)
    `);

    // ── Time slots (per court) ─────────────────────────────────────────
    const slotData = [
      // Court 1 - Landmark (giá cao hơn)
      { sanId: 1, gioBatDau: '05:30', gioKetThuc: '07:00', mucGia: 200000 },
      { sanId: 1, gioBatDau: '07:00', gioKetThuc: '08:30', mucGia: 240000 },
      { sanId: 1, gioBatDau: '08:30', gioKetThuc: '10:00', mucGia: 240000 },
      { sanId: 1, gioBatDau: '10:00', gioKetThuc: '11:30', mucGia: 200000 },
      { sanId: 1, gioBatDau: '13:30', gioKetThuc: '15:00', mucGia: 200000 },
      { sanId: 1, gioBatDau: '15:00', gioKetThuc: '16:30', mucGia: 240000 },
      { sanId: 1, gioBatDau: '16:30', gioKetThuc: '18:00', mucGia: 260000 },
      { sanId: 1, gioBatDau: '18:00', gioKetThuc: '19:30', mucGia: 260000 },
      { sanId: 1, gioBatDau: '19:30', gioKetThuc: '21:00', mucGia: 220000 },

      // Court 2 - Sunrise
      { sanId: 2, gioBatDau: '05:30', gioKetThuc: '07:00', mucGia: 180000 },
      { sanId: 2, gioBatDau: '07:00', gioKetThuc: '08:30', mucGia: 216000 },
      { sanId: 2, gioBatDau: '08:30', gioKetThuc: '10:00', mucGia: 216000 },
      { sanId: 2, gioBatDau: '10:00', gioKetThuc: '11:30', mucGia: 180000 },
      { sanId: 2, gioBatDau: '13:30', gioKetThuc: '15:00', mucGia: 180000 },
      { sanId: 2, gioBatDau: '15:00', gioKetThuc: '16:30', mucGia: 216000 },
      { sanId: 2, gioBatDau: '16:30', gioKetThuc: '18:00', mucGia: 234000 },
      { sanId: 2, gioBatDau: '18:00', gioKetThuc: '19:30', mucGia: 234000 },
      { sanId: 2, gioBatDau: '19:30', gioKetThuc: '21:00', mucGia: 198000 },

      // Court 3 - Green Park
      { sanId: 3, gioBatDau: '05:30', gioKetThuc: '07:00', mucGia: 150000 },
      { sanId: 3, gioBatDau: '07:00', gioKetThuc: '08:30', mucGia: 180000 },
      { sanId: 3, gioBatDau: '08:30', gioKetThuc: '10:00', mucGia: 180000 },
      { sanId: 3, gioBatDau: '10:00', gioKetThuc: '11:30', mucGia: 150000 },
      { sanId: 3, gioBatDau: '13:30', gioKetThuc: '15:00', mucGia: 150000 },
      { sanId: 3, gioBatDau: '15:00', gioKetThuc: '16:30', mucGia: 180000 },
      { sanId: 3, gioBatDau: '16:30', gioKetThuc: '18:00', mucGia: 195000 },
      { sanId: 3, gioBatDau: '18:00', gioKetThuc: '19:30', mucGia: 195000 },

      // Court 4 - Star
      { sanId: 4, gioBatDau: '06:00', gioKetThuc: '07:30', mucGia: 220000 },
      { sanId: 4, gioBatDau: '07:30', gioKetThuc: '09:00', mucGia: 264000 },
      { sanId: 4, gioBatDau: '09:00', gioKetThuc: '10:30', mucGia: 264000 },
      { sanId: 4, gioBatDau: '14:00', gioKetThuc: '15:30', mucGia: 220000 },
      { sanId: 4, gioBatDau: '15:30', gioKetThuc: '17:00', mucGia: 264000 },
      { sanId: 4, gioBatDau: '17:00', gioKetThuc: '18:30', mucGia: 286000 },
      { sanId: 4, gioBatDau: '18:30', gioKetThuc: '20:00', mucGia: 286000 },
      { sanId: 4, gioBatDau: '20:00', gioKetThuc: '21:30', mucGia: 242000 },

      // Court 5 - Victory (Bảo trì nhưng vẫn có slot)
      { sanId: 5, gioBatDau: '06:00', gioKetThuc: '07:30', mucGia: 170000 },
      { sanId: 5, gioBatDau: '07:30', gioKetThuc: '09:00', mucGia: 204000 },
      { sanId: 5, gioBatDau: '09:00', gioKetThuc: '10:30', mucGia: 204000 },
      { sanId: 5, gioBatDau: '14:00', gioKetThuc: '15:30', mucGia: 170000 },
      { sanId: 5, gioBatDau: '15:30', gioKetThuc: '17:00', mucGia: 204000 },
      { sanId: 5, gioBatDau: '17:00', gioKetThuc: '18:30', mucGia: 221000 },
      { sanId: 5, gioBatDau: '18:30', gioKetThuc: '20:00', mucGia: 221000 },
    ];

    for (const s of slotData) {
      await client.query(
        'INSERT INTO timeslots (sanId, gioBatDau, gioKetThuc, mucGia) VALUES ($1, $2, $3, $4)',
        [s.sanId, s.gioBatDau, s.gioKetThuc, s.mucGia]
      );
    }

    // ── Services ────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO services (tenDichVu, donGia, loaiDichVu, trangThai) VALUES
        ('Vợt Pickleball',        50000,  'Dụng cụ',   'Còn hàng'),
        ('Bóng Pickleball (3 quả)', 20000,  'Dụng cụ',   'Còn hàng'),
        ('Giày thể thao',         30000,  'Dụng cụ',   'Còn hàng'),
        ('Khăn tắm',              10000,  'Dụng cụ',   'Còn hàng'),
        ('Nước suối',             10000,  'Đồ uống',   'Còn hàng'),
        ('Nước tăng lực',         20000,  'Đồ uống',   'Còn hàng'),
        ('Cà phê',                25000,  'Đồ uống',   'Còn hàng'),
        ('Trà đá',                15000,  'Đồ uống',   'Hết hàng')
    `);

    // ── Bookings ────────────────────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const dayAfter = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

    // Booking 1: user1, court1, slot1(5:30-7:00), ngày mai, Đã cọc 10%
    await client.query(`
      INSERT INTO bookings (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, trangThai)
      VALUES (2, 1, 1, '${tomorrow}', 200000, 20000, 'Đã cọc')
    `);

    // Booking 2: user1, court1, slot2(7:00-8:30), ngày mai, Đã cọc
    await client.query(`
      INSERT INTO bookings (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, trangThai)
      VALUES (2, 1, 2, '${tomorrow}', 240000, 24000, 'Đã cọc')
    `);

    // Booking 3: vip, court2, slot1, ngày mai, Đã thanh toán Full
    const b3 = await client.query(`
      INSERT INTO bookings (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, trangThai, isAutoBooking)
      VALUES (3, 2, 10, '${tomorrow}', 180000, 180000, 'Đã thanh toán Full', TRUE)
      RETURNING id
    `);

    // Booking 4: user4 (problem), court1, slot3, ngày kia, Đã cọc
    await client.query(`
      INSERT INTO bookings (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, trangThai)
      VALUES (4, 1, 3, '${dayAfter}', 240000, 24000, 'Đã cọc')
    `);

    // Booking 5: user5, court3, slot1, hôm qua, Hoàn thành
    const b5 = await client.query(`
      INSERT INTO bookings (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, trangThai)
      VALUES (5, 3, 19, '${yesterday}', 150000, 150000, 'Hoàn thành')
      RETURNING id
    `);

    // Booking 6: user5, court3, slot2, 2 ngày trước, Hoàn thành
    const b6 = await client.query(`
      INSERT INTO bookings (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, trangThai)
      VALUES (5, 3, 20, '${twoDaysAgo}', 180000, 180000, 'Hoàn thành')
      RETURNING id
    `);

    // Booking 7: user6 (VIP), court4, slot1, hôm nay, Đang sử dụng
    const b7 = await client.query(`
      INSERT INTO bookings (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, trangThai, isAutoBooking)
      VALUES (6, 4, 28, '${today}', 220000, 220000, 'Đang sử dụng', TRUE)
      RETURNING id
    `);

    // Booking 8: user2, court3, slot4, 3 ngày trước, Đã hủy
    await client.query(`
      INSERT INTO bookings (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, trangThai, ghiChu)
      VALUES (2, 3, 22, '${twoDaysAgo}', 150000, 15000, 'Đã hủy', 'Khách bận đột xuất')
    `);

    // Booking 9: user6 (VIP), court4, slot2, ngày mai, Đã cọc (tự động)
    await client.query(`
      INSERT INTO bookings (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, trangThai, isAutoBooking)
      VALUES (6, 4, 29, '${tomorrow}', 264000, 26400, 'Đã cọc', TRUE)
    `);

    // ── Payments ────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO payments (donDatId, soTien, loaiThanhToan, trangThai) VALUES
        (1, 20000,  'Deposit',   'Thành công'),
        (2, 24000,  'Deposit',   'Thành công'),
        (3, 180000, 'Full',      'Thành công'),
        (4, 24000,  'Deposit',   'Thành công'),
        (5, 150000, 'Full',      'Thành công'),
        (6, 180000, 'Full',      'Thành công'),
        (7, 220000, 'Full',      'Thành công'),
        (8, 15000,  'Deposit',   'Thành công'),
        (9, 26400,  'Deposit',   'Thành công')
    `);

    // ── Booking Services ────────────────────────────────────────────────
    // user1's pending booking có thuê vợt + nước
    await client.query(`
      INSERT INTO booking_services (donDatId, dichVuId, soLuong, tongTien) VALUES
        (1, 1, 2, 100000),
        (1, 5, 2, 20000),
        (3, 5, 1, 10000),
        (7, 2, 1, 20000),
        (7, 7, 2, 50000)
    `);

    // ── Reviews ─────────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO reviews (donDatId, nguoiDungId, diemSao, binhLuan, ngayTao) VALUES
        (${b5.rows[0].id}, 5, 5, 'Không gian thoáng mát, nhân viên nhiệt tình. Sân sạch sẽ, sẽ quay lại!', NOW() - INTERVAL '1 day'),
        (${b6.rows[0].id}, 5, 4, 'Sân ổn, giá hợp lý. Hơi ồn một chút vào giờ cao điểm.', NOW() - INTERVAL '2 days')
    `);

    // ── Notifications ───────────────────────────────────────────────────
    await client.query(`
      INSERT INTO notifications (nguoiDungId, tieuDe, noiDung, loaiThongBao, maDonDat, daDoc) VALUES
        (2, 'Đặt sân thành công', 'Đơn đặt sân #1 đã được xác nhận', 'booking_confirmed', 1, true),
        (2, 'Đặt sân thành công', 'Đơn đặt sân #2 đã được xác nhận', 'booking_confirmed', 2, false),
        (3, 'Đặt sân thành công', 'Đơn đặt sân #3 đã được xác nhận', 'booking_confirmed', 3, true),
        (3, 'Lịch VIP tự động', 'Đã tự động đặt lịch cho ngày mai. Vui lòng thanh toán.', 'vip_auto_success', 3, false),
        (4, 'Cảnh báo hủy lịch', 'Bạn đã hủy 3 lần. Các đơn tiếp theo sẽ yêu cầu thanh toán 100%.', 'warning', NULL, false),
        (5, 'Hoàn thành', 'Đơn #5 đã hoàn thành. Hãy đánh giá trải nghiệm của bạn!', 'booking_completed', 5, false),
        (6, 'Lịch VIP tự động', 'Đã tự động đặt lịch cho hôm nay. Chúc bạn chơi vui vẻ!', 'vip_auto_success', 7, true),
        (2, 'Khuyến mãi', 'Giảm 20% cho khách hàng mới! Dùng mã WELCOME20 khi đặt sân.', 'promotion', NULL, false)
    `);

    // ── Discounts ───────────────────────────────────────────────────────
    await client.query(`
      INSERT INTO discounts (code, noiDung, moTa, loaiGiamGia, mucGiamGia, ngayBatDau, ngayKetThuc, soLuongBanDau, soLuongDaDung, trangThai) VALUES
        ('WELCOME20', 'Giảm 20% cho khách mới', 'Áp dụng cho đơn đầu tiên, tối đa giảm 100K', 'percentage', 20, '2026-01-01', '2026-12-31', 100, 12, 'Active'),
        ('SUMMER50', 'Giảm 50K mùa hè', 'Giảm thẳng 50,000đ cho đơn từ 200K', 'fixed', 50000, '2026-06-01', '2026-08-31', 50, 0, 'Active'),
        ('VIP10', 'Ưu đãi VIP 10%', 'Dành riêng cho khách VIP', 'percentage', 10, '2026-01-01', '2026-12-31', 0, 0, 'Active'),
        ('TET2026', 'Giảm 30% Tết', 'Ưu đãi đặc biệt dịp Tết Nguyên Đán', 'percentage', 30, '2026-01-15', '2026-02-15', 200, 45, 'Inactive')
    `);

    // ── Set updated_at for existing rows ───────────────────────────────
    await client.query(`UPDATE users SET updated_at = NOW()`);
    await client.query(`UPDATE courts SET updated_at = NOW()`);

    await client.query('COMMIT');

    console.log('\n✅ Seed hoàn tất!');
    console.log('──────────────────────────────────────────────');
    console.log('📊 Thống kê dữ liệu mẫu:');
    console.log('  🏟️  5 sân Pickleball (1 đang bảo trì)');
    console.log('  🕐  42 khung giờ (phân bổ theo từng sân)');
    console.log('  🛒  8 dịch vụ (dụng cụ + đồ uống)');
    console.log('  📅  9 đơn đặt sân (nhiều trạng thái)');
    console.log('  ⭐  2 đánh giá');
    console.log('  🔔  8 thông báo');
    console.log('  🎫  4 mã giảm giá');
    console.log('');
    console.log('👤 Tài khoản test:');
    console.log('  Admin  : admin@pickleball.com  / admin123');
    console.log('  User   : user1@gmail.com       / user123');
    console.log('  VIP    : vip@gmail.com         / user123');
    console.log('  Warning: problem@gmail.com     / user123  (đã hủy nhiều)');
    console.log('  User5  : dung@gmail.com        / user123');
    console.log('  VIP2   : em@gmail.com          / user123');
    console.log('──────────────────────────────────────────────');

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
