/**
 * services/index.ts - Tập hợp tất cả API service của ứng dụng.
 *
 * File này định nghĩa các service object, mỗi object tương ứng với một nhóm API.
 * Tất cả đều dùng chung axios instance từ api.ts (đã cấu hình sẵn token, baseURL, error handling).
 *
 * Danh sách services:
 *
 * 1. authService - Xác thực người dùng:
 *    - register: đăng ký tài khoản mới (gửi email, password, full_name...)
 *    - verifyRegister: xác thực OTP và hoàn tất đăng ký
 *    - login: đăng nhập (email + password)
 *    - verifyLogin: xác thực OTP đăng nhập (nếu có)
 *    - forgotPassword: gửi OTP reset mật khẩu
 *    - resetPassword: đổi mật khẩu mới sau khi xác thực OTP
 *    - getProfile: lấy thông tin profile user hiện tại
 *    - updateProfile: cập nhật profile (hỗ trợ cả FormData cho upload avatar)
 *
 * 2. courtService - Quản lý sân:
 *    - getCourts: danh sách sân (phân trang, tìm kiếm, lọc)
 *    - getCourtById: chi tiết 1 sân (kèm ảnh, đánh giá)
 *    - getTimeSlots: khung giờ của sân theo ngày
 *    - createCourt: tạo sân mới (admin)
 *    - updateCourt: cập nhật sân (admin)
 *    - deleteCourt: xóa mềm sân (admin)
 *
 * 3. timeSlotService - Quản lý khung giờ:
 *    - getByCourt: lấy tất cả khung giờ của sân (admin)
 *    - create: tạo khung giờ mới (admin)
 *    - update: cập nhật khung giờ (admin)
 *    - delete: xóa khung giờ (admin)
 *
 * 4. bookingService - Quản lý đặt sân:
 *    - createBooking: tạo đơn đặt sân mới
 *    - getMyBookings: danh sách đơn của user hiện tại
 *    - getBookingById: chi tiết 1 đơn
 *    - getBookingQR: lấy mã QR của đơn
 *    - cancelBooking: hủy đơn
 *    - checkIn: check-in cho khách (admin)
 *    - checkOut: check-out cho khách (admin)
 *    - markNoShow: đánh dấu vắng mặt (admin)
 *    - getAllBookings: tất cả đơn trong hệ thống (admin)
 *
 * 5. serviceService - Quản lý dịch vụ:
 *    - getAll: danh sách dịch vụ
 *    - create: tạo dịch vụ mới (admin)
 *    - update: cập nhật dịch vụ (admin)
 *    - delete: xóa dịch vụ (admin)
 *
 * 6. reviewService - Đánh giá:
 *    - getByCourt: danh sách đánh giá của sân
 *    - create: tạo đánh giá mới
 *
 * 7. discountService - Mã giảm giá:
 *    - getAll: tất cả mã giảm giá (admin)
 *    - getMyDiscounts: mã khả dụng cho user hiện tại
 *    - create: tạo mã mới (admin)
 *    - update: cập nhật mã (admin)
 *    - delete: xóa mã (admin)
 *    - validate: kiểm tra tính hợp lệ của mã + tính tiền giảm
 *
 * 8. adminService - Quản trị hệ thống:
 *    - getDashboard: thống kê dashboard
 *    - getReports: báo cáo doanh thu
 *    - exportReports: xuất Excel
 *    - getScheduleBoard: bảng lịch sân
 *    - getUsers: danh sách user (admin)
 *    - updateUser: cập nhật user (admin)
 *    - toggleUserStatus: khóa/mở khóa user (admin)
 *    - toggleVip: bật/tắt VIP (admin)
 *
 * 9. notificationService - Thông báo:
 *    - getNotifications: danh sách thông báo
 *    - getUnreadCount: số thông báo chưa đọc
 *    - markAsRead: đánh dấu 1 thông báo đã đọc
 *    - markAllAsRead: đánh dấu tất cả đã đọc
 *
 * 10. uploadService - Upload file:
 *     - upload: upload 1 file (avatar, ảnh...)
 *     - uploadCourtImages: upload nhiều ảnh cho sân (admin)
 *
 * 11. courtImageService - Quản lý ảnh sân:
 *     - delete: xóa ảnh sân (admin)
 *     - setMain: đặt ảnh chính cho sân (admin)
 */

