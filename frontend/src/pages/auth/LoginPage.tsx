/**
 * Trang Đăng Nhập / Đăng Ký
 *
 * Cung cấp giao diện cho người dùng đăng nhập vào tài khoản hiện có hoặc tạo tài khoản mới.
 * Trang hỗ trợ cả hai luồng (login/register) trong cùng một component, chuyển đổi qua state `step`.
 *
 * Luồng đăng nhập:
 *   1. Người dùng nhập email và mật khẩu.
 *   2. Gọi API `authService.login()`.
 *   3. Nếu API trả về token ngay -> lưu token vào authStore và chuyển hướng (admin -> /admin, user -> /).
 *   4. Nếu API yêu cầu xác thực OTP -> chuyển hướng sang `/verify-otp`.
 *
 * Luồng đăng ký:
 *   1. Người dùng nhập họ tên, số điện thoại, email, mật khẩu, xác nhận mật khẩu.
 *   2. Kiểm tra mật khẩu xác nhận khớp với mật khẩu.
 *   3. Gọi API `authService.register()`.
 *   4. Chuyển hướng sang `/verify-otp` để xác thực email.
 *
 * Điều hướng:
 *   - /login (trang hiện tại)
 *   - /verify-otp (sau đăng nhập/đăng ký nếu cần OTP)
 *   - /forgot-password (liên kết quên mật khẩu)
 *   - / hoặc /admin (sau khi xác thực thành công)
 */

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sun, Moon, Eye, EyeOff, Mail, Lock, User, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { authService } from '@/services'

/**
 * Component trang Đăng Nhập / Đăng Ký
 *
 * Quản lý hai chế độ (login/register) trong một form duy nhất.
 * Khi ở chế độ đăng ký, hiển thị thêm trường họ tên và số điện thoại.
 * Hỗ trợ toggle hiển thị/ẩn mật khẩu và chuyển đổi giao diện sáng/tối.
 *
 * @returns Giao diện form đăng nhập/đăng ký với hiệu ứng chuyển động
 */
