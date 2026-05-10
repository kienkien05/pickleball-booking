import api from './api'

export const authService = {
  register: (data: { email: string; password: string; full_name: string; phone_number?: string }) =>
    api.post('/auth/register', data),

  verifyRegister: (data: { email: string; otp: string; password: string; full_name: string }) =>
    api.post('/auth/verify-register', data),

  login: (data: { email: string; password: string }) => api.post('/auth/login', data),

  verifyLogin: (data: { email: string; otp: string }) => api.post('/auth/verify-login', data),

  forgotPassword: (email: string) => api.post('/auth/forgot-password', { email }),

  resetPassword: (data: { email: string; otp: string; new_password: string }) =>
    api.post('/auth/reset-password', data),

  getProfile: () => api.get('/auth/profile'),

  updateProfile: (data: FormData | Record<string, any>) =>
    api.put('/auth/profile', data, {
      headers: data instanceof FormData ? { 'Content-Type': 'multipart/form-data' } : {},
    }),
}

export const courtService = {
  getCourts: (params?: { page?: number; limit?: number; search?: string; status?: string }) =>
    api.get('/courts', { params }),

  getCourtById: (id: string) => api.get(`/courts/${id}`),

  getTimeSlots: (courtId: string, date: string) =>
    api.get(`/courts/${courtId}/timeslots`, { params: { date } }),

  createCourt: (data: Record<string, any>) => api.post('/courts', data),

  updateCourt: (id: string, data: Record<string, any>) => api.put(`/courts/${id}`, data),

  deleteCourt: (id: string) => api.delete(`/courts/${id}`),
}

export const timeSlotService = {
  getByCourt: (courtId: string) => api.get(`/courts/${courtId}/timeslots/all`),

  create: (courtId: string, data: Record<string, any>) =>
    api.post(`/courts/${courtId}/timeslots`, data),

  update: (courtId: string, id: string, data: Record<string, any>) =>
    api.put(`/courts/${courtId}/timeslots/${id}`, data),

  delete: (courtId: string, id: string) =>
    api.delete(`/courts/${courtId}/timeslots/${id}`),
}

export const bookingService = {
  createBooking: (data: Record<string, any>) => api.post('/bookings', data),

  getMyBookings: (params?: { page?: number; limit?: number; status?: string }) =>
    api.get('/bookings/my', { params }),

  getBookingById: (id: string) => api.get(`/bookings/${id}`),

  getBookingQR: (id: string) => api.get(`/bookings/${id}/qr`),

  cancelBooking: (id: string) => api.post(`/bookings/${id}/cancel`),

  confirmBooking: (id: string) => api.post(`/bookings/${id}/confirm`),

  checkIn: (id: string, data?: Record<string, any>) => api.post(`/bookings/${id}/checkin`, data),

  checkOut: (id: string, data?: Record<string, any>) => api.post(`/bookings/${id}/checkout`, data),

  markNoShow: (id: string) => api.post(`/bookings/${id}/noshow`),

  getAllBookings: (params?: { page?: number; limit?: number; status?: string; date?: string; court?: string }) =>
    api.get('/bookings', { params }),
}

export const serviceService = {
  getAll: () => api.get('/services'),
  create: (data: Record<string, any>) => api.post('/services', data),
  update: (id: string, data: Record<string, any>) => api.put(`/services/${id}`, data),
  delete: (id: string) => api.delete(`/services/${id}`),
}

export const reviewService = {
  getByCourt: (courtId: string, params?: { page?: number; limit?: number }) =>
    api.get(`/reviews/court/${courtId}`, { params }),

  create: (data: { booking_id: string; rating: number; comment?: string; courtId?: string }) =>
    api.post('/reviews', data),
}

export const discountService = {
  getAll: () => api.get('/discounts'),
  create: (data: Record<string, any>) => api.post('/discounts', data),
  update: (id: string, data: Record<string, any>) => api.put(`/discounts/${id}`, data),
  delete: (id: string) => api.delete(`/discounts/${id}`),
  validate: (code: string, totalAmount: number) =>
    api.post('/discounts/validate', { code, totalAmount }),
}

export const adminService = {
  getDashboard: () => api.get('/admin/dashboard'),

  getReports: (params?: { startDate?: string; endDate?: string }) =>
    api.get('/admin/reports', { params }),

  exportReports: (params?: { startDate?: string; endDate?: string }) =>
    api.get('/admin/reports/export', { params, responseType: 'blob' }),

  getUsers: (params?: { page?: number; limit?: number; search?: string; status?: string }) =>
    api.get('/users', { params }),

  updateUser: (id: string, data: Record<string, any>) => api.put(`/users/${id}`, data),

  toggleUserStatus: (id: string) => api.patch(`/users/${id}/toggle-status`),

  toggleVip: (id: string) => api.patch(`/users/${id}/toggle-vip`),
}

export const notificationService = {
  getNotifications: (params?: { page?: number; limit?: number }) =>
    api.get('/notifications', { params }),

  getUnreadCount: () => api.get('/notifications/unread-count'),

  markAsRead: (id: string) => api.patch(`/notifications/${id}/read`),

  markAllAsRead: () => api.patch('/notifications/read-all'),
}

export const uploadService = {
  upload: (file: File, folder?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    if (folder) formData.append('folder', folder)
    return api.post('/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },

  uploadCourtImages: (sanId: string, files: File[]) => {
    const formData = new FormData()
    formData.append('sanId', sanId)
    files.forEach(f => formData.append('files', f))
    return api.post('/upload/court-images', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
  },
}

export const courtImageService = {
  delete: (courtId: string, imageId: string) =>
    api.delete(`/courts/${courtId}/images/${imageId}`),
  setMain: (courtId: string, imageId: string) =>
    api.put(`/courts/${courtId}/images/${imageId}/main`),
}
