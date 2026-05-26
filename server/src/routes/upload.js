/**
 * Route upload file - Upload ảnh đại diện, ảnh sân, và các file khác.
 *
 * File này cung cấp API upload file sử dụng thư viện multer:
 *
 * 1. POST / - Upload 1 file đơn lẻ:
 *    - Body: folder (thư mục đích, mặc định 'general'), file (file upload)
 *    - File được lưu vào public/uploads/{folder}/ với tên unique (timestamp + random)
 *    - Trả về URL để truy cập file đã upload
 *
 * 2. POST /court-images - Upload nhiều ảnh cho sân (Admin):
 *    - Body: sanId (ID sân), files (tối đa 10 ảnh)
 *    - Ảnh được lưu vào public/uploads/courts/
 *    - Ảnh đầu tiên tự động được đặt làm ảnh chính (isMain = TRUE)
 *    - Lưu thông tin ảnh vào bảng court_images
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const { authenticate, requireAdmin } = require('../middleware/auth');
const router = express.Router();

/**
 * Cấu hình nơi lưu trữ file (diskStorage).
 *
 * - destination: thư mục đích được xác định bởi req.body.folder, mặc định là 'general'
 *   Thư mục được tự động tạo nếu chưa tồn tại (recursive: true)
 * - filename: tên file được tạo từ timestamp + chuỗi random 8 ký tự + extension gốc
 *   Điều này đảm bảo tên file là duy nhất, tránh ghi đè
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = req.body.folder || 'general';
    const dir = path.join(__dirname, '../../public/uploads', folder);
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    // Tạo tên file duy nhất: timestamp + 8 ký tự random + extension
    cb(null, `${Date.now()}-${Math.random().toString(36).substring(2, 10)}${ext}`);
  },
});

/**
 * Cấu hình multer với các giới hạn và bộ lọc.
 *
 * - storage: dùng diskStorage đã cấu hình ở trên
 * - limits.fileSize: giới hạn 10MB mỗi file
 * - fileFilter: chỉ chấp nhận file ảnh (.jpg, .jpeg, .png, .gif, .webp)
 *   Kiểm tra bằng cách so sánh extension (đã lowercase) với danh sách cho phép
 */
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

/**
 * POST /upload - Upload 1 file đơn lẻ.
 *
 * Body (multipart/form-data):
 * - folder (tùy chọn): tên thư mục con trong public/uploads/ (mặc định 'general')
 * - file: file cần upload (trường name="file")
 *
 * Trả về: { data: { url, filename } }
 * - url: đường dẫn tương đối để truy cập file (vd: /uploads/avatars/1234567890-abc.jpg)
 * - filename: tên file đã lưu trên server
 *
 * Yêu cầu: authenticate
 */
router.post('/', authenticate, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Không có file' });
    const url = `/uploads/${req.body.folder || 'general'}/${req.file.filename}`;
    res.json({ data: { url, filename: req.file.filename } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /upload/court-images - Upload nhiều ảnh cho một sân (Admin only).
 *
 * Body (multipart/form-data):
 * - sanId (bắt buộc): ID của sân cần upload ảnh
 * - files (bắt buộc): mảng các file ảnh (trường name="files"), tối đa 10 file
 *
 * Logic:
 * - Kiểm tra sanId và files không được trống
 * - Với mỗi file: tạo URL và lưu vào bảng court_images
 * - Ảnh đầu tiên (images.length === 0) được đặt làm ảnh chính (isMain = TRUE)
 * - Các ảnh sau có isMain = FALSE
 *
 * Trả về: 201 { data: [...court_images] }
 * Yêu cầu: authenticate (nên có quyền admin, hiện tại chưa kiểm tra requireAdmin)
 */
router.post('/court-images', authenticate, requireAdmin, upload.array('files', 10), async (req, res) => {
  try {
    const { pool } = require('../config/database');
    const { sanId } = req.body;
    if (!sanId || !req.files?.length) {
      return res.status(400).json({ error: 'Thiếu thông tin sân hoặc file' });
    }
    const images = [];
    for (const file of req.files) {
      const url = `/uploads/courts/${file.filename}`;
      // Ảnh đầu tiên tự động làm ảnh chính
      const result = await pool.query(
        'INSERT INTO court_images (sanId, duongDanAnh, isMain) VALUES ($1, $2, $3) RETURNING *',
        [sanId, url, images.length === 0]
      );
      images.push(result.rows[0]);
    }
    res.status(201).json({ data: images });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
