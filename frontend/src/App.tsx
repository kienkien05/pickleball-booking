/**
 * App.tsx - Component gốc của ứng dụng Pickleball, định nghĩa toàn bộ routing.
 *
 * File này chứa:
 *
 * 1. PageLoader - Component hiển thị spinner khi đang tải trang (lazy load):
 *    - Hiển thị vòng tròn xoay + chữ "Đang tải..."
 *    - Dùng làm fallback cho React.Suspense
 *
 * 2. ProtectedRoute - Component bảo vệ route yêu cầu đăng nhập:
 *    - Nếu chưa đăng nhập -> chuyển hướng đến /login
 *    - Nếu requireAdmin=true và user không phải admin -> chuyển hướng đến /forbidden (403)
 *    - Nếu đủ điều kiện -> render children bình thường
 *
 * 3. App() - Component chính định nghĩa tất cả route trong ứng dụng:
 *    - Dùng React.lazy() để tải từng trang khi cần (code splitting)
 *    - Kiểm tra token còn hiệu lực mỗi 15 giây bằng setInterval gọi authService.getProfile()
 *    - Route được chia thành 3 nhóm:
 *      a. Auth: /login, /forgot-password, /reset-password, /verify-otp
 *      b. User (có UserLayout bao ngoài): /, /courts, /courts/:id, /profile, /my-bookings, /booking/:id, /my-vouchers, /payment/sepay-return
 *      c. Admin (có AdminLayout + ProtectedRoute requireAdmin): /admin/* (dashboard, courts, timeslots, bookings, schedule-board, services, discounts, users, scanner, reports)
 *    - Route không khớp (*) -> chuyển hướng về trang chủ
 */

import { authService } from '@/services'
import { useAuthStore } from '@/stores/authStore'
import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import AdminLayout from '@/components/layout/AdminLayout'
import UserLayout from '@/components/layout/UserLayout'

// ── Lazy load tất cả các trang ──
// Dùng React.lazy() để tách code từng trang thành chunk riêng (code splitting)
// Điều này giúp giảm kích thước bundle ban đầu, trang chỉ tải khi người dùng truy cập
const HomePage = lazy(() => import('@/pages/user/HomePage'))
const ProfilePage = lazy(() => import('@/pages/user/ProfilePage'))
const CourtListPage = lazy(() => import('@/pages/user/CourtListPage'))
const CourtDetailPage = lazy(() => import('@/pages/user/CourtDetailPage'))
const MyBookingsPage = lazy(() => import('@/pages/user/MyBookingsPage'))
const BookingDetailPage = lazy(() => import('@/pages/user/BookingDetailPage'))
const PaymentReturnPage = lazy(() => import('@/pages/user/PaymentReturnPage'))
const VouchersPage = lazy(() => import('@/pages/user/VouchersPage'))
const VNPAYMockPage = lazy(() => import('@/pages/user/VNPAYMockPage'))

const LoginPage = lazy(() => import('@/pages/auth/LoginPage'))
const OTPVerifyPage = lazy(() => import('@/pages/auth/OTPVerifyPage'))
const ForgotPasswordPage = lazy(() => import('@/pages/auth/ForgotPasswordPage'))
const ResetPasswordPage = lazy(() => import('@/pages/auth/ResetPasswordPage'))

const DashboardPage = lazy(() => import('@/pages/admin/DashboardPage'))
const CourtsManagePage = lazy(() => import('@/pages/admin/CourtsManagePage'))
const TimeSlotsManagePage = lazy(() => import('@/pages/admin/TimeSlotsManagePage'))
const BookingsManagePage = lazy(() => import('@/pages/admin/BookingsManagePage'))
const ServicesManagePage = lazy(() => import('@/pages/admin/ServicesManagePage'))
const UsersManagePage = lazy(() => import('@/pages/admin/UsersManagePage'))
const ReportsPage = lazy(() => import('@/pages/admin/ReportsPage'))
const DiscountsManagePage = lazy(() => import('@/pages/admin/DiscountsManagePage'))
const QRScannerPage = lazy(() => import('@/pages/admin/QRScannerPage'))
const ScheduleBoardPage = lazy(() => import('@/pages/admin/ScheduleBoardPage'))

