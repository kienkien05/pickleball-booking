/**
 * Cấu hình kết nối database PostgreSQL và khởi tạo schema cho hệ thống đặt sân Pickleball.
 *
 * File này thực hiện:
 * 1. Tạo connection pool đến PostgreSQL thông qua thư viện pg (node-postgres).
 *    - Kết nối sử dụng connection string lấy từ biến môi trường DATABASE_URL trong file .env.
 *    - Dùng dotenv để nạp biến môi trường từ file .env vào process.env.
 *
 * 2. Định nghĩa bảng ánh xạ FIELD_MAP để chuyển đổi tên cột từ lowercase (cách PostgreSQL lưu)
 *    sang camelCase (cách frontend mong đợi).
 *    - PostgreSQL mặc định chuyển tất cả tên cột không được quote về chữ thường.
 *    - Frontend sử dụng camelCase, nên cần ánh xạ ngược lại để đồng bộ dữ liệu.
 *
 * 3. Wrap lại hàm pool.query để tự động sửa tên cột cho tất cả kết quả truy vấn.
 *    - Hàm fixRowKeys sẽ duyệt từng key trong row và đổi tên theo FIELD_MAP.
 *    - Điều này đảm bảo mọi query đều trả về dữ liệu đúng định dạng camelCase.
 *
 * 4. Hàm initDatabase() tạo các bảng trong database nếu chưa tồn tại:
 *    - users: bảng người dùng (họ tên, email, mật khẩu, vai trò, VIP, giới tính, địa chỉ, avatar...)
 *    - courts: bảng sân pickleball (tên sân, mô tả, hình ảnh, trạng thái)
 *    - timeslots: bảng khung giờ cho từng sân (giờ bắt đầu, kết thúc, mức giá)
 *    - services: bảng dịch vụ đi kèm (tên dịch vụ, đơn giá, loại, số lượng tồn)
 *    - bookings: bảng đơn đặt sân (người dùng, sân, khung giờ, ngày chơi, tổng tiền, trạng thái...)
 *    - booking_services: bảng dịch vụ trong đơn đặt (liên kết đơn đặt với dịch vụ)
 *    - payments: bảng thanh toán (liên kết đơn đặt, số tiền, loại thanh toán, ngày giao dịch)
 *    - reviews: bảng đánh giá (liên kết đơn đặt, người dùng, điểm sao, bình luận)
 *    - notifications: bảng thông báo (gửi đến người dùng, tiêu đề, nội dung, loại, đã đọc chưa)
 *    - court_images: bảng ảnh sân (liên kết sân, đường dẫn ảnh, có phải ảnh chính không)
 *    - discounts: bảng mã giảm giá (mã code, nội dung, mô tả, loại giảm, mức giảm, thời hạn, số lượng...)
 *
 * 5. Sau khi tạo bảng, chạy các câu lệnh ALTER TABLE để thêm cột mới cho database cũ
 *    (đảm bảo tương thích ngược khi nâng cấp schema).
 *
 * 6. Tạo tài khoản admin mặc định nếu chưa tồn tại (admin@pickleball.com / admin123).
 *    - Sử dụng bcryptjs để hash mật khẩu với 10 vòng salt.
 *    - Tài khoản này có vai trò 'Admin', có toàn quyền quản trị hệ thống.
 */

const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
console.log('DB URL:', process.env.DATABASE_URL);

