const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { authenticateToken } = require('../middleware/auth');
const {
    normalizeDateString,
    getMondayIndex,
    getNextAutoScheduleFromTargetDate,
    isSlotInFuture
} = require('../services/bookingTime');
const { cancelConflictingAutoBookings } = require('../services/vipAutoBooking');

// Tất cả route booking đều yêu cầu đăng nhập
router.use(authenticateToken);

async function createNotification(client, { userId, bookingId, title, message, type = 'booking', metadata = {} }) {
    await client.query(`
        INSERT INTO notifications
            (user_id, booking_id, title, message, notification_type, metadata)
        VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `, [userId, bookingId || null, title, message, type, JSON.stringify(metadata)]);
}

async function upsertVipAutoBookingSchedule(client, { userId, courtId, slotId, bookingDate, courtName, slot }) {
    const targetWeekday = getMondayIndex(bookingDate);
    const nextSchedule = getNextAutoScheduleFromTargetDate(bookingDate);

    await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [`booking:${courtId}:${slotId}:${nextSchedule.targetDate}`]
    );

    await client.query(
        'SELECT pg_advisory_xact_lock(hashtext($1))',
        [`vip-auto:${courtId}:${slotId}:${userId}:${targetWeekday}`]
    );

    const targetConflict = await client.query(`
        SELECT b.id
        FROM bookings b
        WHERE b.court_id = $1
          AND b.slot_id = $2
          AND b.booking_date = $3::date
          AND b.status_id NOT IN (
            SELECT id FROM booking_statuses WHERE LOWER(status_name) = 'cancelled'
          )
        LIMIT 1
    `, [courtId, slotId, nextSchedule.targetDate]);

    if (targetConflict.rows.length > 0) {
        await createNotification(client, {
            userId,
            bookingId: null,
            title: 'Chưa thể bật đặt sân tự động',
            message: `Khung ${slot.start_time} - ${slot.end_time} ngày ${nextSchedule.targetDate} tại ${courtName} đã có người đặt. Đơn hiện tại vẫn được ghi nhận.`,
            type: 'vip_auto_conflict',
            metadata: {
                target_booking_date: nextSchedule.targetDate,
                conflicting_booking_id: targetConflict.rows[0].id
            }
        });

        return {
            enabled: false,
            reason: `Khung tự động tuần sau (${nextSchedule.targetDate}) đã có người đặt.`
        };
    }

    const autoConflict = await client.query(`
        SELECT a.id
        FROM vip_auto_bookings a
        WHERE a.court_id = $1
          AND a.slot_id = $2
          AND a.target_booking_date = $3::date
          AND a.status = 'active'
          AND a.user_id <> $4
        LIMIT 1
        FOR UPDATE OF a
    `, [courtId, slotId, nextSchedule.targetDate, userId]);

    if (autoConflict.rows.length > 0) {
        await createNotification(client, {
            userId,
            bookingId: null,
            title: 'Chưa thể bật đặt sân tự động',
            message: `Khung ${slot.start_time} - ${slot.end_time} ngày ${nextSchedule.targetDate} tại ${courtName} đã được khách VIP khác giữ lịch tự động.`,
            type: 'vip_auto_conflict',
            metadata: {
                target_booking_date: nextSchedule.targetDate,
                conflicting_auto_booking_id: autoConflict.rows[0].id
            }
        });

        return {
            enabled: false,
            reason: `Khung tự động tuần sau (${nextSchedule.targetDate}) đã được khách VIP khác giữ.`
        };
    }

    const existing = await client.query(`
        SELECT id
        FROM vip_auto_bookings
        WHERE user_id = $1
          AND court_id = $2
          AND slot_id = $3
          AND target_weekday = $4
          AND status = 'active'
        FOR UPDATE
    `, [userId, courtId, slotId, targetWeekday]);

    let autoBookingId;
    if (existing.rows.length > 0) {
        autoBookingId = existing.rows[0].id;
        await client.query(`
            UPDATE vip_auto_bookings
            SET target_booking_date = $1::date,
                next_run_at = $2::timestamp,
                cancellation_reason = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $3
        `, [nextSchedule.targetDate, nextSchedule.runAt, autoBookingId]);
    } else {
        const inserted = await client.query(`
            INSERT INTO vip_auto_bookings
              (user_id, court_id, slot_id, target_weekday, target_booking_date, next_run_at, status)
            VALUES ($1, $2, $3, $4, $5::date, $6::timestamp, 'active')
            RETURNING id
        `, [userId, courtId, slotId, targetWeekday, nextSchedule.targetDate, nextSchedule.runAt]);
        autoBookingId = inserted.rows[0].id;
    }

    await createNotification(client, {
        userId,
        bookingId: null,
        title: 'Đã bật đặt sân tự động VIP',
        message: `Từ tuần sau, hệ thống sẽ tự đặt ${courtName} khung ${slot.start_time} - ${slot.end_time} vào 00:00 đầu tuần nếu khung giờ chưa bị đặt trước.`,
        type: 'vip_auto_enabled',
        metadata: {
            auto_booking_id: autoBookingId,
            target_booking_date: nextSchedule.targetDate,
            next_run_at: nextSchedule.runAt
        }
    });

    return {
        enabled: true,
        id: autoBookingId,
        target_booking_date: nextSchedule.targetDate,
        next_run_at: nextSchedule.runAt
    };
}