const ForbiddenPage = lazy(() => import('@/pages/error/ForbiddenPage'))

/**
 * PageLoader - Hiển thị giao diện loading khi trang đang được tải (lazy load).
 * Dùng làm fallback cho <Suspense>, hiển thị spinner xoay + chữ "Đang tải...".
 */
function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Đang tải...</p>
      </div>
    </div>
  )
}

/**
 * ProtectedRoute - Bảo vệ route yêu cầu đăng nhập và/hoặc quyền admin.
 *
 * @param children - Component con sẽ được render nếu đủ điều kiện
 * @param requireAdmin - Nếu true, chỉ admin mới được truy cập (mặc định false)
 *
 * Logic:
 * - Nếu chưa đăng nhập (isAuthenticated = false) -> chuyển hướng đến /login
 * - Nếu yêu cầu admin nhưng user không có role 'admin' -> chuyển hướng đến /forbidden (403)
 * - Nếu đủ điều kiện -> render children
 */
function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const { isAuthenticated, user } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (requireAdmin && user?.role !== 'admin') return <Navigate to="/forbidden" replace />
  return <>{children}</>
}

/**
 * App - Component gốc của ứng dụng, chứa toàn bộ định nghĩa routing.
 *
 * Sử dụng React Router v6 với:
 * - <Suspense> bọc ngoài cùng để hiển thị PageLoader trong lúc lazy load trang
 * - <Routes> định nghĩa tất cả route
 * - <UserLayout> và <AdminLayout> là layout wrapper cho từng nhóm route
 *
 * Ngoài ra còn có useEffect kiểm tra token định kỳ mỗi 15 giây:
 * - Gọi authService.getProfile() để xác nhận token còn hiệu lực
 * - Nếu token hết hạn, axios interceptor sẽ tự động logout
 */
export default function App() {
  const { isAuthenticated } = useAuthStore()

  // Kiểm tra trạng thái tài khoản mỗi 5 giây
  // - Nếu token hết hạn (401): interceptor tự động logout
  // - Nếu tài khoản bị khóa (403 từ /auth/profile): interceptor hiển thị toast + logout
  useEffect(() => {
    if (!isAuthenticated) return
    const checkActive = async () => {
      try { await authService.getProfile() } catch (_) { /* intercepted by axios */ }
    }
    // Kiểm tra ngay lập tức khi đăng nhập, sau đó mỗi 5 giây
    checkActive()
    const interval = setInterval(checkActive, 5000)
    return () => clearInterval(interval)
  }, [isAuthenticated])

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* ── Auth Routes (không cần đăng nhập) ── */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-otp" element={<OTPVerifyPage />} />
        <Route path="/vnpay-mock" element={<VNPAYMockPage />} />

        {/* ── User Routes (có UserLayout bao ngoài) ── */}
        <Route element={<UserLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/courts" element={<CourtListPage />} />
          <Route path="/courts/:id" element={<CourtDetailPage />} />
          <Route path="/payment/sepay-return" element={<PaymentReturnPage />} />
          {/* Các route yêu cầu đăng nhập */}
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/my-bookings" element={<ProtectedRoute><MyBookingsPage /></ProtectedRoute>} />
          <Route path="/booking/:id" element={<ProtectedRoute><BookingDetailPage /></ProtectedRoute>} />
          <Route path="/my-vouchers" element={<ProtectedRoute><VouchersPage /></ProtectedRoute>} />
        </Route>

        {/* ── Admin Routes (yêu cầu đăng nhập + quyền admin) ── */}
        <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminLayout /></ProtectedRoute>}>
          <Route index element={<DashboardPage />} />
          <Route path="courts" element={<CourtsManagePage />} />
          <Route path="timeslots" element={<TimeSlotsManagePage />} />
          <Route path="bookings" element={<BookingsManagePage />} />
          <Route path="services" element={<ServicesManagePage />} />
          <Route path="users" element={<UsersManagePage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="discounts" element={<DiscountsManagePage />} />
          <Route path="scanner" element={<QRScannerPage />} />
          <Route path="schedule-board" element={<ScheduleBoardPage />} />
        </Route>

        {/* ── Error Routes ── */}
        <Route path="/forbidden" element={<ForbiddenPage />} />
        {/* Route không tồn tại -> về trang chủ */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
