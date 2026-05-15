/**
 * Trang Quên Mật Khẩu
 *
 * Cho phép người dùng yêu cầu gửi mã OTP về email đã đăng ký để xác thực
 * và tiến hành đặt lại mật khẩu. Đây là bước đầu tiên trong quy trình
 * khôi phục mật khẩu (Forgot Password -> Reset Password).
 *
 * Luồng xử lý:
 *   1. Người dùng nhập email đã đăng ký tài khoản.
 *   2. Gọi API `authService.forgotPassword()` để yêu cầu gửi OTP.
 *   3. Nếu thành công, hiển thị màn hình xác nhận đã gửi OTP.
 *   4. Người dùng nhấn "Tiếp tục" để chuyển sang trang `/reset-password`.
 *
 * Trang có hai trạng thái hiển thị:
 *   - Form nhập email (mặc định)
 *   - Màn hình thông báo đã gửi OTP thành công (khi `sent === true`)
 *
 * Điều hướng:
 *   - /login (liên kết quay lại)
 *   - /reset-password (sau khi OTP được gửi thành công)
 */

import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { authService } from '@/services'

/**
 * Component trang Quên Mật Khẩu
 *
 * Bước 1 trong quy trình khôi phục mật khẩu: người dùng gửi yêu cầu
 * lấy mã OTP qua email. Sau khi OTP được gửi, chuyển sang bước 2
 * (ResetPasswordPage) để nhập OTP và mật khẩu mới.
 *
 * @returns Giao diện form quên mật khẩu hoặc màn hình xác nhận đã gửi OTP
 */
export default function ForgotPasswordPage() {
  // Email đã đăng ký tài khoản, dùng để nhận mã OTP
  const [email, setEmail] = useState('')

  // Trạng thái loading khi gửi request API
  const [loading, setLoading] = useState(false)

  // Đánh dấu OTP đã được gửi thành công hay chưa
  const [sent, setSent] = useState(false)

  // Hook điều hướng
  const navigate = useNavigate()

  /**
   * Xử lý gửi yêu cầu quên mật khẩu
   *
   * Gọi API forgotPassword với email đã đăng ký. Server sẽ gửi mã OTP 6 số
   * về email đó để xác thực danh tính người dùng trước khi cho phép đặt lại mật khẩu.
   *
   * @param e - Sự kiện submit form
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      // Gọi API yêu cầu gửi mã OTP về email
      await authService.forgotPassword(email)
      // Đánh dấu đã gửi thành công để chuyển sang màn hình xác nhận
      setSent(true)
      toast.success('Mã OTP đã được gửi vào email của bạn')
    } catch (err: any) {
      // Hiển thị lỗi từ server hoặc thông báo mặc định
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Không thể gửi mã OTP')
    } finally { setLoading(false) }
  }

  // Màn hình xác nhận OTP đã gửi - hiển thị sau khi gửi thành công
  if (sent) {
    return (
      <div className="min-h-screen relative flex items-center justify-center px-4 bg-gradient-to-br from-primary/5 via-background to-green-500/5">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md text-center">
          {/* Icon email xanh thể hiện trạng thái thành công */}
          <div className="size-16 mx-auto rounded-full bg-success/10 flex items-center justify-center mb-4">
            <Mail className="size-8 text-success" />
          </div>
          <h2 className="text-xl font-bold">Kiểm tra email của bạn</h2>
          <p className="mt-2 text-muted-foreground">Chúng tôi đã gửi mã OTP đến {email}</p>
          {/* Nút điều hướng sang trang đặt lại mật khẩu, truyền email qua state */}
          <Button className="mt-6" onClick={() => navigate('/reset-password', { state: { email } })}>Tiếp tục</Button>
        </motion.div>
      </div>
    )
  }

  // Form nhập email mặc định - bước 1 của quy trình
  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 bg-gradient-to-br from-primary/5 via-background to-green-500/5">
      {/* Container chính với hiệu ứng fade-in + slide-up */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        {/* Liên kết quay lại trang đăng nhập */}
        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="size-4" /> Quay lại đăng nhập
        </Link>
        {/* Card chứa form nhập email */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-lg">
          <h2 className="text-lg font-semibold mb-4">Quên mật khẩu</h2>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5">Email đã đăng ký</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  className="w-full h-11 px-4 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                  placeholder="email@example.com" />
              </div>
              {/* Nút submit - hiển thị loading spinner khi đang gửi request */}
              <Button type="submit" loading={loading} className="w-full" size="lg">Gửi mã xác nhận</Button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  )
}
