const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const { getScheduleBoard } = require('../controllers/adminScheduleController');

// Toàn bộ API Admin yêu cầu đăng nhập + quyền admin
router.use(authenticateToken);
router.use(requireAdmin);

/**
 * @route GET /api/admin/schedule-board
 * @desc Lấy danh sách đặt sân phục vụ giao diện Thời khóa biểu
 */
router.get('/schedule-board', getScheduleBoard);

function formatVnd(amount) {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(Number(amount) || 0);
}

async function createNotification(client, { userId, bookingId, title, message, type = 'booking', metadata = {} }) {
    if (!userId) return;

    await client.query(`
        INSERT INTO notifications
            (user_id, booking_id, title, message, notification_type, metadata)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `, [userId, bookingId || null, title, message, type, JSON.stringify(metadata)]);
}

// ════════════════════════════════════════════════
// THỐNG KÊ TỔNG QUAN (DASHBOARD)
// ════════════════════════════════════════════════
router.get('/stats', async (req, res) => {
    try {
        const [courts, users, bookings, revenue] = await Promise.all([
            pool.query("SELECT COUNT(*) as total FROM courts WHERE is_active = true"),
            pool.query("SELECT COUNT(*) as total FROM users WHERE role_id = (SELECT id FROM roles WHERE name='user')"),
            pool.query(`
                SELECT
                  COUNT(*) AS total,
                  SUM(CASE WHEN LOWER(bs.status_name) = 'pending'   THEN 1 ELSE 0 END) AS pending,
                  SUM(CASE WHEN LOWER(bs.status_name) = 'confirmed' THEN 1 ELSE 0 END) AS confirmed,
                  SUM(CASE WHEN LOWER(bs.status_name) = 'completed' THEN 1 ELSE 0 END) AS completed,
                  SUM(CASE WHEN LOWER(bs.status_name) = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
                FROM bookings b
                LEFT JOIN booking_statuses bs ON b.status_id = bs.id
            `),
            pool.query(`
                SELECT COALESCE(SUM(b.total_price), 0) AS total
                FROM bookings b
                JOIN booking_statuses bs ON b.status_id = bs.id
                WHERE LOWER(bs.status_name) IN ('confirmed','completed')
            `)
        ]);

        res.json({
            total_courts:   parseInt(courts.rows[0].total),
            total_users:    parseInt(users.rows[0].total),
            total_bookings: parseInt(bookings.rows[0].total),
            pending:        parseInt(bookings.rows[0].pending)    || 0,
            confirmed:      parseInt(bookings.rows[0].confirmed)  || 0,
            completed:      parseInt(bookings.rows[0].completed)  || 0,
            cancelled:      parseInt(bookings.rows[0].cancelled)  || 0,
            total_revenue:  parseFloat(revenue.rows[0].total)     || 0
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// ════════════════════════════════════════════════
// QUẢN LÝ ĐẶT SÂN
// ════════════════════════════════════════════════

// GET /api/admin/bookings — Lấy danh sách (có lọc)
router.get('/bookings', async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;
        const offset = (page - 1) * limit;

        let sql = `
            SELECT
                b.id, b.booking_date, b.total_price, b.deposit_amount,
                b.amount_paid, b.payment_type, b.notes, b.is_auto_booking, b.created_at,
                c.name          AS court_name,
                c.address       AS court_address,
                s.name          AS slot_name,
                s.start_time,
                s.end_time,
                LOWER(bs.status_name) AS status,
                pm.display_name AS payment_method,
                u.full_name     AS user_name,
                u.email         AS user_email,
                u.phone         AS user_phone,
                u.is_vip,
                u.cancel_count,
                COALESCE(eq.equipment_total, 0) AS equipment_total,
                COALESCE(eq.equipment_summary, '') AS equipment_summary
            FROM bookings b
            LEFT JOIN courts c             ON b.court_id          = c.id
            LEFT JOIN slots s              ON b.slot_id           = s.id
            LEFT JOIN booking_statuses bs  ON b.status_id         = bs.id
            LEFT JOIN payment_methods pm   ON b.payment_method_id = pm.id
            LEFT JOIN users u              ON b.user_id           = u.id
            LEFT JOIN LATERAL (
                SELECT
                    COALESCE(SUM(be.subtotal), 0) AS equipment_total,
                    STRING_AGG(e.name || ' x' || be.quantity, ', ' ORDER BY e.name) AS equipment_summary
                FROM booking_equipment be
                JOIN equipment e ON be.equipment_id = e.id
                WHERE be.booking_id = b.id
            ) eq ON true
        `;
        const params = [];
        if (status) {
            sql += ' WHERE LOWER(bs.status_name) = LOWER($1)';
            params.push(status);
        }
        sql += ` ORDER BY b.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        const result = await pool.query(sql, params);

        // Tổng số để phân trang
        let countSql = 'SELECT COUNT(*) FROM bookings b LEFT JOIN booking_statuses bs ON b.status_id = bs.id';
        const countParams = [];
        if (status) {
            countSql += ' WHERE LOWER(bs.status_name) = LOWER($1)';
            countParams.push(status);
        }
        const countRes = await pool.query(countSql, countParams);

        res.json({
            data: result.rows,
            total: parseInt(countRes.rows[0].count),
            page: parseInt(page),
            limit: parseInt(limit)
        });
    } catch (error) {
        console.error('Admin bookings error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// PUT /api/admin/bookings/:id — Xác nhận / Hủy / Check-in / Hoàn thành
router.put('/bookings/:id', async (req, res) => {
    const { action, reason } = req.body;

    const statusMap = {
        confirm:   'Confirmed',
        cancel:    'Cancelled',
        no_show:   'Cancelled',     // Vắng mặt: tịch thu cọc + tăng cancel_count
        checkin:   'In_Progress',   // Check-in: khách đang chơi
        complete:  'Completed'
    };

    if (!statusMap[action]) {
        return res.status(400).json({ error: 'Hành động không hợp lệ (confirm | cancel | no_show | checkin | complete)' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Lấy booking hiện tại
        const currentBooking = await client.query(`
            SELECT
                b.*,
                b.booking_date::text AS booking_date_text,
                LOWER(bs.status_name) AS current_status,
                c.name AS court_name,
                s.start_time,
                s.end_time
            FROM bookings b
            JOIN booking_statuses bs ON b.status_id = bs.id
            LEFT JOIN courts c ON b.court_id = c.id
            LEFT JOIN slots s ON b.slot_id = s.id
            WHERE b.id = $1
            FOR UPDATE OF b
        `, [req.params.id]);

        if (currentBooking.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Không tìm thấy đơn đặt sân' });
        }

        const booking = currentBooking.rows[0];

        // Kiểm tra transition hợp lệ
        const validTransitions = {
            pending:     ['confirm', 'cancel'],
            confirmed:   ['checkin', 'cancel', 'no_show'],
            in_progress: ['complete']
        };

        if (!validTransitions[booking.current_status]?.includes(action)) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Không thể "${action}" khi đơn đang ở trạng thái "${booking.current_status}"`
            });
        }

        // Lấy status_id mới
        const targetName = statusMap[action];
        const statusRes = await client.query(
            "SELECT id FROM booking_statuses WHERE LOWER(status_name) = LOWER($1) LIMIT 1",
            [targetName]
        );

        if (statusRes.rows.length === 0) {
            // Trạng thái In_Progress chưa có → tạo nó
            const insertStatus = await client.query(
                "INSERT INTO booking_statuses (status_name) VALUES ($1) RETURNING id",
                [targetName]
            );
            var newStatusId = insertStatus.rows[0].id;
        } else {
            var newStatusId = statusRes.rows[0].id;
        }

        await client.query(
            'UPDATE bookings SET status_id = $1 WHERE id = $2',
            [newStatusId, req.params.id]
        );

        // Ghi log nếu cancel hoặc no_show
        if (action === 'cancel' || action === 'no_show') {
            const cancelReason = action === 'no_show'
                ? (reason || 'Khách vắng mặt — Admin hủy và tịch thu cọc')
                : (reason || 'Admin hủy');

            await client.query(`
                INSERT INTO booking_cancellations (booking_id, reason, cancelled_by)
                VALUES ($1, $2, $3)
            `, [req.params.id, cancelReason, req.user.id]);

            // Chỉ no_show mới tăng cancel_count (doc Table 12)
            // Admin cancel thông thường KHÔNG tăng cancel_count
            if (action === 'no_show' && booking.user_id) {
                await client.query(
                    'UPDATE users SET cancel_count = cancel_count + 1 WHERE id = $1',
                    [booking.user_id]
                );
            }
        }

        // Ghi nhận thanh toán vào bảng payments khi check-in (thu 90% còn lại)
        if (action === 'checkin' && booking.payment_type === 'deposit') {
            const remainingAmount = Math.round(Number(booking.total_price) - Number(booking.amount_paid));
            if (remainingAmount > 0) {
                await client.query(`
                    INSERT INTO payments (booking_id, amount, payment_type, payment_method_id, status)
                    VALUES ($1, $2, 'remaining', $3, 'completed')
                `, [req.params.id, remainingAmount, booking.payment_method_id]);

                // Cập nhật amount_paid
                await client.query(
                    'UPDATE bookings SET amount_paid = total_price WHERE id = $1',
                    [req.params.id]
                );
            }
        }

        const bookingLabel = `đơn #${booking.id}`;
        const scheduleLabel = `${booking.court_name || 'sân đã đặt'} ngày ${booking.booking_date_text || booking.booking_date} khung ${booking.start_time || '--'} - ${booking.end_time || '--'}`;
        const notificationConfig = {
            confirm: {
                title: 'Đơn đặt sân đã được xác nhận',
                message: `Admin đã xác nhận ${bookingLabel} tại ${scheduleLabel}. Vui lòng đến sân đúng giờ để check-in.`,
                type: 'booking_confirmed'
            },
            checkin: {
                title: 'Đã check-in sân',
                message: `${bookingLabel} tại ${scheduleLabel} đã được chuyển sang trạng thái đang chơi.`,
                type: 'booking_checkin'
            },
            complete: {
                title: 'Đơn đặt sân đã hoàn thành',
                message: `${bookingLabel} tại ${scheduleLabel} đã hoàn thành. Bạn có thể đánh giá sân trong mục lịch sử đặt.`,
                type: 'booking_completed'
            },
            cancel: {
                title: 'Đơn đặt sân đã bị hủy',
                message: `${bookingLabel} tại ${scheduleLabel} đã bị hủy${reason ? `: ${reason}.` : '.'} ${
                    Number(booking.amount_paid) > 0
                        ? `Số tiền đã thanh toán ${formatVnd(booking.amount_paid)} được ghi nhận hoàn tiền theo chính sách.`
                        : 'Khung giờ đã được giải phóng.'
                }`,
                type: 'booking_cancelled'
            },
            no_show: {
                title: 'Đơn đặt sân bị hủy — Vắng mặt',
                message: `${bookingLabel} tại ${scheduleLabel} đã bị hủy do khách không đến. Tiền cọc bị tịch thu theo chính sách. Lần hủy của bạn đã được ghi nhận.`,
                type: 'booking_cancelled'
            }
        };

        await createNotification(client, {
            userId: booking.user_id,
            bookingId: booking.id,
            ...notificationConfig[action],
            metadata: {
                action,
                status: targetName,
                refund_amount: action === 'cancel' ? Number(booking.amount_paid) || 0 : 0
            }
        });

        await client.query('COMMIT');
        res.json({ message: `Đã cập nhật trạng thái thành công (${targetName})` });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Admin update booking error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    } finally {
        client.release();
    }
});

