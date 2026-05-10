const express = require('express');
const cors = require('cors');
const path = require('path');
const cron = require('node-cron');
const { initDatabase } = require('./config/database');
const { startScheduler } = require('./services/scheduler');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');
const courtRoutes = require('./routes/court');
const bookingRoutes = require('./routes/booking');
const reviewRoutes = require('./routes/review');
const adminRoutes = require('./routes/admin');
const uploadRoutes = require('./routes/upload');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Serve uploads
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
app.use(express.static(path.join(__dirname, '../../frontend/dist')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/courts', courtRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api', adminRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/upload', uploadRoutes);

// - services endpoint on /api/services (from admin routes they're at /api/services)

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Lỗi server' });
});

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

startServer();
