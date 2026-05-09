const { pool } = require('../config/database');
const { 
    getBangkokTodayString, 
    getBangkokParts 
} = require('./bookingTime');

async function processQrScan(bookingId, userId, isAdmin) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Lấy thông tin đơn đặt sân và trạng thái
        const bookingRes = await client.query(`
            SELECT 
                b.id, 
                b.user_id, 
                b.booking_date::text as booking_date, 
                b.status_id,
                LOWER(bs.status_name) as status_name,
                s.start_time,
                s.end_time
            FROM bookings b
            JOIN booking_statuses bs ON b.status_id = bs.id
            JOIN slots s ON b.slot_id = s.id
            WHERE b.id = $1
            FOR UPDATE
        `, [bookingId]);

        if (bookingRes.rows.length === 0) {
            await client.query('ROLLBACK');
            return { success: false, message: 'Không tìm thấy đơn đặt sân.' };
        }

        const booking = bookingRes.rows[0];

        // Nếu không phải admin quét, thì phải là chủ đơn quét (tùy thuộc vào yêu cầu, 
        // nhưng thường admin quét sẽ bảo mật hơn. Ở đây hỗ trợ cả hai nếu cần).
        // Tuy nhiên, theo logic đề bài, đây là API xử lý quét mã.
        
        const now = new Date();
        const bangkokParts = getBangkokParts(now);
        const t_minutes = bangkokParts.hour * 60 + bangkokParts.minute;
        const today = getBangkokTodayString(now);

        // Chuyển start_time/end_time (HH:mm) thành phút
        const [start_h, start_m] = booking.start_time.split(':').map(Number);
        const [end_h, end_m] = booking.end_time.split(':').map(Number);
        const T_start = start_h * 60 + start_m;
        const T_end = end_h * 60 + end_m;

        if (booking.status_name === 'confirmed') {
            // 1. Nếu trạng thái là "Đã xác nhận"
            
            // Kiểm tra ngày
            if (booking.booking_date !== today) {
                await client.query('ROLLBACK');
                return { success: false, message: 'Đơn đặt sân không phải ngày hôm nay.' };
            }

            if (t_minutes < T_start - 15) {
                await client.query('ROLLBACK');
                return { success: false, message: 'Chưa đến giờ check-in. Vui lòng quay lại trước giờ chơi 15 phút.' };
            } else if (t_minutes > T_start + 30) {
                await client.query('ROLLBACK');
                return { success: false, message: 'Đã quá hạn check-in.' };
            } else {
                // Hợp lệ -> Chuyển sang "Đang chơi"
                const inProgressStatus = await client.query("SELECT id FROM booking_statuses WHERE LOWER(status_name) = 'in_progress'");
                await client.query("UPDATE bookings SET status_id = $1 WHERE id = $2", [inProgressStatus.rows[0].id, bookingId]);
                
                await client.query('COMMIT');
                return { success: true, message: 'Check-in thành công! Chúc bạn chơi vui vẻ.' };
            }

        } else if (booking.status_name === 'in_progress') {
            // 2. Nếu trạng thái là "Đang chơi"
            const completedStatus = await client.query("SELECT id FROM booking_statuses WHERE LOWER(status_name) = 'completed'");
            await client.query("UPDATE bookings SET status_id = $1 WHERE id = $2", [completedStatus.rows[0].id, bookingId]);
            
            await client.query('COMMIT');
            return { success: true, message: 'Check-out thành công! Cảm ơn bạn.' };

        } else {
            await client.query('ROLLBACK');
            return { success: false, message: `Trạng thái đơn (${booking.status_name}) không hợp lệ để check-in/out.` };
        }

    } catch (error) {
        await client.query('ROLLBACK');
        console.error('QR Scan error:', error);
        throw error;
    } finally {
        client.release();
    }
}

module.exports = { processQrScan };
