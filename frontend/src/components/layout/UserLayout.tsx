/**
 * UserLayout.tsx - Layout cho toàn bộ trang người dùng (User).
 *
 * Component này cung cấp layout chung cho tất cả trang user:
 *
 * 1. Header (trên cùng, sticky):
 *    - Logo + tên app "PickleBall" bên trái (link về trang chủ)
 *    - Desktop navigation: Trang chủ, Sân, Lịch sử, Mã giảm giá
 *    - Nút "Quản trị" nếu user là admin (link đến /admin)
 *    - Nút chuyển đổi theme (sáng/tối)
 *    - Chuông thông báo (NotificationBell)
 *    - Nếu đã đăng nhập: avatar (link /profile) + nút đăng xuất
 *    - Nếu chưa đăng nhập: nút "Đăng nhập"
 *
 * 2. Main content:
 *    - <Outlet /> để render trang con
 *    - Padding bottom trên mobile để không bị bottom nav che
 *
 * 3. Bottom navigation (mobile only):
 *    - Hiển thị ở cuối màn hình trên thiết bị di động
 *    - Các link: Trang chủ, Sân, Lịch sử, Mã giảm giá, (Admin nếu có), (Đăng nhập nếu chưa)
 *    - Có safe-bottom để không bị tràn vào vùng notch/thanh điều hướng
 */

import { useState } from 'react'
import { Outlet, NavLink, Link, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Home, MapPin, User, ClipboardList, Menu, X, Sun, Moon, LogOut, LogIn, Shield, Ticket } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { Button } from '@/components/ui/Button'
import NotificationBell from '@/components/NotificationBell'
import { cn } from '@/lib/utils'

/**
 * navLinks - Định nghĩa các link trong navigation.
 * Link có auth: true chỉ hiển thị khi user đã đăng nhập.
 */
const navLinks = [
  { to: '/', icon: Home, label: 'Trang chủ', end: true },
  { to: '/courts', icon: MapPin, label: 'Sân', end: false },
  { to: '/my-bookings', icon: ClipboardList, label: 'Lịch sử', auth: true },
  { to: '/my-vouchers', icon: Ticket, label: 'Mã giảm giá', auth: true },
]

/**
 * UserLayout - Layout chính cho khu vực người dùng.
 *
 * Sử dụng React Router <Outlet /> để render nội dung trang con
 * vào vị trí <main> bên trong layout này.
 */
export default function UserLayout() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const { isAuthenticated, user, logout } = useAuthStore()
  const { theme, toggleTheme } = useThemeStore()
  const navigate = useNavigate()

  // Lọc link: chỉ hiển thị link yêu cầu auth nếu user đã đăng nhập
  const visibleLinks = navLinks.filter(link => !link.auth || isAuthenticated)

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* ── Header ── */}
      <header className="sticky top-0 z-40 bg-card/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo + tên app */}
          <Link to="/" className="flex items-center gap-2">
            <MapPin className="size-6 text-primary" />
            <span className="text-lg font-bold bg-gradient-to-r from-primary to-green-400 bg-clip-text text-transparent">PickleBall</span>
          </Link>

          {/* Desktop navigation */}
          <nav className="hidden sm:flex items-center gap-1">
            {visibleLinks.slice(0, 4).map(link => (
              <NavLink key={link.to} to={link.to} end={link.end}
                className={({ isActive }) => cn('px-4 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}>
                {link.label}
              </NavLink>
            ))}
          </nav>

          {/* Right side: admin link, theme toggle, notification, auth */}
          <div className="flex items-center gap-2">
            {/* Nút "Quản trị" - chỉ hiển thị nếu user là admin */}
            {user?.role === 'admin' && (
              <Link to="/admin">
                <Button variant="ghost" className="gap-2 text-primary hover:text-primary hover:bg-primary/10">
                  <Shield className="size-4" />
                  <span className="hidden md:inline font-bold text-xs uppercase tracking-wider">Quản trị</span>
                </Button>
              </Link>
            )}
            {/* Nút chuyển đổi theme */}
            <Button variant="ghost" size="icon" onClick={toggleTheme}>
              {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
            {/* Chuông thông báo */}
            <NotificationBell />
            {/* Auth section: đã đăng nhập -> avatar + logout, chưa -> nút đăng nhập */}
            {isAuthenticated ? (
              <div className="flex items-center gap-2">
                <Link to="/profile">
                  <Button variant="ghost" size="icon" className="rounded-full overflow-hidden border border-border bg-muted/50 hover:bg-muted">
                    {user?.avatar_url ? (
                      <img src={user.avatar_url} alt={user.full_name} className="size-full object-cover" />
                    ) : (
                      <span className="font-semibold text-sm uppercase">{user?.full_name?.charAt(0) || <User className="size-4" />}</span>
                    )}
                  </Button>
                </Link>
                {/* Nút đăng xuất */}
                <Button variant="ghost" size="icon" onClick={() => { logout(); navigate('/') }}>
                  <LogOut className="size-4" />
                </Button>
              </div>
            ) : (
              <Link to="/login">
                <Button size="sm" className="gap-2"><LogIn className="size-4" />Đăng nhập</Button>
              </Link>
            )}
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 pb-20 sm:pb-0">
        <Outlet />
      </main>

      {/* ── Bottom navigation (mobile only) ── */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-card/95 backdrop-blur-xl border-t border-border safe-bottom">
        <div className="flex items-center justify-around h-16">
          {visibleLinks.slice(0, 5).map(link => (
            <NavLink key={link.to} to={link.to} end={link.end}
              className={({ isActive }) => cn('flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors touch-target',
                isActive ? 'text-primary' : 'text-muted-foreground')}>
              <link.icon className="size-5" />
              <span className="text-[10px] font-medium">{link.label}</span>
            </NavLink>
          ))}
          {/* Link Admin trên bottom nav (mobile) */}
          {user?.role === 'admin' && (
            <NavLink to="/admin" className={({ isActive }) => cn('flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors touch-target',
              isActive ? 'text-primary' : 'text-muted-foreground')}>
              <Shield className="size-5" />
              <span className="text-[10px] font-medium">Admin</span>
            </NavLink>
          )}
          {/* Link Đăng nhập trên bottom nav nếu chưa đăng nhập */}
          {!isAuthenticated && (
            <NavLink to="/login" className={({ isActive }) => cn('flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-lg transition-colors touch-target',
              isActive ? 'text-primary' : 'text-muted-foreground')}>
              <LogIn className="size-5" />
              <span className="text-[10px] font-medium">Đăng nhập</span>
            </NavLink>
          )}
        </div>
      </nav>
    </div>
  )
}
