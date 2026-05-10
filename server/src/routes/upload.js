const express = require('express');
const multer = require('multer');
const path = require('path');
const { authenticate } = require('../middleware/auth');
const router = express.Router();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = req.body.folder || 'general';
    const dir = path.join(__dirname, '../../public/uploads', folder);
    require('fs').mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.random().toString(36).substring(2, 10)}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

router.post('/', authenticate, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Không có file' });
    const url = `/uploads/${req.body.folder || 'general'}/${req.file.filename}`;
    res.json({ data: { url, filename: req.file.filename } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Upload multiple images for a court (admin only)
router.post('/court-images', authenticate, upload.array('files', 10), async (req, res) => {
  try {
    const { pool } = require('../config/database');
    const { sanId } = req.body;
    if (!sanId || !req.files?.length) {
      return res.status(400).json({ error: 'Thiếu thông tin sân hoặc file' });
    }
    const images = [];
    for (const file of req.files) {
      const url = `/uploads/courts/${file.filename}`;
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