// Tạo connection pool - quản lý các kết nối đến PostgreSQL một cách hiệu quả
// Pool tự động quản lý vòng đời kết nối: mở, đóng, tái sử dụng
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Map PG lowercase column names → original camelCase
// PG stores unquoted identifiers as lowercase; frontend expects camelCase
// Bảng ánh xạ: PostgreSQL lưu tên cột viết thường (vd: hoten, sodienthoai)
// -> frontend cần camelCase (vd: hoTen, soDienThoai)
const FIELD_MAP = {
  // users - bảng người dùng
  hoten: 'hoTen', sodienthoai: 'soDienThoai', matkhau: 'matKhau', vaitro: 'vaiTro',
  isvip: 'isVIP', gioitinh: 'gioiTinh', diachi: 'diaChi', avatar_url: 'avatar_url',
  // courts - bảng sân
  tensan: 'tenSan', mota: 'moTa', hinhanh: 'hinhAnh',
  // timeslots - bảng khung giờ
  sanid: 'sanId', giobatdau: 'gioBatDau', gioketthuc: 'gioKetThuc', mucgia: 'mucGia',
  // services - bảng dịch vụ
  tendichvu: 'tenDichVu', dongia: 'donGia', loaidichvu: 'loaiDichVu',
  // bookings - bảng đơn đặt sân
  nguoidungid: 'nguoiDungId', khunggioid: 'khungGioId', ngaychoi: 'ngayChoi',
  tongtien: 'tongTien', tiendacoc: 'tienDaCoc', giagoc: 'giaGoc', tiengiam: 'tienGiam',
  isautobooking: 'isAutoBooking', ghichu: 'ghiChu',
  // booking_services - bảng dịch vụ trong đơn
  dondatid: 'donDatId', dichvuid: 'dichVuId', soluong: 'soLuong',
  // payments - bảng thanh toán
  sotien: 'soTien', loaithanhtoan: 'loaiThanhToan', ngaygiaodich: 'ngayGiaoDich',
  // reviews - bảng đánh giá
  diemsao: 'diemSao', binhluan: 'binhLuan', ngaytao: 'ngayTao',
  // notifications - bảng thông báo
  tieude: 'tieuDe', noidung: 'noiDung', loaithongbao: 'loaiThongBao',
  dadoc: 'daDoc', madondat: 'maDonDat', thoigiantao: 'thoiGianTao',
  // court_images - bảng ảnh sân
  duongdananh: 'duongDanAnh', ismain: 'isMain',
  // discounts - bảng mã giảm giá
  loaigiamgia: 'loaiGiamGia', mucgiamgia: 'mucGiamGia', ngaybatdau: 'ngayBatDau',
  ngayketthuc: 'ngayKetThuc', soluongbandau: 'soLuongBanDau', soluongdadung: 'soLuongDaDung',
  usage_limit_per_user: 'usageLimitPerUser', giamtoida: 'giamToiDa',
  // common - các trường dùng chung
  trangthai: 'trangThai', created_at: 'created_at', updated_at: 'updated_at',
  soluongton: 'soLuongTon', is_hidden: 'isHidden',
  // aliases from queries - bí danh từ các câu truy vấn
  avgrating: 'avgRating', slotcount: 'slotCount',
  booking_id: 'booking_id', court_id: 'court_id', court_name: 'court_name',
  slot_id: 'slot_id', user_name: 'user_name', is_vip: 'is_vip',
  is_auto_booking: 'is_auto_booking', booking_date: 'booking_date',
  // computed - các trường tính toán từ query
  totalrevenue: 'totalRevenue', totalbookings: 'totalBookings', cancelrevenue: 'cancelRevenue',
  revenue: 'revenue', date: 'date', name: 'name', total: 'total', count: 'count',
  customer: 'customer', court: 'court', timeslot: 'timeslot', status: 'status',
  deposit: 'deposit', full_name: 'full_name', phone_number: 'phone_number',
  is_active: 'is_active', role: 'role', email: 'email',
  magiamgia: 'maGiamGia',
};

/**
 * Sửa lại tên cột của một dòng dữ liệu từ PostgreSQL (lowercase) sang camelCase.
 * Duyệt qua từng key của object row, nếu key có trong FIELD_MAP thì đổi tên,
 * nếu không có thì giữ nguyên. Dùng cho mọi kết quả query để đồng bộ với frontend.
 *
 * @param {Object} row - Dòng dữ liệu trả về từ PostgreSQL
 * @returns {Object} Dòng dữ liệu đã được chuyển đổi tên cột sang camelCase
 */
function fixRowKeys(row) {
  if (!row || typeof row !== 'object') return row;
  const fixed = {};
  for (const key of Object.keys(row)) {
    const mapped = FIELD_MAP[key] || key;
    fixed[mapped] = row[key];
  }
  return fixed;
}

// Wrap pool.query to fix column name casing
// Ghi đè hàm pool.query gốc: sau khi query xong, tự động sửa tên cột trong kết quả
// Đảm bảo tất cả API trả về dữ liệu đúng camelCase mà không cần sửa từng route
const _origQuery = pool.query.bind(pool);
pool.query = async function (...args) {
  const result = await _origQuery(...args);
  if (result.rows) {
    result.rows = result.rows.map(fixRowKeys);
  }
  return result;
};