export default function LoginPage() {
  // Trạng thái bước hiện tại: 'login' (đăng nhập) hoặc 'register' (đăng ký)
  const [step, setStep] = useState<'login' | 'register'>('login')

  // Dữ liệu form - dùng chung cho cả hai chế độ
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  // Trạng thái hiển thị/ẩn mật khẩu
  const [showPassword, setShowPassword] = useState(false)

  // Trạng thái loading khi gửi request API
  const [loading, setLoading] = useState(false)

  // Hook điều hướng
  const navigate = useNavigate()

  // Lấy theme hiện tại và hàm toggle theme để chuyển đổi sáng/tối
  const { theme, toggleTheme } = useThemeStore()

  /**
   * Xử lý đăng nhập
   *
   * Gửi email và mật khẩu đến API login. Server có thể trả về:
   *   - Token ngay lập tức (người dùng không cần xác thực OTP)
   *   - Yêu cầu xác thực OTP (không có token trong response)
   *
   * @param e - Sự kiện submit form
   */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      // Gọi API đăng nhập với email và mật khẩu
      const { data } = await authService.login({ email, password })
      if (data.data?.token) {
        // Trường hợp server trả về token ngay -> lưu vào authStore và chuyển hướng
        useAuthStore.getState().login({ token: data.data.token, user: data.data.user })
        toast.success('Đăng nhập thành công!')
        // Admin -> /admin, user thường -> /
        navigate(data.data.user.role === 'admin' ? '/admin' : '/')
      } else {
        // Trường hợp cần xác thực OTP -> chuyển sang trang OTP
        navigate('/verify-otp', { state: { email, type: 'login' } })
        toast.info('Vui lòng nhập mã OTP đã gửi vào email')
      }
    } catch (err: any) {
      // Hiển thị lỗi từ server hoặc thông báo mặc định
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Email hoặc mật khẩu không đúng')
    } finally { setLoading(false) }
  }

  /**
   * Xử lý đăng ký tài khoản mới
   *
   * Kiểm tra mật khẩu xác nhận trùng khớp, sau đó gửi thông tin đăng ký.
   * Sau khi đăng ký thành công, chuyển hướng sang trang xác thực OTP
   * để xác nhận email trước khi kích hoạt tài khoản.
   *
   * @param e - Sự kiện submit form
   */
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      // Kiểm tra mật khẩu xác nhận trùng khớp
      if (password !== confirmPassword) { toast.error('Mật khẩu xác nhận không khớp'); setLoading(false); return }
      // Gọi API đăng ký với đầy đủ thông tin
      await authService.register({ email, password, confirm_password: confirmPassword, full_name: fullName, phone_number: phoneNumber })
      // Chuyển hướng sang trang OTP, truyền thông tin đăng ký qua state
      navigate('/verify-otp', { state: { email, password, full_name: fullName, type: 'register' } })
      toast.info('Vui lòng nhập mã OTP đã gửi vào email')
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Đăng ký thất bại')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 bg-gradient-to-br from-primary/5 via-background to-green-500/5">
      {/* Nút toggle giao diện sáng/tối, đặt ở góc trên bên phải */}
      <div className="absolute top-4 right-4">
        <Button variant="ghost" size="icon" onClick={toggleTheme} className="rounded-full hover:bg-muted/50">
          {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </Button>
      </div>

      {/* Container chính với hiệu ứng fade-in + slide-up */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        {/* Logo và tiêu đề */}
        <div className="text-center mb-8">
          <div className="size-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
            <span className="text-3xl">🏓</span>
          </div>
          <h1 className="text-2xl font-bold">PickleBall</h1>
          <p className="mt-2 text-muted-foreground">
            {step === 'login' ? 'Đăng nhập vào tài khoản' : 'Tạo tài khoản mới'}
          </p>
        </div>

        {/* Card chứa form đăng nhập/đăng ký */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-lg">
          {/* Form: xử lý submit khác nhau tùy theo chế độ login/register */}
          <form onSubmit={step === 'login' ? handleLogin : handleRegister}>
            <div className="space-y-4">
              {/* Trường họ tên và số điện thoại - chỉ hiển thị ở chế độ đăng ký */}
              {step === 'register' && (
                <>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Họ và tên</label>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <input type="text" value={fullName} onChange={e => setFullName(e.target.value)} required
                        className="w-full h-11 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                        placeholder="Nguyễn Văn A" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1.5">Số điện thoại</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                      <input type="tel" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)}
                        className="w-full h-11 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                        placeholder="0912345678" />
                    </div>
                  </div>
                </>
              )}

              {/* Trường email - chung cho cả hai chế độ */}
              <div>
                <label className="block text-sm font-medium mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    className="w-full h-11 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                    placeholder="email@example.com" />
                </div>
              </div>

              {/* Trường mật khẩu - chung cho cả hai chế độ, có nút toggle hiển thị/ẩn */}
              <div>
                <label className="block text-sm font-medium mb-1.5">Mật khẩu</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                    className="w-full h-11 pl-10 pr-12 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                    placeholder="••••••••" />
                  {/* Nút toggle hiển thị/ẩn mật khẩu */}
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {/* Trường nhập lại mật khẩu - chỉ hiển thị ở chế độ đăng ký */}
              {step === 'register' && (
                <div>
                  <label className="block text-sm font-medium mb-1.5">Nhập lại mật khẩu</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                    <input type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required minLength={6}
                      className="w-full h-11 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                      placeholder="••••••••" />
                  </div>
                </div>
              )}

              {/* Liên kết "Quên mật khẩu" - chỉ hiển thị ở chế độ đăng nhập */}
              {step === 'login' && (
                <div className="text-right">
                  <Link to="/forgot-password" className="text-sm text-primary hover:underline">Quên mật khẩu?</Link>
                </div>
              )}

              {/* Nút submit - text thay đổi theo chế độ, hiển thị loading spinner khi đang gửi request */}
              <Button type="submit" loading={loading} className="w-full" size="lg">
                {step === 'login' ? 'Đăng nhập' : 'Đăng ký'}
              </Button>
            </div>
          </form>

          {/* Phần chuyển đổi giữa đăng nhập và đăng ký */}
          <div className="mt-4 text-center text-sm text-muted-foreground">
            {step === 'login' ? (
              <>Chưa có tài khoản?{' '}
                <button onClick={() => setStep('register')} className="text-primary hover:underline font-medium">Đăng ký</button>
              </>
            ) : (
              <>Đã có tài khoản?{' '}
                <button onClick={() => setStep('login')} className="text-primary hover:underline font-medium">Đăng nhập</button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
