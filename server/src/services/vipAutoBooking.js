const { pool } = require('../config/database');
const {
    normalizeDateString,
    getBangkokTimestampString,
    getNextAutoScheduleFromTargetDate,
    isSlotInFuture
} = require('./bookingTime');

let schedulerRunning = false;
let processing = false;

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

async function cancelConflictingAutoBookings(client, { courtId, slotId, bookingDate, triggeringUserId, triggeringBookingId }) {
    const bookingDateStr = normalizeDateString(bookingDate);
    if (!bookingDateStr) return 0;

    const autoBookings = await client.query(`
        SELECT
            a.id,
            a.user_id,
            a.target_booking_date::text AS target_booking_date,
            c.name AS court_name,
            s.start_time,
            s.end_time
        FROM vip_auto_bookings a
        JOIN courts c ON a.court_id = c.id
        JOIN slots s ON a.slot_id = s.id
        WHERE a.status = 'active'
          AND a.court_id = $1
          AND a.slot_id = $2
          AND a.target_booking_date = $3::date
          AND a.user_id <> $4
        FOR UPDATE OF a
    `, [courtId, slotId, bookingDateStr, triggeringUserId]);

    for (const auto of autoBookings.rows) {
        const reason = `Khung ${auto.start_time} - ${auto.end_time} ngày ${auto.target_booking_date} tại ${auto.court_name} đã được khách khác đặt trước giờ chạy tự động.`;

        await client.query(`
            UPDATE vip_auto_bookings
            SET status = 'cancelled',
                cancellation_reason = $1,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $2
        `, [reason, auto.id]);

        await createNotification(client, {
            userId: auto.user_id,
            bookingId: null,
            title: 'Đặt sân tự động đã bị hủy',
            message: `${reason} Lịch tự động của bạn đã được hủy để tránh trùng lịch.`,
            type: 'vip_auto_cancelled',
            metadata: {
                auto_booking_id: auto.id,
                conflicting_booking_id: triggeringBookingId || null,
                target_booking_date: auto.target_booking_date
            }
        });
    }

    return autoBookings.rows.length;
}

async function processDueAutoBookings() {
    if (processing) return;
    processing = true;

    try {
        const due = await pool.query(`
            SELECT id
            FROM vip_auto_bookings
            WHERE status = 'active'
              AND next_run_at <= $1::timestamp
            ORDER BY next_run_at ASC, id ASC
            LIMIT 50
        `, [getBangkokTimestampString()]);

        for (const row of due.rows) {
            await processSingleAutoBooking(row.id);
        }
    } catch (error) {
        console.error('[vip-auto-booking] process error:', error);
    } finally {
        processing = false;
    }
}

