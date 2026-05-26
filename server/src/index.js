/**
 * Điểm vào chính của server Pickleball - khởi tạo Express app và cấu hình các middleware.
 *
 * File này thực hiện:
 * 1. Tạo Express application và cấu hình các middleware cơ bản:
 *    - cors(): cho phép cross-origin requests từ frontend (chạy trên domain/port khác)
 *    - express.json(): tự động parse JSON body từ request thành object JavaScript
 *    - express.static(): phục vụ file tĩnh (uploads, frontend build)
 *
 * 2. Đăng ký tất cả các route cho API:
 *    - /api/auth: đăng nhập, đăng ký, quên mật khẩu, xem/sửa profile
 *    - /api/users: quản lý người dùng (admin)
 *    - /api/courts: quản lý sân, khung giờ
 *    - /api/bookings: đặt sân, xem lịch sử, check-in/out, hủy
 *    - /api/reviews: đánh giá sân
 *    - /api/admin: dashboard, báo cáo, quản lý dịch vụ, mã giảm giá, thông báo
 *    - /api/upload: upload file (ảnh sân, avatar)
 *
 * 3. SPA fallback: mọi request không khớp API đều trả về index.html (cho React Router)
 *
 * 4. Global error handler: ghi log lỗi vào file debug.log và trả về HTTP 500
 *
 * 5. Hàm startServer(): khởi tạo database, bật scheduler, và lắng nghe trên PORT
 *    - PORT mặc định là 3000, có thể ghi đè qua biến môi trường PORT
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { initDatabase } = require('./config/database');
const { startScheduler } = require('./services/scheduler');

// Import tất cả router - mỗi file router xử lý một nhóm API riêng biệt
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const courtRoutes = require('./routes/court');
const bookingRoutes = require('./routes/booking');
const reviewRoutes = require('./routes/review');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware CORS: cho phép frontend gọi API từ domain/port khác
app.use(cors());
// Middleware parse JSON: tự động chuyển body request thành object
app.use(express.json());

// Phục vụ file uploads (ảnh sân, avatar, v.v.) từ thư mục public/uploads
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
// Phục vụ frontend build (React SPA) từ thư mục frontend/dist
app.use(express.static(path.join(__dirname, '../../frontend/dist')));

// Đăng ký các route API - mỗi nhóm route có tiền tố /api/...
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/courts', courtRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api', adminRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);

// SPA fallback: mọi request không phải API đều trả về index.html
// Cho phép React Router xử lý routing phía client
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

// Global error handler: bắt tất cả lỗi không được xử lý trong các route
// Ghi log lỗi vào file debug.log (async) và trả về response 500 cho client
app.use((err, req, res, next) => {
  const fs = require('fs');
  const logMsg = `${new Date().toISOString()} - ${req.method} ${req.url} - ${err.stack}\n`;
  fs.promises.appendFile(path.join(__dirname, '../debug.log'), logMsg).catch(() => {});
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Lỗi server' });
});

/**
 * Khởi động server: khởi tạo database, bật scheduler, lắng nghe kết nối.
 * Thứ tự khởi động:
 * 1. initDatabase() - tạo bảng và dữ liệu mặc định nếu chưa có
 * 2. startScheduler(cron) - bật các cron job (tự động check-in/out, VIP booking...)
 * 3. app.listen() - bắt đầu lắng nghe HTTP request trên PORT
 * Nếu có lỗi khi khởi tạo database thì thoát process với mã lỗi 1
 */
async function startServer() {
  try {
    await initDatabase();
    startScheduler(cron);
    app.listen(PORT, () => {
      console.log(`PickleBall server running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Cannot start server:', error);
    process.exit(1);
  }
}

startServer(); // trigger watch reload
