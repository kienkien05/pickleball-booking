/**
 * Seed script - Nạp dữ liệu mẫu vào database pickleball_rework để testing và phát triển.
 *
 * Cách chạy: node src/seed.js
 *
 * Script này sẽ:
 * 1. Gọi initDatabase() để tạo lại tất cả các bảng nếu chưa có
 * 2. XÓA TOÀN BỘ dữ liệu cũ (TRUNCATE tất cả bảng với CASCADE)
 * 3. Nạp dữ liệu mẫu mới bao gồm:
 *    - 6 Users (1 Admin + 4 Customer + 1 VIP)
 *    - 5 Sân Pickleball (4 sẵn sàng + 1 bảo trì)
 *    - 42 Khung giờ (phân bổ theo từng sân, giá khác nhau)
 *    - 8 Dịch vụ (dụng cụ + đồ uống)
 *    - 9 Đơn đặt sân (nhiều trạng thái: Đã đặt, Đã thanh toán, Hoàn thành, Đã hủy, Đang sử dụng)
 *    - 9 Bản ghi thanh toán
 *    - 5 Dịch vụ đi kèm booking
 *    - 4 Đánh giá (review)
 *    - 8 Thông báo
 *    - 4 Mã giảm giá
 *    - 5 Ảnh sân (1 ảnh chính mỗi sân)
 *
 * Tất cả thay đổi nằm trong 1 transaction: nếu có lỗi -> ROLLBACK toàn bộ.
 *
 * Tài khoản test (mật khẩu giống nhau để dễ nhớ):
 * - Admin   : admin@pickleball.com  / admin123
 * - User    : user1@gmail.com       / user123
 * - VIP     : vip@gmail.com         / user123
 * - Warning : problem@gmail.com     / user123  (đã hủy nhiều lần)
 * - User5   : dung@gmail.com        / user123
 * - VIP2    : em@gmail.com          / user123
 */
const { pool, initDatabase } = require('./config/database');
const bcrypt = require('bcryptjs');

/**
 * Hàm seed() - Nạp toàn bộ dữ liệu mẫu vào database.
 *
 * Quy trình:
 * 1. initDatabase() - tạo bảng nếu chưa có
 * 2. BEGIN transaction
 * 3. TRUNCATE tất cả bảng (xóa sạch dữ liệu cũ)
 * 4. INSERT dữ liệu mẫu theo thứ tự: users -> courts -> court_images -> timeslots -> services -> bookings -> payments -> booking_services -> reviews -> notifications -> discounts
 * 5. COMMIT nếu thành công, ROLLBACK nếu có lỗi
 * 6. In ra thống kê và tài khoản test
 */
