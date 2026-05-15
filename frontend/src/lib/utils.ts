/**
 * utils.ts - Các hàm tiện ích dùng chung trong toàn bộ ứng dụng.
 *
 * File này cung cấp các helper function:
 *
 * 1. cn(...inputs) - Gộp và xử lý xung đột class Tailwind CSS:
 *    - Dùng clsx để gộp các class value (string, object, array)
 *    - Dùng tailwind-merge (twMerge) để giải quyết xung đột giữa các class Tailwind
 *    - Ví dụ: cn('px-4', 'px-2') -> 'px-2' (class sau ghi đè class trước)
 *
 * 2. getImageUrl(url, options?) - Xử lý URL ảnh:
 *    - Nếu không có URL -> trả về ảnh placeholder mặc định
 *    - Nếu URL không phải Cloudinary -> trả về nguyên bản
 *    - Nếu là Cloudinary URL -> thêm các tham số transform (width, height, quality, crop)
 *      để tối ưu ảnh (f_auto: tự động format, q_: chất lượng, w_/h_: kích thước, c_fill: crop)
 *
 * 3. formatPrice(amount) - Format số tiền sang tiền Việt Nam:
 *    - Dùng Intl.NumberFormat với locale 'vi-VN', style 'currency', mã VND
 *    - An toàn với NaN (mặc định 0)
 *    - Ví dụ: formatPrice(200000) -> "200.000 ₫"
 *
 * 4. formatDate(date) - Format ngày tháng theo chuẩn Việt Nam:
 *    - Dùng Intl.DateTimeFormat với locale 'vi-VN'
 *    - Định dạng: DD/MM/YYYY
 *
 * 5. formatDateTime(date) - Format ngày giờ đầy đủ:
 *    - Tương tự formatDate nhưng có thêm giờ:phút
 *    - Định dạng: DD/MM/YYYY HH:MM
 *
 * 6. formatTime(time) - Cắt chuỗi thời gian lấy HH:MM:
 *    - Input: "HH:MM:SS" -> Output: "HH:MM"
 *
 * 7. debounce(fn, delay) - Hàm debounce (trì hoãn thực thi):
 *    - Hủy lần gọi trước nếu được gọi lại trong khoảng delay
 *    - Hữu ích cho xử lý input search (chỉ gọi API khi user dừng gõ)
 */

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * cn - Gộp các class Tailwind CSS và tự động giải quyết xung đột.
 *
 * @param inputs - Danh sách class value (string, object, array) truyền vào
 * @returns Chuỗi class đã được merge và resolve xung đột
 *
 * Cách hoạt động:
 * - clsx: gộp tất cả inputs thành 1 chuỗi class (xử lý conditional class)
 * - twMerge: phát hiện và loại bỏ class Tailwind bị ghi đè (vd: px-4 bị px-2 ghi đè)
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * getImageUrl - Xử lý và tối ưu URL ảnh, đặc biệt cho ảnh từ Cloudinary.
 *
 * @param url - URL ảnh gốc (có thể undefined)
 * @param options - Tùy chọn transform ảnh: { width?, height?, quality? (mặc định 80) }
 * @returns URL ảnh đã được xử lý hoặc ảnh placeholder nếu không có URL
 *
 * Với Cloudinary URL:
 * - Thêm f_auto: tự động chọn format tối ưu (webp nếu browser hỗ trợ)
 * - Thêm q_{quality}: chất lượng ảnh (mặc định 80%)
 * - Thêm w_{width}, h_{height}: resize ảnh
 * - Thêm c_fill: crop ảnh để lấp đầy khung
 */
export function getImageUrl(url: string | undefined, options?: {
  width?: number; height?: number; quality?: number
}) {
  if (!url) return '/placeholder-court.jpg'
  if (!url.includes('cloudinary')) return url
  const { width, height, quality = 80 } = options || {}
  const transforms = ['f_auto', `q_${quality}`]
  if (width) transforms.push(`w_${width}`)
  if (height) transforms.push(`h_${height}`)
  transforms.push('c_fill')
  return url.replace('/upload/', `/upload/${transforms.join(',')}/`)
}

/**
 * formatPrice - Format số tiền thành chuỗi tiền tệ Việt Nam (VND).
 *
 * @param amount - Số tiền cần format
 * @returns Chuỗi đã format, ví dụ: "200.000 ₫"
 *
 * Cách hoạt động:
 * - Dùng Intl.NumberFormat với locale 'vi-VN' để format theo chuẩn Việt Nam
 * - style: 'currency' - hiển thị dạng tiền tệ
 * - maximumFractionDigits: 0 - không hiển thị số thập phân (VND không dùng)
 * - An toàn với NaN: nếu amount = NaN thì hiển thị 0 ₫
 */
export function formatPrice(amount: number): string {
  const safeAmount = isNaN(amount) ? 0 : amount
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency', currency: 'VND', maximumFractionDigits: 0,
  }).format(safeAmount)
}

/**
 * formatDate - Format ngày tháng sang chuỗi ngày Việt Nam (DD/MM/YYYY).
 *
 * @param date - Ngày cần format (string ISO hoặc Date object)
 * @returns Chuỗi ngày đã format, ví dụ: "15/05/2026"
 */
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(date))
}

/**
 * formatDateTime - Format ngày giờ đầy đủ sang chuỗi Việt Nam (DD/MM/YYYY HH:MM).
 *
 * @param date - Ngày giờ cần format (string ISO hoặc Date object)
 * @returns Chuỗi ngày giờ đã format, ví dụ: "15/05/2026 14:30"
 */
export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(date))
}

/**
 * formatTime - Cắt chuỗi thời gian để lấy HH:MM (bỏ giây).
 *
 * @param time - Chuỗi thời gian, ví dụ: "14:30:00"
 * @returns Chuỗi giờ:phút, ví dụ: "14:30"
 */
export function formatTime(time: string): string {
  return time.substring(0, 5)
}

/**
 * debounce - Tạo hàm debounce (trì hoãn thực thi cho đến khi ngừng gọi).
 *
 * @param fn - Hàm cần debounce
 * @param delay - Thời gian trì hoãn (ms), hàm chỉ chạy sau khi ngừng gọi trong khoảng này
 * @returns Hàm đã được debounce
 *
 * Cách hoạt động:
 * - Mỗi lần gọi hàm debounced -> clear timeout cũ + set timeout mới
 * - Hàm gốc chỉ được gọi khi timeout kết thúc mà không bị clear
 * - Ứng dụng: input search (chỉ gọi API khi user dừng gõ 300ms)
 */
export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay) }
}