import api from './api'

/**
 * authService - Các API liên quan đến xác thực người dùng (đăng ký, đăng nhập, profile).
 * Tất cả đều gọi đến endpoint /auth/* trên backend.
 */
export const authService = {
  /** Đăng ký tài khoản mới - gửi thông tin để nhận OTP qua email */
  register: (data: { email: string; password: string; confirm_password: string; full_name: string; phone_number?: string }) =>
    api.post('/auth/register', data),

  /** Xác thực OTP và hoàn tất đăng ký - trả về token + user */
  verifyRegister: (data: { email: string; otp: string; password: string; full_name: string }) =>
    api.post('/auth/verify-register', data),

  /** Đăng nhập - trả về token + user nếu email/password đúng */
  login: (data: { email: string; password: string }) => api.post('/auth/login', data),

  /** Xác thực OTP đăng nhập (nếu hệ thống yêu cầu 2 lớp) */
  verifyLogin: (data: { email: string; otp: string }) => api.post('/auth/verify-login', data),

  /** Gửi OTP reset mật khẩu về email */
  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),

  /** Đổi mật khẩu mới sau khi xác thực OTP */
  resetPassword: (data: { email: string; otp: string; new_password: string }) =>
    api.post('/auth/reset-password', data),

  /** Gửi lại mã OTP mới */
  resendOtp: (data: { email: string; type: 'register' | 'reset' }) =>
    api.post('/auth/resend-otp', data),

  /** Lấy thông tin profile user hiện tại (dùng để kiểm tra token còn hiệu lực) */
  getProfile: () => api.get('/auth/profile'),

  /** Cập nhật profile - hỗ trợ cả JSON và FormData (khi có upload avatar) */
  updateProfile: (data: FormData | Record<string, any>) =>
    api.put('/auth/profile', data, {
      headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
    }),
}

/**
 * courtService - Các API liên quan đến quản lý sân Pickleball.
 * Endpoint: /courts/*
 */
export const courtService = {
  /** Lấy danh sách sân (có phân trang, tìm kiếm, lọc trạng thái) */
  getCourts: (params?: { page?: number; limit?: number; search?: string; status?: string; isAdmin?: boolean }) =>
    api.get('/courts', { params }),

  /** Lấy chi tiết 1 sân (kèm ảnh, avgRating, reviewCount) */
  getCourtById: (id: string) => api.get(`/courts/${id}`),

  /** Lấy khung giờ của sân theo ngày (kèm trạng thái isBooked) */
  getTimeSlots: (courtId: string, date: string) =>
    api.get(`/courts/${courtId}/timeslots`, { params: { date } }),

  /** Tạo sân mới (admin) */
  createCourt: (data: Record<string, any>) => api.post('/courts', data),

  /** Cập nhật thông tin sân (admin) */
  updateCourt: (id: string, data: Record<string, any>) => api.put(`/courts/${id}`, data),

  /** Xóa mềm sân - đặt trạng thái 'Ẩn' (admin) */
  deleteCourt: (id: string) => api.delete(`/courts/${id}`),
}

/**
 * timeSlotService - Các API quản lý khung giờ (admin).
 * Endpoint: /courts/:courtId/timeslots/*
 */
export const timeSlotService = {
  /** Lấy tất cả khung giờ của sân (admin, không cần ngày) */
  getByCourt: (courtId: string) => api.get(`/courts/${courtId}/timeslots/all`),

  /** Tạo khung giờ mới cho sân (admin) */
  create: (courtId: string, data: Record<string, any>) =>
    api.post(`/courts/${courtId}/timeslots`, data),

  /** Cập nhật khung giờ (admin) */
  update: (courtId: string, id: string, data: Record<string, any>) =>
    api.put(`/courts/${courtId}/timeslots/${id}`, data),

  /** Xóa khung giờ (admin) */
  delete: (courtId: string, id: string) =>
    api.delete(`/courts/${courtId}/timeslots/${id}`),
}

