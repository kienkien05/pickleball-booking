import { authService } from '@/services'
import { useAuthStore } from '@/stores/authStore'
import { Suspense, lazy, useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import AdminLayout from '@/components/layout/AdminLayout'
import UserLayout from '@/components/layout/UserLayout'

const HomePage = lazy(() => import('@/pages/user/HomePage'))
const ProfilePage = lazy(() => import('@/pages/user/ProfilePage'))
const CourtListPage = lazy(() => import('@/pages/user/CourtListPage'))
const CourtDetailPage = lazy(() => import('@/pages/user/CourtDetailPage'))
const MyBookingsPage = lazy(() => import('@/pages/user/MyBookingsPage'))
const BookingDetailPage = lazy(() => import('@/pages/user/BookingDetailPage'))
const PaymentReturnPage = lazy(() => import('@/pages/user/PaymentReturnPage'))

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

const ForbiddenPage = lazy(() => import('@/pages/error/ForbiddenPage'))

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

function ProtectedRoute({ children, requireAdmin = false }: { children: React.ReactNode; requireAdmin?: boolean }) {
  const { isAuthenticated, user } = useAuthStore()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (requireAdmin && user?.role !== 'admin') return <Navigate to="/forbidden" replace />
  return <>{children}</>
}

export default function App() {
  const { isAuthenticated } = useAuthStore()

  useEffect(() => {
    if (!isAuthenticated) return
    const checkActive = async () => {
      try { await authService.getProfile() } catch (_) { /* intercepted by axios */ }
    }
    const interval = setInterval(checkActive, 15000)
    return () => clearInterval(interval)
  }, [isAuthenticated])

  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* Auth */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/verify-otp" element={<OTPVerifyPage />} />

        {/* User */}
        <Route element={<UserLayout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/courts" element={<CourtListPage />} />
          <Route path="/courts/:id" element={<CourtDetailPage />} />
          <Route path="/payment/sepay-return" element={<PaymentReturnPage />} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/my-bookings" element={<ProtectedRoute><MyBookingsPage /></ProtectedRoute>} />
          <Route path="/booking/:id" element={<ProtectedRoute><BookingDetailPage /></ProtectedRoute>} />
        </Route>

        {/* Admin */}
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
        </Route>

        <Route path="/forbidden" element={<ForbiddenPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  )
}
