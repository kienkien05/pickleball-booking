/**
 * constants.ts - Các hằng số cấu hình dùng chung trong toàn bộ ứng dụng.
 *
 * Hiện tại định nghĩa:
 * - BOOKING_LOCK_THRESHOLD_MINS: Thời gian tối đa (phút) cho phép đặt sân sau khi khung giờ đã bắt đầu.
 *   Ví dụ: 15 nghĩa là sau khi khung giờ bắt đầu 15 phút thì không cho phép đặt nữa.
 *   Giá trị này đồng bộ với biến môi trường BOOKING_LOCK_THRESHOLD_MINS ở backend.
 */

/**
 * Thời gian tối đa cho phép đặt sân sau khi khung giờ đã bắt đầu (tính bằng phút).
 * Ví dụ: 15 nghĩa là sau khi bắt đầu 15 phút thì không cho đặt nữa.
 */
export const BOOKING_LOCK_THRESHOLD_MINS = 15;