/**
 * bookingService - Các API liên quan đến đặt sân.
 * Endpoint: /bookings/*
 */
export const bookingService = {
  /** Tạo đơn đặt sân mới (có kiểm tra xung đột, tính giá, loyalty rewards) */
  createBooking: (data: Record<string, any>) => api.post('/bookings', data),

  /** Lấy danh sách đơn của user hiện tại */
  getMyBookings: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get('/bookings/my', { params }),

  /** Xem chi tiết 1 đơn (kèm dịch vụ, thanh toán) */
  getBookingById: (id: string) => api.get(`/bookings/${id}`),

  /** Tạo lại URL thanh toán cho đơn đang chờ thanh toán */
  getPaymentUrl: (id: string) => api.post(`/bookings/${id}/payment-url`),

  /** Lấy mã QR của đơn (dùng để check-in) */
  getBookingQR: (id: string) => api.get(`/bookings/${id}/qr`),

  /** Hủy đơn (kiểm tra quy tắc 3 tiếng) */
  cancelBooking: (id: string) => api.post(`/bookings/${id}/cancel`),

  /** Check-in cho khách (admin) - đổi trạng thái -> Đang sử dụng */
  checkIn: (id: string, data?: Record<string, any>) => api.post(`/bookings/${id}/checkin`, data),

  /** Check-out cho khách (admin) - đổi trạng thái -> Hoàn thành */
  checkOut: (id: string, data?: Record<string, any>) => api.post(`/bookings/${id}/checkout`, data),

  /** Đánh dấu vắng mặt (admin) - đổi trạng thái -> Đã hủy + ghi chú No-show */
  markNoShow: (id: string) => api.post(`/bookings/${id}/noshow`),

  /** Lấy tất cả đơn trong hệ thống (admin) */
  getAllBookings: (params?: { page?: number; limit?: number; status?: string; date?: string; court?: string }) =>
    api.get('/bookings', { params }),
}

/**
 * serviceService - Các API quản lý dịch vụ (dụng cụ, đồ uống...).
 * Endpoint: /services/*
 */
export const serviceService = {
  /** Lấy danh sách tất cả dịch vụ */
  getAll: () => api.get('/services'),
  /** Tạo dịch vụ mới (admin) */
  create: (data: Record<string, any>) => api.post('/services', data),
  /** Cập nhật dịch vụ (admin) */
  update: (id: string, data: Record<string, any>) => api.put(`/services/${id}`, data),
  /** Xóa dịch vụ (admin) */
  delete: (id: string) => api.delete(`/services/${id}`),
}

/**
 * reviewService - Các API đánh giá sân.
 * Endpoint: /reviews/*
 */
export const reviewService = {
  /** Lấy danh sách đánh giá của 1 sân (phân trang, kèm avgRating) */
  getByCourt: (courtId: string, params?: { page?: number; limit?: number }) =>
    api.get(`/reviews/court/${courtId}`, { params }),

  /** Tạo đánh giá mới (hỗ trợ cả đánh giá theo đơn và theo sân) */
  create: (data: { booking_id: string; rating: number; comment?: string; courtId?: string }) =>
    api.post('/reviews', data),
}

/**
 * discountService - Các API quản lý mã giảm giá.
 * Endpoint: /discounts/*
 */
