const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase } = require('./config/database');
const { startVipAutoBookingScheduler } = require('./services/vipAutoBooking');
const { startAutoCheckoutScheduler } = require('./services/autoCheckout');

// Routes
const authRoutes    = require('./routes/auth');
const userRoutes    = require('./routes/user');
const courtRoutes   = require('./routes/court');
const bookingRoutes = require('./routes/booking');
const reviewRoutes  = require('./routes/review');
const adminRoutes   = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
app.use(express.static(path.join(__dirname, '../../client')));

// API Routes
app.use('/api/auth',     authRoutes);
app.use('/api/users',    userRoutes);
app.use('/api/courts',   courtRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews',  reviewRoutes);
app.use('/api/admin',    adminRoutes);

// SPA fallback — serve client index.html for any non-API route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../../client/index.html'));
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Lỗi server' });
});

// Initialize database and start server
async function startServer() {
    try {
        await initDatabase();
        app.listen(PORT, () => {
            console.log(`Server chạy tại http://localhost:${PORT}`);
            startVipAutoBookingScheduler();
            startAutoCheckoutScheduler();
        });
    } catch (error) {
        console.error('Không thể khởi động server:', error);
        process.exit(1);
    }
}

startServer();
