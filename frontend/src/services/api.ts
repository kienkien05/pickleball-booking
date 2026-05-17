/**
 * api.ts - Cấu hình Axios instance cho toàn bộ ứng dụng.
 *
 * File này tạo ra một axios instance được cấu hình sẵn với:
 *
 * 1. baseURL: lấy từ biến môi trường VITE_API_BASE_URL, mặc định '/api'
 *    - Trong development: thường là 'http://localhost:5000/api'
 *    - Trong production: thường là '/api' (cùng domain với frontend)
 *
 * 2. Headers mặc định:
 *    - Content-Type: application/json
 *    - ngrok-skip-browser-warning: dùng khi chạy tunnel qua ngrok
 *
 * 3. timeout: 25 giây - hủy request nếu quá thời gian
 *
 * 4. Request Interceptor - Tự động gắn token và user ID vào mỗi request:
 *    - Đọc token và user từ authStore (Zustand)
 *    - Nếu có token -> gắn header Authorization: Bearer <token>
 *    - Nếu có user.id -> gắn header x-user-id
 *
 * 5. Response Interceptor - Xử lý lỗi 401/403 (token hết hạn hoặc không có quyền):
 *    - Khi nhận lỗi 401 hoặc 403 -> tự động gọi logout()
 *    - Ngoại trừ: không logout khi lỗi từ /auth/login hoặc /auth/verify
 *      (vì đó là lỗi đăng nhập bình thường, không phải token hết hạn)
 */

import axios from 'axios'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/authStore'

// API base URL - ưu tiên biến môi trường, fallback về '/api'
const API_URL = import.meta.env.VITE_API_BASE_URL || '/api'

/**
 * api - Axios instance được cấu hình sẵn, dùng cho tất cả request trong ứng dụng.
 *
 * Tất cả các service trong services/index.ts đều dùng instance này.
 */
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': '69420', // Bỏ qua cảnh báo trình duyệt của ngrok
  },
  timeout: 25000, // 25 giây timeout
})

/**
 * Request Interceptor - Chạy trước mỗi request được gửi đi.
 *
 * Tự động:
 * - Gắn JWT token vào header Authorization (dạng Bearer)
 * - Gắn user ID vào header x-user-id để backend biết ai đang gửi request
 */
api.interceptors.request.use(
  (config) => {
    const { token, user } = useAuthStore.getState()
    if (token) config.headers.Authorization = `Bearer ${token}`
    if (user?.id) config.headers['x-user-id'] = user.id
    return config
  },
  (error) => Promise.reject(error)
)

/**
 * Response Interceptor - Chạy sau mỗi response nhận về.
 *
 * Xử lý:
 * - Nếu response thành công (2xx) -> trả về bình thường
 * - Nếu lỗi 401 hoặc 403 -> tự động logout (trừ các request đăng nhập/xác thực)
 *   Lý do: token hết hạn hoặc user bị khóa -> cần đăng nhập lại
 */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url || ''
    const status = error.response?.status
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/verify')

    if (!isAuthEndpoint) {
      if (status === 401) {
        // Token hết hạn -> logout
        useAuthStore.getState().logout()
      } else if (status === 403 && url.includes('/auth/profile')) {
        // Tài khoản bị khóa trong lúc đang dùng app -> thông báo rồi logout
        const errMsg = error.response?.data?.error || 'Tài khoản đã bị khóa. Vui lòng liên hệ Admin'
        toast.error(errMsg, { duration: 5000 })
        useAuthStore.getState().logout()
      }
    }
    return Promise.reject(error)
  }
)

export default api