export const discountService = {
  /** Lấy tất cả mã giảm giá (admin) */
  getAll: () => api.get('/discounts'),
  /** Lấy mã giảm giá khả dụng cho user hiện tại */
  getMyDiscounts: () => api.get('/discounts/my'),
  /** Tạo mã giảm giá mới (admin) */
  create: (data: Record<string, any>) => api.post('/discounts', data),
  /** Cập nhật mã giảm giá (admin) */
  update: (id: string, data: Record<string, any>) => api.put(`/discounts/${id}`, data),
  /** Xóa mã giảm giá (admin) */
  delete: (id: string) => api.delete(`/discounts/${id}`),
  /** Kiểm tra mã giảm giá hợp lệ + tính số tiền được giảm */
  validate: (code: string, totalAmount: number, courtId?: string, isClaiming?: boolean) =>
    api.post('/discounts/validate', { code, totalAmount, courtId, isClaiming }),
}

/**
 * adminService - Các API quản trị hệ thống (chỉ admin).
 * Endpoint: /admin/* và /users/*
 */
export const adminService = {
  /** Lấy dữ liệu thống kê dashboard (tổng quan + biểu đồ 7 ngày) */
  getDashboard: (params?: { month?: string }) => api.get('/admin/dashboard', { params }),

  /** Lấy báo cáo doanh thu theo khoảng ngày */
  getReports: (params?: { startDate?: string; endDate?: string }) =>
    api.get('/admin/reports', { params }),

  /** Xuất báo cáo doanh thu ra Excel (response dạng blob) */
  exportReports: (params?: { startDate?: string; endDate?: string }) =>
    api.get('/admin/reports/export', { params, responseType: 'blob' }),

  /** Lấy dữ liệu bảng lịch sân (schedule board) */
  getScheduleBoard: (params: { start_date: string; end_date: string; court_id?: string }) =>
    api.get('/admin/schedule-board', { params }),

  /** Lấy danh sách người dùng (admin) */
  getUsers: (params?: { page?: number; limit?: number; search?: string; status?: string }) =>
    api.get('/users', { params }),

  /** Cập nhật thông tin user (admin) */
  updateUser: (id: string, data: Record<string, any>) => api.put(`/users/${id}`, data),

  /** Khóa/Mở khóa tài khoản user (admin) */
  toggleUserStatus: (id: string) => api.patch(`/users/${id}/toggle-status`),

  /** Bật/Tắt trạng thái VIP của user (admin) */
  toggleVip: (id: string) => api.patch(`/users/${id}/toggle-vip`),
}

/**
 * notificationService - Các API thông báo cho người dùng.
 * Endpoint: /notifications/*
 */
export const notificationService = {
  /** Lấy danh sách thông báo của user hiện tại (phân trang) */
  getNotifications: (params?: { page?: number; limit?: number }) =>
    api.get('/notifications', { params }),

  /** Đếm số thông báo chưa đọc -> hiển thị badge trên chuông */
  getUnreadCount: () => api.get('/notifications/unread-count'),

  /** Đánh dấu 1 thông báo đã đọc */
  markAsRead: (id: string) => api.patch(`/notifications/${id}/read`),

  /** Đánh dấu tất cả thông báo đã đọc */
  markAllAsRead: () => api.patch('/notifications/read-all'),
}

/**
 * uploadService - Các API upload file lên server.
 * Endpoint: /upload/*
 */
export const uploadService = {
  /** Upload 1 file (avatar, ảnh...), có thể chỉ định thư mục */
  upload: (file: File, folder?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    if (folder) formData.append('folder', folder)
    return api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  /** Upload nhiều ảnh cho 1 sân (admin), tối đa 10 ảnh */
  uploadCourtImages: (sanId: string, files: File[]) => {
    const formData = new FormData()
    formData.append('sanId', sanId)
    files.forEach(f => formData.append('files', f))
    return api.post('/upload/court-images', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

/**
 * courtImageService - Các API quản lý ảnh sân (admin).
 * Endpoint: /courts/:courtId/images/*
 */
export const courtImageService = {
  /** Xóa 1 ảnh của sân (admin) */
  delete: (courtId: string, imageId: string) =>
    api.delete(`/courts/${courtId}/images/${imageId}`),
  /** Đặt 1 ảnh làm ảnh chính của sân (admin) */
  setMain: (courtId: string, imageId: string) =>
    api.put(`/courts/${courtId}/images/${imageId}/main`),
}