// ════════════════════════════════════════════════
// BÁO CÁO DOANH THU
// ════════════════════════════════════════════════
router.get('/revenue', async (req, res) => {
    try {
        const [totalRes, byCourtRes, byMonthRes, statsRes] = await Promise.all([
            pool.query(`
                SELECT COALESCE(SUM(b.total_price), 0) AS total
                FROM bookings b
                JOIN booking_statuses bs ON b.status_id = bs.id
                WHERE LOWER(bs.status_name) IN ('confirmed', 'completed')
            `),
            pool.query(`
                SELECT c.name AS court_name,
                       COUNT(b.id) AS booking_count,
                       COALESCE(SUM(b.total_price), 0) AS revenue
                FROM courts c
                LEFT JOIN bookings b ON c.id = b.court_id
                LEFT JOIN booking_statuses bs ON b.status_id = bs.id
                    AND LOWER(bs.status_name) IN ('confirmed', 'completed')
                GROUP BY c.id, c.name
                ORDER BY revenue DESC
            `),
            pool.query(`
                SELECT TO_CHAR(b.booking_date, 'YYYY-MM') AS month,
                       COALESCE(SUM(b.total_price), 0) AS revenue,
                       COUNT(b.id) AS booking_count
                FROM bookings b
                JOIN booking_statuses bs ON b.status_id = bs.id
                WHERE LOWER(bs.status_name) IN ('confirmed', 'completed')
                GROUP BY TO_CHAR(b.booking_date, 'YYYY-MM')
                ORDER BY month DESC
                LIMIT 12
            `),
            pool.query(`
                SELECT
                    COUNT(*) AS total,
                    SUM(CASE WHEN LOWER(bs.status_name) = 'pending'      THEN 1 ELSE 0 END) AS pending,
                    SUM(CASE WHEN LOWER(bs.status_name) = 'confirmed'    THEN 1 ELSE 0 END) AS confirmed,
                    SUM(CASE WHEN LOWER(bs.status_name) = 'in_progress'  THEN 1 ELSE 0 END) AS in_progress,
                    SUM(CASE WHEN LOWER(bs.status_name) = 'completed'    THEN 1 ELSE 0 END) AS completed,
                    SUM(CASE WHEN LOWER(bs.status_name) = 'cancelled'    THEN 1 ELSE 0 END) AS cancelled
                FROM bookings b
                LEFT JOIN booking_statuses bs ON b.status_id = bs.id
            `)
        ]);

        res.json({
            totalRevenue:   parseFloat(totalRes.rows[0].total) || 0,
            revenueByCourt: byCourtRes.rows,
            revenueByMonth: byMonthRes.rows,
            bookingStats: {
                total:       parseInt(statsRes.rows[0].total)       || 0,
                pending:     parseInt(statsRes.rows[0].pending)     || 0,
                confirmed:   parseInt(statsRes.rows[0].confirmed)   || 0,
                in_progress: parseInt(statsRes.rows[0].in_progress) || 0,
                completed:   parseInt(statsRes.rows[0].completed)   || 0,
                cancelled:   parseInt(statsRes.rows[0].cancelled)   || 0
            }
        });
    } catch (error) {
        console.error('Revenue error:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// ════════════════════════════════════════════════
// QUẢN LÝ SÂN BÃI
// ════════════════════════════════════════════════

router.get('/courts', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.*, d.name AS district_name,
                   COALESCE(AVG(r.rating), 0) AS avg_rating,
                   COUNT(DISTINCT r.id) AS review_count
            FROM courts c
            LEFT JOIN districts d ON c.district_id = d.id
            LEFT JOIN reviews r ON c.id = r.court_id
            GROUP BY c.id, d.name
            ORDER BY c.id
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

router.post('/courts', async (req, res) => {
    try {
        const { name, address, district_id, price_per_hour, description, image_url } = req.body;
        if (!name || !address || !price_per_hour) {
            return res.status(400).json({ error: 'Thiếu thông tin bắt buộc' });
        }
        const result = await pool.query(
            "INSERT INTO courts (name, address, district_id, price_per_hour, description, image_url) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *",
            [name, address, district_id || null, price_per_hour, description || null, image_url || null]
        );
        res.status(201).json({ message: 'Thêm sân thành công', court: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

router.put('/courts/:id', async (req, res) => {
    try {
        const { name, address, district_id, price_per_hour, description, image_url, is_active } = req.body;
        await pool.query(`
            UPDATE courts
            SET name=$1, address=$2, district_id=$3, price_per_hour=$4,
                description=$5, image_url=$6, is_active=COALESCE($7, is_active)
            WHERE id=$8
        `, [name, address, district_id || null, price_per_hour, description || null, image_url || null, is_active, req.params.id]);
        res.json({ message: 'Cập nhật sân thành công' });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

router.delete('/courts/:id', async (req, res) => {
    try {
        // Soft delete: đặt is_active = false thay vì xóa hẳn
        await pool.query('UPDATE courts SET is_active = false WHERE id = $1', [req.params.id]);
        res.json({ message: 'Đã ẩn sân thành công' });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// ════════════════════════════════════════════════
// QUẢN LÝ KHUNG GIỜ (SLOTS)
// ════════════════════════════════════════════════

router.get('/slots', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM slots ORDER BY start_time');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

router.post('/slots', async (req, res) => {
    try {
        const { name, start_time, end_time, duration_hours, price_modifier } = req.body;
        if (!name || !start_time || !end_time) {
            return res.status(400).json({ error: 'Thiếu thông tin khung giờ' });
        }
        const result = await pool.query(
            "INSERT INTO slots (name, start_time, end_time, duration_hours, price_modifier) VALUES ($1,$2,$3,$4,$5) RETURNING *",
            [name, start_time, end_time, duration_hours || 1.5, price_modifier || 1.0]
        );
        res.status(201).json({ message: 'Thêm khung giờ thành công', slot: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

router.put('/slots/:id', async (req, res) => {
    try {
        const { name, start_time, end_time, duration_hours, price_modifier } = req.body;
        await pool.query(
            "UPDATE slots SET name=$1, start_time=$2, end_time=$3, duration_hours=$4, price_modifier=$5 WHERE id=$6",
            [name, start_time, end_time, duration_hours, price_modifier, req.params.id]
        );
        res.json({ message: 'Cập nhật khung giờ thành công' });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

router.delete('/slots/:id', async (req, res) => {
    try {
        await pool.query('DELETE FROM slots WHERE id = $1', [req.params.id]);
        res.json({ message: 'Xóa khung giờ thành công' });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server khi xóa khung giờ' });
    }
});

// ════════════════════════════════════════════════
// QUẢN LÝ KHÁCH HÀNG
// ════════════════════════════════════════════════

router.get('/customers', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                u.id, u.email, u.phone, u.full_name,
                u.is_locked, u.is_vip, u.cancel_count, u.created_at,
                COUNT(DISTINCT b.id) AS total_bookings
            FROM users u
            LEFT JOIN bookings b ON u.id = b.user_id
            WHERE u.role_id = (SELECT id FROM roles WHERE name = 'user')
            GROUP BY u.id
            ORDER BY u.created_at DESC
        `);
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Khóa / Mở khóa tài khoản
router.put('/customers/:id/lock', async (req, res) => {
    try {
        const { lock } = req.body; // true = khóa, false = mở
        await pool.query('UPDATE users SET is_locked = $1 WHERE id = $2', [lock, req.params.id]);

        // Xóa session để buộc đăng xuất ngay
        if (lock) {
            await pool.query('DELETE FROM sessions WHERE user_id = $1', [req.params.id]);
        }

        res.json({ message: lock ? 'Đã khóa tài khoản' : 'Đã mở khóa tài khoản' });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Nâng cấp / Hạ VIP
router.put('/customers/:id/vip', async (req, res) => {
    try {
        const { is_vip } = req.body;
        await pool.query('UPDATE users SET is_vip = $1 WHERE id = $2', [is_vip, req.params.id]);
        res.json({ message: is_vip ? 'Đã nâng cấp VIP' : 'Đã hạ cấp khỏi VIP' });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// Reset cancel_count (admin có thể tha cho user)
router.put('/customers/:id/reset-cancels', async (req, res) => {
    try {
        await pool.query('UPDATE users SET cancel_count = 0 WHERE id = $1', [req.params.id]);
        res.json({ message: 'Đã reset số lần hủy về 0' });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// ════════════════════════════════════════════════
// QUẢN LÝ THIẾT BỊ
// ════════════════════════════════════════════════

router.get('/equipment', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM equipment ORDER BY id');
        res.json(result.rows);
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

router.post('/equipment', async (req, res) => {
    try {
        const { name, description, price_per_booking, available_quantity, is_active = true } = req.body;
        if (!name || price_per_booking === undefined || price_per_booking === null) {
            return res.status(400).json({ error: 'Thiếu tên hoặc giá thiết bị' });
        }
        const result = await pool.query(
            "INSERT INTO equipment (name, description, price_per_booking, available_quantity, is_active) VALUES ($1,$2,$3,$4,$5) RETURNING *",
            [name, description || null, price_per_booking, available_quantity ?? 10, is_active]
        );
        res.status(201).json({ message: 'Thêm thiết bị thành công', equipment: result.rows[0] });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

router.put('/equipment/:id', async (req, res) => {
    try {
        const { name, description, price_per_booking, available_quantity, is_active } = req.body;
        await pool.query(`
            UPDATE equipment
            SET name=$1, description=$2, price_per_booking=$3,
                available_quantity=$4, is_active=COALESCE($5, is_active)
            WHERE id=$6
        `, [name, description, price_per_booking, available_quantity, is_active, req.params.id]);
        res.json({ message: 'Cập nhật thiết bị thành công' });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

router.delete('/equipment/:id', async (req, res) => {
    try {
        await pool.query('UPDATE equipment SET is_active = false WHERE id = $1', [req.params.id]);
        res.json({ message: 'Đã ngừng phục vụ dịch vụ này' });
    } catch (error) {
        res.status(500).json({ error: 'Lỗi server' });
    }
});

module.exports = router;