async function seed() {
  console.log('Đang khởi tạo database...');
  await initDatabase();
  console.log('Đang nạp dữ liệu mẫu...');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // ── Xóa dữ liệu cũ ─────────────────────────────────────────────────
    // TRUNCATE ... RESTART IDENTITY CASCADE: xóa hết dữ liệu + reset auto-increment
    await client.query(`
      TRUNCATE TABLE
        booking_services, payments, reviews, notifications,
        bookings, court_images, discounts,
        timeslots, services, users, courts
      RESTART IDENTITY CASCADE
    `);

    // ── Users (6 tài khoản) ──────────────────────────────────────────
    // Hash mật khẩu bằng bcryptjs với 10 vòng salt
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

    // ── Courts (5 sân) ─────────────────────────────────────────────────────────
    // Mỗi sân có tên, mô tả, ảnh đại diện và trạng thái
    await client.query(`
      INSERT INTO courts (tenSan, moTa, hinhAnh, trangThai) VALUES
        ('Sân Pickleball Landmark', 'Sân tiêu chuẩn quốc tế, có mái che, đèn chiếu sáng LED, mặt sân acrylic chuyên nghiệp. Có phòng thay đồ và quầy nước.', '/uploads/courts/court-1.jpg', 'Sẵn sàng'),
        ('Sân Pickleball Sunrise', 'Sân ngoài trời view đẹp, không gian thoáng mát. Mặt sân được bảo trì hàng tuần.', '/uploads/courts/court-2.jpg', 'Sẵn sàng'),
        ('Sân Pickleball Green Park', 'Không gian xanh mát giữa lòng thành phố. Sân có bóng mát tự nhiên, phù hợp chơi mọi thời điểm.', '/uploads/courts/court-3.jpg', 'Sẵn sàng'),
        ('Sân Pickleball Star', 'Sân cao cấp, có quán cafe phục vụ tại chỗ. Hệ thống âm thanh, wifi miễn phí.', '/uploads/courts/court-4.jpg', 'Sẵn sàng'),
        ('Sân Pickleball Victory', 'Sân rộng rãi, nhiều bãi đỗ xe. Có khu vực khởi động và huấn luyện viên chuyên nghiệp.', '/uploads/courts/court-5.jpg', 'Bảo trì')
    `);

    // ── Court images (1 ảnh chính cho mỗi sân) ─────────────────────────
    await client.query(`
      INSERT INTO court_images (sanId, duongDanAnh, isMain) VALUES
        (1, '/uploads/courts/court-1.jpg', true),
        (2, '/uploads/courts/court-2.jpg', true),
        (3, '/uploads/courts/court-3.jpg', true),
        (4, '/uploads/courts/court-4.jpg', true),
        (5, '/uploads/courts/court-5.jpg', true)
    `);

    // ── Time slots (42 khung giờ, phân bổ theo từng sân) ─────────────────
    // Giá khác nhau tùy sân và khung giờ (giờ cao điểm giá cao hơn)
    const slotData = [
      // Court 1 - Landmark (sân cao cấp, giá cao nhất)
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

      // Court 3 - Green Park (giá rẻ nhất)
      { sanId: 3, gioBatDau: '05:30', gioKetThuc: '07:00', mucGia: 150000 },
      { sanId: 3, gioBatDau: '07:00', gioKetThuc: '08:30', mucGia: 180000 },
      { sanId: 3, gioBatDau: '08:30', gioKetThuc: '10:00', mucGia: 180000 },
      { sanId: 3, gioBatDau: '10:00', gioKetThuc: '11:30', mucGia: 150000 },
      { sanId: 3, gioBatDau: '13:30', gioKetThuc: '15:00', mucGia: 150000 },
      { sanId: 3, gioBatDau: '15:00', gioKetThuc: '16:30', mucGia: 180000 },
      { sanId: 3, gioBatDau: '16:30', gioKetThuc: '18:00', mucGia: 195000 },
      { sanId: 3, gioBatDau: '18:00', gioKetThuc: '19:30', mucGia: 195000 },

      // Court 4 - Star (giờ bắt đầu muộn hơn, giá cao)
      { sanId: 4, gioBatDau: '06:00', gioKetThuc: '07:30', mucGia: 220000 },
      { sanId: 4, gioBatDau: '07:30', gioKetThuc: '09:00', mucGia: 264000 },
      { sanId: 4, gioBatDau: '09:00', gioKetThuc: '10:30', mucGia: 264000 },
      { sanId: 4, gioBatDau: '14:00', gioKetThuc: '15:30', mucGia: 220000 },
      { sanId: 4, gioBatDau: '15:30', gioKetThuc: '17:00', mucGia: 264000 },
      { sanId: 4, gioBatDau: '17:00', gioKetThuc: '18:30', mucGia: 286000 },
      { sanId: 4, gioBatDau: '18:30', gioKetThuc: '20:00', mucGia: 286000 },
      { sanId: 4, gioBatDau: '20:00', gioKetThuc: '21:30', mucGia: 242000 },

      // Court 5 - Victory (đang bảo trì, nhưng vẫn có slot cấu hình sẵn)
      { sanId: 5, gioBatDau: '06:00', gioKetThuc: '07:30', mucGia: 170000 },
      { sanId: 5, gioBatDau: '07:30', gioKetThuc: '09:00', mucGia: 204000 },
      { sanId: 5, gioBatDau: '09:00', gioKetThuc: '10:30', mucGia: 204000 },
      { sanId: 5, gioBatDau: '14:00', gioKetThuc: '15:30', mucGia: 170000 },
      { sanId: 5, gioBatDau: '15:30', gioKetThuc: '17:00', mucGia: 204000 },
      { sanId: 5, gioBatDau: '17:00', gioKetThuc: '18:30', mucGia: 221000 },
      { sanId: 5, gioBatDau: '18:30', gioKetThuc: '20:00', mucGia: 221000 },
    ];

    // Chèn từng khung giờ vào DB
    for (const s of slotData) {
      await client.query(
        'INSERT INTO timeslots (sanId, gioBatDau, gioKetThuc, mucGia) VALUES ($1, $2, $3, $4)',
        [s.sanId, s.gioBatDau, s.gioKetThuc, s.mucGia]
      );
    }

    // ── Services (8 dịch vụ: dụng cụ + đồ uống) ────────────────────────
    // Mỗi dịch vụ có tên, đơn giá, loại, số lượng tồn kho và trạng thái
    await client.query(`
      INSERT INTO services (tenDichVu, donGia, loaiDichVu, soLuongTon, trangThai) VALUES
        ('Vợt Pickleball',        50000,  'Dụng cụ',   100, 'Còn hàng'),
        ('Bóng Pickleball (3 quả)', 20000,  'Dụng cụ',   500, 'Còn hàng'),
        ('Giày thể thao',         30000,  'Dụng cụ',   150, 'Còn hàng'),
        ('Khăn tắm',              10000,  'Dụng cụ',   300, 'Còn hàng'),
        ('Nước suối',             10000,  'Đồ uống',   1000,'Còn hàng'),
        ('Nước tăng lực',         20000,  'Đồ uống',   800, 'Còn hàng'),
        ('Cà phê',                25000,  'Đồ uống',   600, 'Còn hàng'),
        ('Trà đá',                15000,  'Đồ uống',   0,  'Hết hàng')
    `);

    // ── Bookings (9 đơn đặt sân với nhiều trạng thái) ────────────────────────
    // Tính toán ngày tương đối để dữ liệu luôn có ý nghĩa khi chạy
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    const dayAfter = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const twoDaysAgo = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);

    // Booking 1-2: user1 đặt sân Landmark ngày mai (tiền mặt, chưa thanh toán)
    await client.query(`
      INSERT INTO bookings (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, trangThai)
      VALUES (2, 1, 1, '${tomorrow}', 200000, 200000, 'Đã đặt')
    `);

    await client.query(`
      INSERT INTO bookings (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, trangThai)
      VALUES (2, 1, 2, '${tomorrow}', 240000, 240000, 'Đã đặt')
    `);

    // Booking 3: VIP đặt sân Sunrise ngày mai (đã thanh toán, isAutoBooking = TRUE)
    const b3 = await client.query(`
      INSERT INTO bookings (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, trangThai, isAutoBooking)
      VALUES (3, 2, 10, '${tomorrow}', 180000, 180000, 'Đã thanh toán', TRUE)
      RETURNING id
    `);

    // Booking 4: user4 (problem) đặt sân Landmark ngày kia (đã thanh toán qua MoMo)
    await client.query(`
      INSERT INTO bookings (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, trangThai)
      VALUES (4, 1, 3, '${dayAfter}', 240000, 24000, 'Đã thanh toán')
    `);

    // Booking 5-6: user5 đã hoàn thành 2 đơn (để có lịch sử đánh giá)
    const b5 = await client.query(`
      INSERT INTO bookings (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, trangThai)
      VALUES (5, 3, 19, '${yesterday}', 150000, 150000, 'Hoàn thành')
      RETURNING id
    `);

    const b6 = await client.query(`
      INSERT INTO bookings (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, trangThai)
      VALUES (5, 3, 20, '${twoDaysAgo}', 180000, 180000, 'Hoàn thành')
      RETURNING id
    `);

    // Booking 7: VIP2 đang sử dụng sân Star hôm nay
    const b7 = await client.query(`
      INSERT INTO bookings (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, trangThai, isAutoBooking)
      VALUES (6, 4, 28, '${today}', 220000, 220000, 'Đang sử dụng', TRUE)
      RETURNING id
    `);

    // Booking 8: user2 đã hủy đơn (có ghi chú lý do)
    await client.query(`
      INSERT INTO bookings (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, trangThai, ghiChu)
      VALUES (2, 3, 22, '${twoDaysAgo}', 150000, 15000, 'Đã hủy', 'Khách bận đột xuất')
    `);

    // Booking 9: VIP2 đặt sân Star ngày mai (đã thanh toán, isAutoBooking = TRUE)
    await client.query(`
      INSERT INTO bookings (nguoiDungId, sanId, khungGioId, ngayChoi, tongTien, tienDaCoc, trangThai, isAutoBooking)
      VALUES (6, 4, 29, '${tomorrow}', 264000, 26400, 'Đã thanh toán', TRUE)
    `);

    // ── Payments (9 bản ghi thanh toán tương ứng với bookings) ──────────
    // Mỗi booking có 1 payment, trạng thái khác nhau tùy phương thức
    await client.query(`
      INSERT INTO payments (donDatId, soTien, loaiThanhToan, trangThai) VALUES
        (1, 200000, 'Full - Tiền mặt', 'Chờ thanh toán'),
        (2, 240000, 'Full - Tiền mặt', 'Chờ thanh toán'),
        (3, 180000, 'Full - Chuyển khoản', 'Thành công'),
        (4, 24000,  'Full - MoMo',   'Thành công'),
        (5, 150000, 'Full',      'Thành công'),
        (6, 180000, 'Full',      'Thành công'),
        (7, 220000, 'Full - Visa/MC', 'Thành công'),
        (8, 15000,  'Full',   'Thành công'),
        (9, 26400,  'Full',   'Thành công')
    `);

    // ── Booking Services (dịch vụ đi kèm đơn đặt sân) ──────────────────
    // Booking 1: thuê 2 vợt + 2 nước suối
    // Booking 3: 1 nước suối
    // Booking 7: 1 bóng + 2 cà phê
    await client.query(`
      INSERT INTO booking_services (donDatId, dichVuId, soLuong, tongTien) VALUES
        (1, 1, 2, 100000),
        (1, 5, 2, 20000),
        (3, 5, 1, 10000),
        (7, 2, 1, 20000),
        (7, 7, 2, 50000)
    `);

    // ── Reviews (4 đánh giá) ───────────────────────────────────────────
    // Gồm đánh giá theo đơn (donDatId) và đánh giá theo sân (chỉ có sanId)
    await client.query(`
      INSERT INTO reviews (donDatId, nguoiDungId, diemSao, binhLuan, ngayTao) VALUES
        (${b5.rows[0].id}, 5, 5, 'Không gian thoáng mát, nhân viên nhiệt tình. Sân sạch sẽ, sẽ quay lại!', NOW() - INTERVAL '1 day'),
        (${b6.rows[0].id}, 5, 4, 'Sân ổn, giá hợp lý. Hơi ồn một chút vào giờ cao điểm.', NOW() - INTERVAL '2 days'),
        (1, 2, 5, 'Sân Landmark đánh cực sướng, mặt sân mới và êm chân!', NOW() - INTERVAL '3 hours'),
        (2, 2, 4, 'Ánh sáng đèn LED rất tốt, không bị chói mắt khi lốp bóng.', NOW() - INTERVAL '1 hour')
    `);

    // ── Notifications (8 thông báo mẫu) ─────────────────────────────────
    // Đủ các loại: booking_confirmed, vip_auto_success, warning, booking_completed, promotion
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

    // ── Discounts (4 mã giảm giá) ──────────────────────────────────────
    // Mỗi mã có loại giảm giá, điều kiện và đối tượng áp dụng khác nhau
    await client.query(`
      INSERT INTO discounts (code, noiDung, moTa, loaiGiamGia, mucGiamGia, ngayBatDau, ngayKetThuc, soLuongBanDau, soLuongDaDung, trangThai, is_hidden, nguoiDungId, conditions) VALUES
        ('WELCOME8', 'Mã chào mừng khách mới', 'Giảm 8% cho đơn đầu tiên, tối đa 100K', 'percentage', 8, '2026-01-01', '2026-12-31', 500, 0, 'Active', false, NULL, '{"target_audience": "new_user"}'),
        ('TET50', 'Giảm 50K mùa Tết', 'Sự kiện Fanpage - Giảm thẳng 50,000đ cho đơn từ 300K', 'fixed', 50000, '2026-01-01', '2026-12-31', 100, 0, 'Active', true, NULL, '{}'),
        ('SUMMER50', 'Giảm 50K mùa hè', 'Giảm thẳng 50,000đ cho đơn từ 200K', 'fixed', 50000, '2026-01-01', '2026-12-31', 100, 0, 'Active', false, NULL, '{}'),
        ('PRO20', 'Ưu đãi hội viên Pro', 'Giảm 20% dành riêng cho VIP', 'percentage', 20, '2026-01-01', '2026-12-31', 999, 0, 'Active', false, NULL, '{"target_audience": "vip"}');
    `);

    // ── Cập nhật updated_at cho users và courts ──────────────────────
    await client.query(`UPDATE users SET updated_at = NOW()`);
    await client.query(`UPDATE courts SET updated_at = NOW()`);

    // COMMIT transaction - lưu toàn bộ thay đổi
    await client.query('COMMIT');

    // In thống kê kết quả seed
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
