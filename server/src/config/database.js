const { Pool } = require('pg');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Map PG lowercase column names → original camelCase
// PG stores unquoted identifiers as lowercase; frontend expects camelCase
const FIELD_MAP = {
  // users
  hoten: 'hoTen', sodienthoai: 'soDienThoai', matkhau: 'matKhau', vaitro: 'vaiTro',
  isvip: 'isVIP', gioitinh: 'gioiTinh', diachi: 'diaChi', avatar_url: 'avatar_url',
  // courts
  tensan: 'tenSan', mota: 'moTa', hinhanh: 'hinhAnh',
  // timeslots
  sanid: 'sanId', giobatdau: 'gioBatDau', gioketthuc: 'gioKetThuc', mucgia: 'mucGia',
  // services
  tendichvu: 'tenDichVu', dongia: 'donGia', loaidichvu: 'loaiDichVu',
  // bookings
  nguoidungid: 'nguoiDungId', khunggioid: 'khungGioId', ngaychoi: 'ngayChoi',
  tongtien: 'tongTien', tiendacoc: 'tienDaCoc', giagoc: 'giaGoc', tiengiam: 'tienGiam',
  isautobooking: 'isAutoBooking', ghichu: 'ghiChu',
  // booking_services
  dondatid: 'donDatId', dichvuid: 'dichVuId', soluong: 'soLuong',
  // payments
  sotien: 'soTien', loaithanhtoan: 'loaiThanhToan', ngaygiaodich: 'ngayGiaoDich',
  // reviews
  diemsao: 'diemSao', binhluan: 'binhLuan', ngaytao: 'ngayTao',
  // notifications
  tieude: 'tieuDe', noidung: 'noiDung', loaithongbao: 'loaiThongBao',
  dadoc: 'daDoc', madondat: 'maDonDat', thoigiantao: 'thoiGianTao',
  // court_images
  duongdananh: 'duongDanAnh', ismain: 'isMain',
  // discounts
  loaigiamgia: 'loaiGiamGia', mucgiamgia: 'mucGiamGia', ngaybatdau: 'ngayBatDau',
  ngayketthuc: 'ngayKetThuc', soluongbandau: 'soLuongBanDau', soluongdadung: 'soLuongDaDung',
  usage_limit_per_user: 'usageLimitPerUser', giamtoida: 'giamToiDa',
  // common
  trangthai: 'trangThai', created_at: 'created_at', updated_at: 'updated_at',
  soluongton: 'soLuongTon', is_hidden: 'isHidden',
  // aliases from queries
  avgrating: 'avgRating', slotcount: 'slotCount',
  booking_id: 'booking_id', court_id: 'court_id', court_name: 'court_name',
  slot_id: 'slot_id', user_name: 'user_name', is_vip: 'is_vip',
  is_auto_booking: 'is_auto_booking', booking_date: 'booking_date',
  // computed
  totalrevenue: 'totalRevenue', totalbookings: 'totalBookings', cancelrevenue: 'cancelRevenue',
  revenue: 'revenue', date: 'date', name: 'name', total: 'total', count: 'count',
  customer: 'customer', court: 'court', timeslot: 'timeslot', status: 'status',
  deposit: 'deposit', full_name: 'full_name', phone_number: 'phone_number',
  is_active: 'is_active', role: 'role', email: 'email',
  magiamgia: 'maGiamGia',
};

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
const _origQuery = pool.query.bind(pool);
pool.query = async function (...args) {
  const result = await _origQuery(...args);
  if (result.rows) {
    result.rows = result.rows.map(fixRowKeys);
  }
  return result;
};

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

    // Add nguoiDungId to discounts for existing databases
    await client.query("ALTER TABLE discounts ADD COLUMN IF NOT EXISTS nguoiDungId INTEGER REFERENCES users(id) ON DELETE CASCADE").catch(() => {});

    // Add billing columns to bookings for existing databases
    await client.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS giaGoc DECIMAL(15,2)").catch(() => {});
    await client.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS tienGiam DECIMAL(15,2) DEFAULT 0").catch(() => {});

    // Add rule-based columns to discounts for existing databases
    await client.query("ALTER TABLE discounts ADD COLUMN IF NOT EXISTS usage_limit_per_user INTEGER DEFAULT 1").catch(() => {});
    await client.query("ALTER TABLE discounts ADD COLUMN IF NOT EXISTS giamToiDa DECIMAL(15,2)").catch(() => {});
    await client.query("ALTER TABLE discounts ADD COLUMN IF NOT EXISTS conditions JSONB DEFAULT '{}'").catch(() => {});
    
    // Add maGiamGia to bookings to track usage
    await client.query("ALTER TABLE bookings ADD COLUMN IF NOT EXISTS maGiamGia VARCHAR(50)").catch(() => {});

    // Add is_hidden to discounts for secret/fanpage codes
    await client.query("ALTER TABLE discounts ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN DEFAULT FALSE").catch(() => {});

    // Add soLuongTon column for existing databases
    await client.query("ALTER TABLE services ADD COLUMN IF NOT EXISTS soLuongTon INTEGER DEFAULT 0").catch(() => {});
    // Allow reviews without booking reference (court-level reviews)
    await client.query("ALTER TABLE reviews ALTER COLUMN donDatId DROP NOT NULL").catch(() => {});
    await client.query("ALTER TABLE reviews ADD COLUMN IF NOT EXISTS sanId INTEGER REFERENCES courts(id)").catch(() => {});

    // Create default admin if not exists
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