/**
 * Khởi tạo database: tạo tất cả các bảng nếu chưa tồn tại và thêm dữ liệu mặc định.
 *
 * Các bước thực hiện:
 * 1. Tạo bảng users (người dùng), courts (sân), timeslots (khung giờ)
 * 2. Tạo bảng services (dịch vụ), bookings (đơn đặt sân), booking_services
 * 3. Tạo bảng payments (thanh toán), reviews (đánh giá), notifications (thông báo)
 * 4. Tạo bảng court_images (ảnh sân), discounts (mã giảm giá)
 * 5. Chạy ALTER TABLE để thêm cột mới (tương thích ngược với database cũ)
 * 6. Tạo tài khoản admin mặc định nếu chưa có
 *
 * Sử dụng CREATE TABLE IF NOT EXISTS nên có thể chạy lại nhiều lần không gây lỗi.
 * Mỗi bảng có khóa chính id tự tăng (SERIAL PRIMARY KEY).
 * Các quan hệ khóa ngoại sử dụng REFERENCES với ON DELETE CASCADE để tự động xóa dữ liệu liên quan.
 */
async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        hoTen VARCHAR(100) NOT NULL,
        soDienThoai VARCHAR(15) UNIQUE,
        email VARCHAR(150) UNIQUE NOT NULL,
        matKhau VARCHAR(255) NOT NULL,
        vaiTro VARCHAR(50) DEFAULT 'Customer',
        isVIP BOOLEAN DEFAULT FALSE,
        gioiTinh VARCHAR(10),
        diaChi VARCHAR(255),
        avatar_url VARCHAR(500),
        trangThai VARCHAR(50) DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS courts (
        id SERIAL PRIMARY KEY,
        tenSan VARCHAR(100) NOT NULL,
        moTa TEXT,
        hinhAnh VARCHAR(500),
        trangThai VARCHAR(50) DEFAULT 'Sẵn sàng',
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS timeslots (
        id SERIAL PRIMARY KEY,
        sanId INTEGER NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
        gioBatDau TIME NOT NULL,
        gioKetThuc TIME NOT NULL,
        mucGia DECIMAL(15,2) NOT NULL,
        trangThai VARCHAR(50) DEFAULT 'Active'
      );

      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        tenDichVu VARCHAR(100) NOT NULL,
        donGia DECIMAL(15,2) NOT NULL,
        loaiDichVu VARCHAR(50),
        soLuongTon INTEGER DEFAULT 0,
        trangThai VARCHAR(50) DEFAULT 'Còn hàng',
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS bookings (
        id SERIAL PRIMARY KEY,
        nguoiDungId INTEGER NOT NULL REFERENCES users(id),
        sanId INTEGER NOT NULL REFERENCES courts(id),
        khungGioId INTEGER NOT NULL REFERENCES timeslots(id),
        ngayChoi DATE NOT NULL,
        tongTien DECIMAL(15,2) NOT NULL,
        tienDaCoc DECIMAL(15,2) DEFAULT 0,
        giaGoc DECIMAL(15,2),
        tienGiam DECIMAL(15,2) DEFAULT 0,
        trangThai VARCHAR(50) DEFAULT 'Đã cọc',
        isAutoBooking BOOLEAN DEFAULT FALSE,
        ghiChu TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS booking_services (
        id SERIAL PRIMARY KEY,
        donDatId INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        dichVuId INTEGER NOT NULL REFERENCES services(id),
        soLuong INTEGER NOT NULL DEFAULT 1,
        tongTien DECIMAL(15,2) NOT NULL
      );

      CREATE TABLE IF NOT EXISTS payments (
        id SERIAL PRIMARY KEY,
        donDatId INTEGER NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
        soTien DECIMAL(15,2) NOT NULL,
        loaiThanhToan VARCHAR(50) NOT NULL,
        ngayGiaoDich TIMESTAMP DEFAULT NOW(),
        trangThai VARCHAR(50) DEFAULT 'Thành công'
      );

      CREATE TABLE IF NOT EXISTS reviews (
        id SERIAL PRIMARY KEY,
        donDatId INTEGER NOT NULL REFERENCES bookings(id),
        nguoiDungId INTEGER NOT NULL REFERENCES users(id),
        diemSao INTEGER NOT NULL CHECK (diemSao BETWEEN 1 AND 5),
        binhLuan TEXT,
        ngayTao TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        nguoiDungId INTEGER NOT NULL REFERENCES users(id),
        tieuDe VARCHAR(255) NOT NULL,
        noiDung TEXT,
        loaiThongBao VARCHAR(50) DEFAULT 'system',
        daDoc BOOLEAN DEFAULT FALSE,
        maDonDat INTEGER REFERENCES bookings(id),
        thoiGianTao TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS court_images (
        id SERIAL PRIMARY KEY,
        sanId INTEGER NOT NULL REFERENCES courts(id) ON DELETE CASCADE,
        duongDanAnh VARCHAR(500) NOT NULL,
        isMain BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS discounts (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        noiDung VARCHAR(255),
        moTa TEXT,
        loaiGiamGia VARCHAR(50) DEFAULT 'percentage',
        mucGiamGia DECIMAL(15,2) NOT NULL,
        ngayBatDau TIMESTAMP,
        ngayKetThuc TIMESTAMP,
        soLuongBanDau INTEGER DEFAULT 0,
        soLuongDaDung INTEGER DEFAULT 0,
        usage_limit_per_user INTEGER DEFAULT 1,
        giamToiDa DECIMAL(15,2),
        conditions JSONB DEFAULT '{}',
        nguoiDungId INTEGER REFERENCES users(id) ON DELETE CASCADE,
        trangThai VARCHAR(50) DEFAULT 'Active',
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Thêm cột nguoiDungId vào bảng discounts cho database đã tồn tại (tương thích ngược)
    await client.query("ALTER TABLE discounts ADD COLUMN IF NOT EXISTS nguoiDungId INTEGER REFERENCES users(id) ON DELETE CASCADE").catch(() => {});

    // Thêm cột billing (giá gốc, tiền giảm) vào bảng bookings cho database cũ
    await client.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS giaGoc DECIMAL(15,2)").catch(() => {});
    await client.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tienGiam DECIMAL(15,2) DEFAULT 0").catch(() => {});

    // Thêm cột giới hạn sử dụng cho bảng discounts
    await client.query("ALTER TABLE discounts ADD COLUMN IF NOT EXISTS usage_limit_per_user INTEGER DEFAULT 1").catch(() => {});
    await client.query("ALTER TABLE discounts ADD COLUMN IF NOT EXISTS giamToiDa DECIMAL(15,2)").catch(() => {});
    await client.query("ALTER TABLE discounts ADD COLUMN IF NOT EXISTS conditions JSONB DEFAULT '{}'").catch(() => {});

    // Thêm cột mã giảm giá vào bảng bookings để theo dõi mã đã dùng
    await client.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS maGiamGia VARCHAR(50)").catch(() => {});

    // Thêm cột is_hidden vào bảng discounts để ẩn mã bí mật/fanpage
    await client.query("ALTER TABLE discounts ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE").catch(() => {});

    // Thêm cột số lượng tồn cho bảng services
    await client.query("ALTER TABLE services ADD COLUMN IF NOT EXISTS soLuongTon INTEGER DEFAULT 0").catch(() => {});
    // Cho phép đánh giá không cần tham chiếu đến đơn đặt sân (đánh giá cấp sân)
    await client.query("ALTER TABLE reviews ALTER COLUMN donDatId DROP NOT NULL").catch(() => {});
    await client.query("ALTER TABLE reviews ADD COLUMN IF NOT EXISTS sanId INTEGER REFERENCES courts(id)").catch(() => {});

    // Tạo tài khoản admin mặc định nếu chưa tồn tại
    // Sử dụng bcryptjs để hash mật khẩu an toàn (10 vòng salt)
    // Tài khoản: admin@pickleball.com / admin123, vai trò Admin
    const bcrypt = require('bcryptjs');
    const adminCheck = await client.query("SELECT id FROM users WHERE email = 'admin@pickleball.com'");
    if (adminCheck.rows.length === 0) {
      const hashedPw = await bcrypt.hash('admin123', 10);
      await client.query(
        "INSERT INTO users (hoTen, email, matKhau, vaiTro) VALUES ($1, $2, $3, $4)",
        ['Admin', 'admin@pickleball.com', hashedPw, 'Admin']
      );
      console.log('Default admin created: admin@pickleball.com / admin123');
    }
  } finally {
    client.release();
  }
}

module.exports = { pool, initDatabase };