async function processSingleAutoBooking(autoBookingId) {
    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        const autoRes = await client.query(`
            SELECT
                a.*,
                a.target_booking_date::text AS target_booking_date,
                a.next_run_at::text AS next_run_at,
                u.is_vip,
                c.name AS court_name,
                c.price_per_hour,
                c.is_active AS court_active,
                s.name AS slot_name,
                s.start_time,
                s.end_time,
                s.duration_hours,
                s.price_modifier
            FROM vip_auto_bookings a
            JOIN users u ON a.user_id = u.id
            JOIN courts c ON a.court_id = c.id
            JOIN slots s ON a.slot_id = s.id
            WHERE a.id = $1
            FOR UPDATE OF a
        `, [autoBookingId]);

        if (autoRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return;
        }

        const auto = autoRes.rows[0];
        if (auto.status !== 'active') {
            await client.query('ROLLBACK');
            return;
        }

        if (String(auto.next_run_at).replace('T', ' ').slice(0, 19) > getBangkokTimestampString()) {
            await client.query('ROLLBACK');
            return;
        }

        if (!auto.is_vip || !auto.court_active) {
            const reason = !auto.is_vip
                ? 'Tài khoản không còn quyền VIP.'
                : 'Sân đã ngừng hoạt động.';

            await client.query(`
                UPDATE vip_auto_bookings
                SET status = 'cancelled',
                    cancellation_reason = $1,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $2
            `, [reason, auto.id]);

            await createNotification(client, {
                userId: auto.user_id,
                bookingId: null,
                title: 'Đặt sân tự động đã bị hủy',
                message: `${reason} Lịch tự động tại ${auto.court_name} đã được hủy.`,
                type: 'vip_auto_cancelled',
                metadata: { auto_booking_id: auto.id }
            });

            await client.query('COMMIT');
            return;
        }

        if (!isSlotInFuture(auto.target_booking_date, auto.start_time)) {
            const next = getNextAutoScheduleFromTargetDate(auto.target_booking_date);
            await client.query(`
                UPDATE vip_auto_bookings
                SET target_booking_date = $1::date,
                    next_run_at = $2::timestamp,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = $3
            `, [next.targetDate, next.runAt, auto.id]);

            await client.query('COMMIT');
            return;
        }

        await client.query(
            'SELECT pg_advisory_xact_lock(hashtext($1))',
            [`booking:${auto.court_id}:${auto.slot_id}:${auto.target_booking_date}`]
        );

        const conflict = await client.query(`
            SELECT b.id, b.user_id
            FROM bookings b
            WHERE b.court_id = $1
              AND b.slot_id = $2
              AND b.booking_date = $3::date
              AND b.status_id NOT IN (
                SELECT id FROM booking_statuses WHERE LOWER(status_name) = 'cancelled'
              )
            FOR UPDATE
        `, [auto.court_id, auto.slot_id, auto.target_booking_date]);

        if (conflict.rows.length > 0) {
            const existing = conflict.rows[0];

            if (Number(existing.user_id) === Number(auto.user_id)) {
                const next = getNextAutoScheduleFromTargetDate(auto.target_booking_date);
                await client.query(`
                    UPDATE vip_auto_bookings
                    SET target_booking_date = $1::date,
                        next_run_at = $2::timestamp,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $3
                `, [next.targetDate, next.runAt, auto.id]);
            } else {
                const reason = `Khung ${auto.start_time} - ${auto.end_time} ngày ${auto.target_booking_date} tại ${auto.court_name} đã được khách khác đặt trước.`;

                await client.query(`
                    UPDATE vip_auto_bookings
                    SET status = 'cancelled',
                        cancellation_reason = $1,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = $2
                `, [reason, auto.id]);

                await createNotification(client, {
                    userId: auto.user_id,
                    bookingId: null,
                    title: 'Đặt sân tự động đã bị hủy',
                    message: `${reason} Lịch tự động của bạn đã được hủy.`,
                    type: 'vip_auto_cancelled',
                    metadata: {
                        auto_booking_id: auto.id,
                        conflicting_booking_id: existing.id,
                        target_booking_date: auto.target_booking_date
                    }
                });
            }

            await client.query('COMMIT');
            return;
        }

        const pendingStatus = await client.query(
            "SELECT id FROM booking_statuses WHERE LOWER(status_name) = 'pending' LIMIT 1"
        );
        const statusId = pendingStatus.rows[0]?.id || 1;

        const durationHours = Number(auto.duration_hours) || 1.5;
        const priceModifier = Number(auto.price_modifier) || 1;
        const totalPrice = Math.round((Number(auto.price_per_hour) || 0) * durationHours * priceModifier);
        const depositAmount = Math.round(totalPrice * 0.1);

        const bookingRes = await client.query(`
            INSERT INTO bookings
              (user_id, court_id, slot_id, booking_date, status_id,
               payment_method_id, payment_type, total_price, deposit_amount,
               amount_paid, notes, is_auto_booking, auto_booking_id)
            VALUES ($1, $2, $3, $4::date, $5, NULL, 'pay_later', $6, $7, 0, $8, true, $9)
            RETURNING id
        `, [
            auto.user_id,
            auto.court_id,
            auto.slot_id,
            auto.target_booking_date,
            statusId,
            totalPrice,
            depositAmount,
            'Đơn tự động dành cho khách VIP. Khách thanh toán tại sân hoặc thanh toán online trong lịch sử đặt sân.',
            auto.id
        ]);

        const bookingId = bookingRes.rows[0].id;
        const next = getNextAutoScheduleFromTargetDate(auto.target_booking_date);

        await client.query(`
            UPDATE vip_auto_bookings
            SET last_booking_id = $1,
                target_booking_date = $2::date,
                next_run_at = $3::timestamp,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = $4
        `, [bookingId, next.targetDate, next.runAt, auto.id]);

        await createNotification(client, {
            userId: auto.user_id,
            bookingId,
            title: 'Đặt sân tự động thành công',
            message: `Đơn tự động #${bookingId} tại ${auto.court_name} ngày ${auto.target_booking_date} khung ${auto.start_time} - ${auto.end_time} đã được thêm vào lịch sử. Tổng tiền ${formatVnd(totalPrice)}; bạn có thể thanh toán tại sân hoặc thanh toán online.`,
            type: 'vip_auto_success',
            metadata: {
                auto_booking_id: auto.id,
                total_price: totalPrice,
                next_target_booking_date: next.targetDate
            }
        });

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('[vip-auto-booking] single process error:', error);
    } finally {
        client.release();
    }
}

function startVipAutoBookingScheduler() {
    if (schedulerRunning) return;
    schedulerRunning = true;

    setTimeout(processDueAutoBookings, 5000);
    setInterval(processDueAutoBookings, 60 * 1000);
    console.log('[vip-auto-booking] Scheduler ready');
}

module.exports = {
    startVipAutoBookingScheduler,
    processDueAutoBookings,
    cancelConflictingAutoBookings
};