// ────────────────────────────────────────────────
// 1. LẤY DANH SÁCH PHƯƠNG THỨC THANH TOÁN
// ────────────────────────────────────────────────
router.get('/payment-methods/list', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT id, method_name, display_name FROM payment_methods ORDER BY id'
        );
        res.json(result.rows);
    } catch (error) {
        res.json([]);
    }
});

// ────────────────────────────────────────────────
// 2. LẤY DANH SÁCH DỊCH VỤ / THIẾT BỊ ĐI KÈM
// ────────────────────────────────────────────────
router.get('/equipment/list', async (req, res) => {
    try {
        const { court_id } = req.query;
        let sql = 'SELECT id, name, description, price_per_booking, available_quantity, court_id FROM equipment WHERE is_active = true';
        const params = [];

        if (court_id) {
            sql += ' AND court_id = $1';
            params.push(court_id);
        }

        sql += ' ORDER BY id';
        const result = await pool.query(sql, params);
        res.json(result.rows);
    } catch (error) {
        console.error('Lỗi lấy danh sách thiết bị:', error);
        res.status(500).json({ error: 'Lỗi server khi lấy dịch vụ đi kèm' });
    }
});

// ────────────────────────────────────────────────
// 3. ĐẶT SÂN (CREATE BOOKING)
//    - Chống double-booking bằng advisory lock + kiểm tra trước khi INSERT
//    - Hỗ trợ payment_type: 'deposit' (10%) hoặc 'full' (100%)
//    - Hỗ trợ thiết bị / dịch vụ đi kèm và cộng vào tổng tiền đơn
//    - Nếu user đã huỷ >= 3 lần → bắt buộc thanh toán toàn phần
// ────────────────────────────────────────────────
router.post('/', async (req, res) => {
    const { court_id, slot_id, booking_date, payment_method_id, payment_type, notes, equipment_items, auto_weekly } = req.body;
    const user_id = req.user.id;
    const bookingDateStr = normalizeDateString(booking_date);

    if (!court_id || !slot_id || !bookingDateStr) {
        return res.status(400).json({ error: 'Thiếu thông tin đặt sân (court_id, slot_id, booking_date)' });
    }

    const requestedEquipment = [];
    if (Array.isArray(equipment_items)) {
        const quantitiesById = new Map();
        for (const item of equipment_items) {
            const equipmentId = parseInt(item.equipment_id, 10);
            const quantity = parseInt(item.quantity, 10);

            if (!Number.isInteger(equipmentId) || !Number.isInteger(quantity) || quantity < 0) {
                return res.status(400).json({ error: 'Danh sách thiết bị đi kèm không hợp lệ' });
            }

            if (quantity > 0) {
                quantitiesById.set(equipmentId, (quantitiesById.get(equipmentId) || 0) + quantity);
            }
        }

        for (const [equipment_id, quantity] of quantitiesById.entries()) {
            requestedEquipment.push({ equipment_id, quantity });
        }
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // ① Kiểm tra sân tồn tại và đang hoạt động
        const courtRes = await client.query(
            'SELECT id, name, price_per_hour FROM courts WHERE id = $1 AND is_active = true',
            [court_id]
        );
        if (courtRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Sân không tồn tại hoặc đã ngừng hoạt động' });
        }
        const court = courtRes.rows[0];

        // ② Lấy thông tin slot
        const slotRes = await client.query(
            'SELECT id, name, start_time, end_time, duration_hours, price_modifier FROM slots WHERE id = $1',
            [slot_id]
        );
        if (slotRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Khung giờ không tồn tại' });
        }
        const slot = slotRes.rows[0];

        if (!isSlotInFuture(bookingDateStr, slot.start_time)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Khung giờ này đã qua. Vui lòng chọn ngày hoặc khung giờ khác.' });
        }

        // ③ CHỐNG DOUBLE BOOKING:
        //    Khóa transaction theo court + slot + date trước khi kiểm tra.
        //    FOR UPDATE chỉ khóa row đã tồn tại; advisory lock xử lý cả case chưa có row.
        await client.query(
            'SELECT pg_advisory_xact_lock(hashtext($1))',
            [`booking:${court_id}:${slot_id}:${bookingDateStr}`]
        );

        // Kiểm tra xem slot này đã được đặt chưa
        const conflictCheck = await client.query(`
            SELECT b.id
            FROM bookings b
            WHERE b.court_id = $1
              AND b.slot_id = $2
              AND b.booking_date = $3
              AND b.status_id NOT IN (
                SELECT id FROM booking_statuses WHERE LOWER(status_name) = 'cancelled'
            )
            FOR UPDATE
        `, [court_id, slot_id, bookingDateStr]);

        if (conflictCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({ error: 'Khung giờ này đã được đặt. Vui lòng chọn khung giờ khác.' });
        }

        const autoReservationCheck = await client.query(`
            SELECT a.id
            FROM vip_auto_bookings a
            WHERE a.court_id = $1
              AND a.slot_id = $2
              AND a.target_booking_date = $3::date
              AND a.status = 'active'
            LIMIT 1
            FOR UPDATE OF a
        `, [court_id, slot_id, bookingDateStr]);

        if (autoReservationCheck.rows.length > 0) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                error: 'Khung giờ này đã được giữ bởi lịch đặt sân tự động của khách VIP. Vui lòng chọn khung giờ khác.'
            });
        }

        // ④ Tính giá sân: price_per_hour × duration_hours × price_modifier
        const durationHours = parseFloat(slot.duration_hours) || 1.5;
        const priceModifier = parseFloat(slot.price_modifier) || 1.0;
        const courtPrice = parseFloat(court.price_per_hour) * durationHours * priceModifier;

        // ⑤ Validate và tính tiền thiết bị / dịch vụ đi kèm
        const bookingEquipment = [];
        let equipmentTotal = 0;

        if (requestedEquipment.length > 0) {
            const equipmentIds = requestedEquipment.map(item => item.equipment_id);
            const equipmentRes = await client.query(`
                SELECT id, name, price_per_booking, available_quantity
                FROM equipment
                WHERE id = ANY($1::int[]) AND is_active = true
                FOR UPDATE
            `, [equipmentIds]);

            if (equipmentRes.rows.length !== equipmentIds.length) {
                await client.query('ROLLBACK');
                return res.status(400).json({ error: 'Có dịch vụ đi kèm không tồn tại hoặc đã ngừng phục vụ' });
            }

            const equipmentById = new Map(equipmentRes.rows.map(row => [row.id, row]));
            for (const item of requestedEquipment) {
                const equipment = equipmentById.get(item.equipment_id);
                if (item.quantity > equipment.available_quantity) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({
                        error: `"${equipment.name}" chỉ còn ${equipment.available_quantity} phần/thiết bị`
                    });
                }

                const subtotal = parseFloat(equipment.price_per_booking) * item.quantity;
                equipmentTotal += subtotal;
                bookingEquipment.push({
                    equipment_id: item.equipment_id,
                    quantity: item.quantity,
                    subtotal
                });
            }
        }

        const totalPrice = courtPrice + equipmentTotal;

        // ⑥ Kiểm tra số lần huỷ → ép buộc thanh toán toàn phần nếu >= 3 lần
        const userRes = await client.query(
            'SELECT cancel_count, is_vip FROM users WHERE id = $1',
            [user_id]
        );
        const userInfo = userRes.rows[0];
        const cancelCount = userInfo ? parseInt(userInfo.cancel_count) || 0 : 0;
        const shouldEnableAutoWeekly = Boolean(auto_weekly);

        if (shouldEnableAutoWeekly && !userInfo?.is_vip) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Chỉ khách VIP mới có thể bật đặt sân tự động hằng tuần' });
        }

        let effectivePaymentType = payment_type === 'deposit' ? 'deposit' : 'full';
        if (cancelCount >= 3 && effectivePaymentType === 'deposit') {
            // Đã huỷ >= 3 lần → bắt buộc toàn phần
            effectivePaymentType = 'full';
        }

        // ⑦ Tính số tiền thực trả
        const depositAmount = parseFloat((totalPrice * 0.1).toFixed(0));
        const amountPaid = effectivePaymentType === 'deposit' ? depositAmount : totalPrice;

        // ⑧ Lấy status_id của 'Pending'
        const pendingStatus = await client.query(
            "SELECT id FROM booking_statuses WHERE LOWER(status_name) = 'pending' LIMIT 1"
        );
        const statusId = pendingStatus.rows[0]?.id || 1;

        // ⑨ Tạo booking
        const newBooking = await client.query(`
            INSERT INTO bookings
              (user_id, court_id, slot_id, booking_date, status_id,
               payment_method_id, payment_type, total_price, deposit_amount, amount_paid, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *
        `, [
            user_id, court_id, slot_id, bookingDateStr, statusId,
            payment_method_id || null, effectivePaymentType,
            totalPrice, depositAmount, amountPaid,
            notes || null
        ]);

        await cancelConflictingAutoBookings(client, {
            courtId: court_id,
            slotId: slot_id,
            bookingDate: bookingDateStr,
            triggeringUserId: user_id,
            triggeringBookingId: newBooking.rows[0].id
        });

        // Ghi nhận thanh toán vào bảng payments (ThanhToan theo doc KLTN)
        await client.query(`
            INSERT INTO payments (booking_id, amount, payment_type, payment_method_id, status)
            VALUES ($1, $2, $3, $4, $5)
        `, [
            newBooking.rows[0].id,
            amountPaid,
            effectivePaymentType,
            payment_method_id || null,
            amountPaid > 0 ? 'completed' : 'pending'
        ]);

        for (const item of bookingEquipment) {
            await client.query(`
                INSERT INTO booking_equipment (booking_id, equipment_id, quantity, subtotal)
                VALUES ($1, $2, $3, $4)
            `, [newBooking.rows[0].id, item.equipment_id, item.quantity, item.subtotal]);

            // Cập nhật giảm số lượng thiết bị khả dụng
            await client.query(`
                UPDATE equipment
                SET available_quantity = available_quantity - $1
                WHERE id = $2
            `, [item.quantity, item.equipment_id]);
        }

        await createNotification(client, {
            userId: user_id,
            bookingId: newBooking.rows[0].id,
            title: 'Yêu cầu đặt sân đã được ghi nhận',
            message: `Đơn #${newBooking.rows[0].id} tại ${court.name} ngày ${bookingDateStr} khung ${slot.start_time} - ${slot.end_time} đang chờ admin xác nhận.`,
            type: 'booking_created',
            metadata: {
                status: 'Pending',
                total_price: totalPrice,
                amount_paid: amountPaid
            }
        });

        let autoWeekly = null;
        if (shouldEnableAutoWeekly) {
            autoWeekly = await upsertVipAutoBookingSchedule(client, {
                userId: user_id,
                courtId: court_id,
                slotId: slot_id,
                bookingDate: bookingDateStr,
                courtName: court.name,
                slot
            });
        }

        await client.query('COMMIT');

        let message = effectivePaymentType === 'deposit'
            ? `Đặt sân thành công! Đặt cọc 10%: ${depositAmount.toLocaleString('vi-VN')}đ`
            : 'Đặt sân thành công! Thanh toán toàn phần.';

        if (autoWeekly?.enabled) {
            message += ` Lịch tự động hằng tuần đã bật từ ngày ${autoWeekly.target_booking_date}.`;
        } else if (shouldEnableAutoWeekly && autoWeekly?.reason) {
            message += ` ${autoWeekly.reason} Lịch tự động chưa được bật.`;
        }

        res.status(201).json({
            message,
            booking: newBooking.rows[0],
            auto_weekly: autoWeekly,
            price_breakdown: {
                court_price: courtPrice,
                equipment_total: equipmentTotal,
                total_price: totalPrice
            },
            forced_full_payment: cancelCount >= 3 && payment_type === 'deposit'
        });

    } catch (error) {
        await client.query('ROLLBACK');
        // Unique violation = slot đã bị đặt (safety net từ idx_booking_no_double)
        if (error.code === '23505') {
            return res.status(409).json({ error: 'Khung giờ này đã được đặt. Vui lòng chọn khung giờ khác.' });
        }
        console.error('Lỗi đặt sân:', error);
        res.status(500).json({ error: 'Lỗi server khi đặt sân' });
    } finally {
        client.release();
    }
});

