const { pool } = require('../config/database');
const { getBangkokParts, getBangkokTodayString } = require('./bookingTime');

let schedulerRunning = false;

async function processAutoCheckout() {
    try {
        const now = new Date();
        const bangkokParts = getBangkokParts(now);
        const t_minutes = bangkokParts.hour * 60 + bangkokParts.minute;
        const today = getBangkokTodayString(now);

        const inProgressStatusRes = await pool.query("SELECT id FROM booking_statuses WHERE LOWER(status_name) = 'in_progress'");
        if (inProgressStatusRes.rows.length === 0) return;
        const inProgressId = inProgressStatusRes.rows[0].id;

        const bookings = await pool.query(`
            SELECT b.id, s.end_time, b.booking_date::text as booking_date
            FROM bookings b
            JOIN slots s ON b.slot_id = s.id
            WHERE b.status_id = $1
              AND b.booking_date <= $2::date
        `, [inProgressId, today]);

        const completedStatusRes = await pool.query("SELECT id FROM booking_statuses WHERE LOWER(status_name) = 'completed'");
        if (completedStatusRes.rows.length === 0) return;
        const completedId = completedStatusRes.rows[0].id;
        
        for (const booking of bookings.rows) {
            const [end_h, end_m] = booking.end_time.split(':').map(Number);
            const T_end = end_h * 60 + end_m;

            // Nếu cùng ngày và t >= T_end + 15 phút, hoặc ngày đặt sân đã qua
            if ((booking.booking_date === today && t_minutes >= T_end + 15) || booking.booking_date < today) {
                console.log(`[auto-checkout] Tự động hoàn thành đơn #${booking.id}`);
                await pool.query("UPDATE bookings SET status_id = $1 WHERE id = $2", [completedId, booking.id]);
            }
        }
    } catch (error) {
        console.error('[auto-checkout] Error:', error);
    }
}

function startAutoCheckoutScheduler() {
    if (schedulerRunning) return;
    schedulerRunning = true;

    // Chạy mỗi 5 phút
    setInterval(processAutoCheckout, 5 * 60 * 1000);
    // Chạy lần đầu sau 10 giây
    setTimeout(processAutoCheckout, 10000);
    
    console.log('[auto-checkout] Scheduler ready');
}

module.exports = { startAutoCheckoutScheduler };