// ────────────────────────────────────────────────
// 4. BẬT LỊCH ĐẶT SÂN TỰ ĐỘNG CHO VIP
//    - Khách VIP chọn sân/ngày/khung giờ mẫu
//    - Hệ thống tự tạo đơn vào 00:00 thứ Hai của tuần kế tiếp
// ────────────────────────────────────────────────
router.post('/auto', async (req, res) => {
    const user_id = req.user.id;
    const { court_id, slot_id, booking_date } = req.body;
    const bookingDateStr = normalizeDateString(booking_date);
    const courtId = parseInt(court_id, 10);
    const slotId = parseInt(slot_id, 10);

    if (!req.user.is_vip) {
        return res.status(403).json({ error: 'Chỉ khách VIP mới có thể bật đặt sân tự động' });
    }

    if (!Number.isInteger(courtId) || !Number.isInteger(slotId) || !bookingDateStr) {
        return res.status(400).json({ error: 'Thiếu thông tin lịch tự động (court_id, slot_id, booking_date)' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const courtRes = await client.query(
            'SELECT id, name FROM courts WHERE id = $1 AND is_active = true',
            [courtId]
        );
        if (courtRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Sân không tồn tại hoặc đã ngừng hoạt động' });
        }
        const court = courtRes.rows[0];

        const slotRes = await client.query(
            'SELECT id, name, start_time, end_time FROM slots WHERE id = $1',
            [slotId]
        );
        if (slotRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Khung giờ không tồn tại' });
        }
        const slot = slotRes.rows[0];

        if (!isSlotInFuture(bookingDateStr, slot.start_time)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Không thể bật tự động từ một khung giờ đã qua' });
        }

        const autoBooking = await upsertVipAutoBookingSchedule(client, {
            userId: user_id,
            courtId,
            slotId,
            bookingDate: bookingDateStr,
            courtName: court.name,
            slot
        });

        if (!autoBooking.enabled) {
            await client.query('ROLLBACK');
            return res.status(409).json({
                error: `${autoBooking.reason} Vui lòng chọn lịch khác.`
            });
        }

        await client.query('COMMIT');

        res.status(201).json({
            message: `Đã bật đặt sân tự động. Hệ thống đã giữ lịch ngày ${autoBooking.target_booking_date} và sẽ tự tạo đơn lúc 00:00 đầu tuần.`,
            auto_booking: {
                id: autoBooking.id,
                court_id: courtId,
                slot_id: slotId,
                target_booking_date: autoBooking.target_booking_date,
                next_run_at: autoBooking.next_run_at
            }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Lỗi bật đặt sân tự động:', error);
        res.status(500).json({ error: 'Lỗi server khi bật đặt sân tự động' });
    } finally {
        client.release();
    }
});

// ────────────────────────────────────────────────
// 5. LẤY LỊCH SỬ ĐẶT SÂN CỦA USER ĐANG ĐĂNG NHẬP
// ────────────────────────────────────────────────
router.get('/', async (req, res) => {
    const user_id = req.user.id;

    try {
        const result = await pool.query(`
            SELECT
                b.id,
                b.booking_date,
                b.total_price,
                b.deposit_amount,
                b.amount_paid,
                b.payment_type,
                b.notes,
                b.is_auto_booking,
                b.auto_booking_id,
                b.created_at,
                c.name          AS court_name,
                c.image_url,
                c.address       AS court_address,
                s.name          AS slot_name,
                s.start_time,
                s.end_time,
                LOWER(bs.status_name) AS status,
                pm.display_name AS payment_method,
                COALESCE(eq.equipment_total, 0) AS equipment_total,
                COALESCE(eq.items, '[]'::json) AS equipment,
                CASE
                    WHEN LOWER(bs.status_name) IN ('pending','confirmed') THEN 'upcoming'
                    WHEN LOWER(bs.status_name) = 'in_progress' THEN 'in_progress'
                    WHEN LOWER(bs.status_name) = 'completed' THEN 'completed'
                    ELSE 'cancelled'
                END AS sort_group
            FROM bookings b
            JOIN courts c      ON b.court_id = c.id
            JOIN slots s       ON b.slot_id  = s.id
            LEFT JOIN booking_statuses bs  ON b.status_id          = bs.id
            LEFT JOIN payment_methods  pm  ON b.payment_method_id  = pm.id
            LEFT JOIN LATERAL (
                SELECT
                    COALESCE(SUM(be.subtotal), 0) AS equipment_total,
                    json_agg(
                        json_build_object(
                            'equipment_name', e.name,
                            'quantity', be.quantity,
                            'subtotal', be.subtotal
                        )
                        ORDER BY e.name
                    ) AS items
                FROM booking_equipment be
                JOIN equipment e ON be.equipment_id = e.id
                WHERE be.booking_id = b.id
            ) eq ON true
            WHERE b.user_id = $1
            ORDER BY
                CASE
                    WHEN LOWER(bs.status_name) IN ('pending','confirmed') THEN 0
                    WHEN LOWER(bs.status_name) = 'in_progress' THEN 1
                    WHEN LOWER(bs.status_name) = 'completed' THEN 2
                    ELSE 3
                END ASC,
                CASE
                    WHEN LOWER(bs.status_name) IN ('pending','confirmed') THEN b.booking_date
                END ASC,
                b.booking_date DESC,
                s.start_time ASC
        `, [user_id]);

        const rows = result.rows.map(row => ({
            ...row,
            can_pay_online: Boolean(row.is_auto_booking)
                && row.payment_type === 'pay_later'
                && ['pending', 'confirmed'].includes(row.status)
                && isSlotInFuture(row.booking_date, row.start_time)
        }));

        res.json(rows);
    } catch (error) {
        console.error('Lỗi lấy lịch sử:', error);
        res.status(500).json({ error: 'Lỗi server lấy lịch sử đặt sân' });
    }
});

// ────────────────────────────────────────────────
// 5. LẤY CHI TIẾT 1 BOOKING
// ────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
    const user_id = req.user.id;
    const bookingId = req.params.id;

    try {
        const result = await pool.query(`
            SELECT
                b.*,
                c.name          AS court_name,
                c.address       AS court_address,
                c.image_url,
                s.name          AS slot_name,
                s.start_time,
                s.end_time,
                LOWER(bs.status_name) AS status,
                pm.display_name AS payment_method,
                u.full_name     AS user_name,
                u.phone         AS user_phone,
                u.email         AS user_email,
                u.is_vip
            FROM bookings b
            JOIN courts c      ON b.court_id = c.id
            JOIN slots s       ON b.slot_id  = s.id
            JOIN users u       ON b.user_id  = u.id
            LEFT JOIN booking_statuses bs  ON b.status_id          = bs.id
            LEFT JOIN payment_methods  pm  ON b.payment_method_id  = pm.id
            WHERE b.id = $1 AND b.user_id = $2
        `, [bookingId, user_id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Không tìm thấy đơn đặt sân' });
        }

        // Lấy thiết bị đã thuê kèm booking
        const equipment = await pool.query(`
            SELECT be.*, e.name AS equipment_name, e.description
            FROM booking_equipment be
            JOIN equipment e ON be.equipment_id = e.id
            WHERE be.booking_id = $1
        `, [bookingId]);

        res.json({ ...result.rows[0], equipment: equipment.rows });
    } catch (error) {
        console.error('Lỗi lấy chi tiết booking:', error);
        res.status(500).json({ error: 'Lỗi server' });
    }
});

// ────────────────────────────────────────────────
// 7. THANH TOÁN ONLINE CHO ĐƠN TỰ ĐỘNG VIP
// ────────────────────────────────────────────────
router.put('/:id/pay', async (req, res) => {
    const bookingId = parseInt(req.params.id, 10);
    const user_id = req.user.id;
    const paymentMethodId = parseInt(req.body.payment_method_id, 10);
    const requestedPaymentType = req.body.payment_type === 'deposit' ? 'deposit' : 'full';

    if (!Number.isInteger(bookingId) || !Number.isInteger(paymentMethodId)) {
        return res.status(400).json({ error: 'Thiếu thông tin thanh toán' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const bookingRes = await client.query(`
            SELECT
                b.id,
                b.user_id,
                b.booking_date::text AS booking_date,
                b.status_id,
                b.payment_type,
                b.total_price,
                b.deposit_amount,
                b.amount_paid,
                b.is_auto_booking,
                s.start_time,
                s.end_time,
                LOWER(bs.status_name) AS status,
                u.cancel_count
            FROM bookings b
            JOIN slots s ON b.slot_id = s.id
            JOIN booking_statuses bs ON b.status_id = bs.id
            JOIN users u ON b.user_id = u.id
            WHERE b.id = $1 AND b.user_id = $2
            FOR UPDATE OF b
        `, [bookingId, user_id]);

        if (bookingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Không tìm thấy đơn đặt sân' });
        }

        const booking = bookingRes.rows[0];

        if (!booking.is_auto_booking || booking.payment_type !== 'pay_later') {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Chỉ đơn tự động chưa thanh toán mới hỗ trợ thanh toán online tại đây' });
        }

        if (!['pending', 'confirmed'].includes(booking.status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Không thể thanh toán đơn ở trạng thái "${booking.status}"` });
        }

        if (!isSlotInFuture(booking.booking_date, booking.start_time)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Khung giờ này đã qua, không thể thanh toán online' });
        }

        const methodRes = await client.query(
            'SELECT id, display_name FROM payment_methods WHERE id = $1',
            [paymentMethodId]
        );
        if (methodRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Phương thức thanh toán không tồn tại' });
        }

        const cancelCount = parseInt(booking.cancel_count, 10) || 0;
        const effectivePaymentType = cancelCount >= 3 ? 'full' : requestedPaymentType;
        const totalPrice = Number(booking.total_price) || 0;
        const depositAmount = Math.round(totalPrice * 0.1);
        const amountPaid = effectivePaymentType === 'deposit' ? depositAmount : totalPrice;

        await client.query(`
            UPDATE bookings
            SET payment_method_id = $1,
                payment_type = $2,
                deposit_amount = $3,
                amount_paid = $4
            WHERE id = $5
        `, [paymentMethodId, effectivePaymentType, depositAmount, amountPaid, bookingId]);

        // Ghi nhận thanh toán vào bảng payments
        await client.query(`
            INSERT INTO payments (booking_id, amount, payment_type, payment_method_id)
            VALUES ($1, $2, $3, $4)
        `, [bookingId, amountPaid, effectivePaymentType, paymentMethodId]);

        await createNotification(client, {
            userId: user_id,
            bookingId,
            title: 'Thanh toán đơn tự động đã được ghi nhận',
            message: `Đơn #${bookingId} đã ghi nhận thanh toán ${effectivePaymentType === 'deposit' ? 'đặt cọc' : 'toàn phần'} ${amountPaid.toLocaleString('vi-VN')}đ qua ${methodRes.rows[0].display_name}.`,
            type: 'vip_auto_payment',
            metadata: {
                payment_type: effectivePaymentType,
                amount_paid: amountPaid,
                forced_full_payment: cancelCount >= 3 && requestedPaymentType === 'deposit'
            }
        });

        await client.query('COMMIT');

        res.json({
            message: effectivePaymentType === 'deposit'
                ? `Đã thanh toán đặt cọc ${amountPaid.toLocaleString('vi-VN')}đ cho đơn tự động.`
                : 'Đã thanh toán toàn phần cho đơn tự động.',
            forced_full_payment: cancelCount >= 3 && requestedPaymentType === 'deposit',
            booking: {
                id: bookingId,
                payment_type: effectivePaymentType,
                amount_paid: amountPaid,
                payment_method: methodRes.rows[0].display_name
            }
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Lỗi thanh toán đơn tự động:', error);
        res.status(500).json({ error: 'Không thể thanh toán đơn tự động' });
    } finally {
        client.release();
    }
});

// ────────────────────────────────────────────────
// 8. HỦY ĐẶT SÂN (User tự hủy)
//    - Kiểm tra quyền sở hữu
//    - Kiểm tra thời hạn: ≥3h trước giờ đặt (theo doc KLTN Table 6)
//    - Ghi log vào booking_cancellations
//    - Tăng cancel_count của user
// ────────────────────────────────────────────────
router.put('/:id/cancel', async (req, res) => {
    const bookingId = req.params.id;
    const user_id = req.user.id;
    const { reason } = req.body;

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // ① Lấy booking + kiểm tra quyền sở hữu
        const bookingRes = await client.query(`
            SELECT
                b.id, b.user_id, b.court_id, b.slot_id,
                b.booking_date::text AS booking_date,
                b.status_id, b.payment_method_id, b.payment_type,
                b.total_price, b.deposit_amount, b.amount_paid, b.notes,
                s.start_time,
                LOWER(bs.status_name) AS status,
                u.is_vip,
                u.cancel_count
            FROM bookings b
            JOIN slots s               ON b.slot_id  = s.id
            JOIN booking_statuses bs   ON b.status_id = bs.id
            JOIN users u               ON b.user_id   = u.id
            WHERE b.id = $1
            FOR UPDATE OF b
        `, [bookingId]);

        if (bookingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Không tìm thấy đơn đặt sân' });
        }

        const booking = bookingRes.rows[0];

        // ② Kiểm tra quyền sở hữu
        if (booking.user_id !== user_id) {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Bạn không có quyền hủy đơn này' });
        }

        // ③ Chỉ hủy được khi trạng thái là pending hoặc confirmed
        if (!['pending', 'confirmed'].includes(booking.status)) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Không thể hủy đơn ở trạng thái "${booking.status}"`
            });
        }

        // ③b Đơn thanh toán 100% không hỗ trợ hủy trên hệ thống (doc Table 6 - Luồng phụ 1)
        if (booking.payment_type === 'full') {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: 'Đơn thanh toán 100% không hỗ trợ hủy trên hệ thống. Vui lòng liên hệ trực tiếp để được hỗ trợ.'
            });
        }

        // ④ Kiểm tra thời hạn hủy
        //    booking_date đã được cast thành TEXT ("YYYY-MM-DD") trong SQL → không bị lệch timezone
        //    Kết hợp với start_time và ép về giờ Việt Nam (+07:00)
        const bookingDateStr = String(booking.booking_date).split('T')[0]; // "2026-05-07"
        const bookingDateTime = new Date(`${bookingDateStr}T${booking.start_time}:00+07:00`);
        const now = new Date();
        const diffMs = bookingDateTime - now;
        const diffHours = diffMs / (1000 * 60 * 60);

        // Doc KLTN Table 6: "Yêu cầu hủy trước giờ chơi ít nhất 3 tiếng"
        const minHoursBefore = 3;

        if (diffHours < minHoursBefore) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Yêu cầu hủy trước giờ chơi ít nhất ${minHoursBefore} tiếng. Hiện tại còn ${diffHours.toFixed(1)} tiếng.`
            });
        }

        // ⑤ Lấy status_id của 'Cancelled'
        const cancelledStatus = await client.query(
            "SELECT id FROM booking_statuses WHERE LOWER(status_name) = 'cancelled' LIMIT 1"
        );
        const cancelledId = cancelledStatus.rows[0]?.id || 3;

        // ⑥ Cập nhật trạng thái booking
        await client.query(
            'UPDATE bookings SET status_id = $1 WHERE id = $2',
            [cancelledId, bookingId]
        );

        // ⑦ Ghi log huỷ
        await client.query(`
            INSERT INTO booking_cancellations (booking_id, reason, cancelled_by)
            VALUES ($1, $2, $3)
        `, [bookingId, reason || 'Khách hủy', user_id]);

        // ⑧ Tăng cancel_count của user
        await client.query(
            'UPDATE users SET cancel_count = cancel_count + 1 WHERE id = $1',
            [user_id]
        );

        // ⑧b Hoàn trả số lượng thiết bị đi kèm (nếu có)
        await client.query(`
            UPDATE equipment e
            SET available_quantity = e.available_quantity + be.quantity
            FROM booking_equipment be
            WHERE be.equipment_id = e.id AND be.booking_id = $1
        `, [bookingId]);

        await client.query('COMMIT');

        const newCancelCount = (booking.cancel_count || 0) + 1;
        let warningMsg = '';
        if (newCancelCount >= 3) {
            warningMsg = ' Lưu ý: Bạn đã hủy 3 lần trở lên, các đặt sân tiếp theo phải thanh toán toàn phần.';
        } else if (newCancelCount === 2) {
            warningMsg = ' Lưu ý: Bạn đã hủy 2 lần. Hủy thêm 1 lần nữa sẽ bị yêu cầu thanh toán toàn phần.';
        }

        res.json({
            message: 'Hủy đặt sân thành công.' + warningMsg,
            cancel_count: newCancelCount
        });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Lỗi hủy sân:', error);
        res.status(500).json({ error: 'Không thể hủy đặt sân' });
    } finally {
        client.release();
    }
});

// ────────────────────────────────────────────────
// 7. THÊM THIẾT BỊ VÀO BOOKING
// ────────────────────────────────────────────────
router.post('/:id/equipment', async (req, res) => {
    const bookingId = req.params.id;
    const user_id = req.user.id;
    const { equipment_id, quantity } = req.body;

    if (!equipment_id || !quantity || quantity < 1) {
        return res.status(400).json({ error: 'Thiếu thông tin thiết bị hoặc số lượng không hợp lệ' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Kiểm tra booking thuộc về user và còn active
        const bookingCheck = await client.query(`
            SELECT b.id, LOWER(bs.status_name) AS status
            FROM bookings b
            JOIN booking_statuses bs ON b.status_id = bs.id
            WHERE b.id = $1 AND b.user_id = $2
        `, [bookingId, user_id]);

        if (bookingCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Không tìm thấy đơn đặt sân' });
        }

        const bStatus = bookingCheck.rows[0].status;
        if (!['pending', 'confirmed'].includes(bStatus)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Chỉ có thể thêm thiết bị khi đơn đang chờ hoặc đã xác nhận' });
        }

        // Kiểm tra thiết bị
        const equipRes = await client.query(
            'SELECT id, name, price_per_booking, available_quantity FROM equipment WHERE id = $1 AND is_active = true FOR UPDATE',
            [equipment_id]
        );
        if (equipRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Thiết bị không tồn tại' });
        }

        const equip = equipRes.rows[0];
        if (equip.available_quantity < quantity) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Thiết bị "${equip.name}" chỉ còn ${equip.available_quantity} cái` });
        }

        const subtotal = parseFloat(equip.price_per_booking) * quantity;

        // Upsert: nếu đã có thiết bị này thì cộng thêm
        const existing = await client.query(
            'SELECT id, quantity FROM booking_equipment WHERE booking_id = $1 AND equipment_id = $2',
            [bookingId, equipment_id]
        );

        if (existing.rows.length > 0) {
            const newQty = existing.rows[0].quantity + quantity;
            const newSubtotal = parseFloat(equip.price_per_booking) * newQty;
            await client.query(
                'UPDATE booking_equipment SET quantity = $1, subtotal = $2 WHERE id = $3',
                [newQty, newSubtotal, existing.rows[0].id]
            );
        } else {
            await client.query(`
                INSERT INTO booking_equipment (booking_id, equipment_id, quantity, subtotal)
                VALUES ($1, $2, $3, $4)
            `, [bookingId, equipment_id, quantity, subtotal]);
        }

        await client.query(`
            UPDATE bookings
            SET
                total_price = total_price + $1,
                deposit_amount = ROUND((total_price + $1) * 0.1),
                amount_paid = CASE
                    WHEN payment_type = 'deposit' THEN ROUND((total_price + $1) * 0.1)
                    WHEN payment_type = 'pay_later' THEN amount_paid
                    ELSE total_price + $1
                END
            WHERE id = $2
        `, [subtotal, bookingId]);

        // Cập nhật giảm số lượng thiết bị khả dụng
        await client.query(`
            UPDATE equipment
            SET available_quantity = available_quantity - $1
            WHERE id = $2
        `, [quantity, equipment_id]);

        await client.query('COMMIT');
        res.json({ message: `Đã thêm ${quantity} ${equip.name} vào đơn đặt sân` });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Lỗi thêm thiết bị:', error);
        res.status(500).json({ error: 'Lỗi server' });
    } finally {
        client.release();
    }
});

const { processQrScan } = require('../services/qrCheckin');

// ────────────────────────────────────────────────
// 9. QUÉT MÃ QR CHECK-IN/CHECK-OUT
// ────────────────────────────────────────────────
router.post('/scan-qr', async (req, res) => {
    const { booking_id } = req.body;
    const user_id = req.user.id;
    const isAdmin = req.user.role === 'admin';

    if (!booking_id) {
        return res.status(400).json({ error: 'Thiếu mã đơn đặt sân (booking_id).' });
    }

    try {
        const result = await processQrScan(booking_id, user_id, isAdmin);
        if (result.success) {
            res.json({ message: result.message });
        } else {
            res.status(400).json({ error: result.message });
        }
    } catch (error) {
        console.error('Lỗi quét mã QR:', error);
        res.status(500).json({ error: 'Lỗi server khi xử lý quét mã QR.' });
    }
});

module.exports = router;

