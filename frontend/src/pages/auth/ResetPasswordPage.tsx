/**
 * Trang Đặt Lại Mật Khẩu
 *
 * Bước cuối cùng trong quy trình khôi phục mật khẩu. Người dùng nhập
 * mã OTP 6 số đã nhận qua email (từ bước ForgotPassword) và mật khẩu
 * mới để đặt lại mật khẩu cho tài khoản.
 *
 * Quy trình khôi phục mật khẩu gồm 2 bước:
 *   1. ForgotPasswordPage: Nhập email, nhận OTP qua email
 *   2. ResetPasswordPage (trang này): Nhập OTP và mật khẩu mới
 *
 * Luồng xử lý:
 *   1. Người dùng nhập mã OTP 6 số (6 ô input riêng biệt).
 *   2. Người dùng nhập mật khẩu mới (tối thiểu 6 ký tự).
 *   3. Gọi API `authService.resetPassword()` với email, OTP, mật khẩu mới.
 *   4. Nếu thành công, hiển thị thông báo và chuyển hướng về /login.
 *
 * Bảo vệ trang: nếu không có email trong state (truy cập trực tiếp),
 * tự động chuyển hướng về /forgot-password.
 *
 * Điều hướng:
 *   - /login (liên kết quay lại, và là đích đến sau khi đổi mật khẩu thành công)
 *   - /forgot-password (nếu truy cập trực tiếp không có state)
 */

import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Eye, EyeOff, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { authService } from '@/services'

/**
 * Component trang Đặt Lại Mật Khẩu
 *
 * Kết hợp form nhập OTP (6 ô input riêng biệt) và form nhập mật khẩu mới
 * trong cùng một giao diện. Hỗ trợ toggle hiển thị/ẩn mật khẩu mới.
 *
 * @returns Giao diện đặt lại mật khẩu gồm ô nhập OTP và ô nhập mật khẩu mới
 */
export default function ResetPasswordPage() {
  // Mảng 6 phần tử lưu từng chữ số của mã OTP
  const [otp, setOtp] = useState(['', '', '', '', '', ''])

  // Mật khẩu mới do người dùng nhập (tối thiểu 6 ký tự)
  const [newPassword, setNewPassword] = useState('')

  // Trạng thái hiển thị/ẩn mật khẩu mới
  const [showPassword, setShowPassword] = useState(false)

  // Trạng thái loading khi gửi request API
  const [loading, setLoading] = useState(false)

  // Mảng refs cho 6 ô input OTP, dùng để quản lý focus
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Hook điều hướng
  const navigate = useNavigate()
  // Hook lấy thông tin được truyền qua state từ trang trước (ForgotPasswordPage)
  const location = useLocation()
  // Lấy email từ state, nếu không có thì dùng chuỗi rỗng
  const email = (location.state as any)?.email || ''

  /**
   * Bảo vệ trang khỏi truy cập trực tiếp
   *
   * Nếu người dùng truy cập /reset-password mà không có email trong state
   * (truy cập trực tiếp URL hoặc refresh trang), tự động chuyển hướng về
   * /forgot-password - bước đầu tiên của quy trình khôi phục mật khẩu.
   */
  useEffect(() => {
    if (!email) navigate('/forgot-password')
  }, [email, navigate])

  /**
   * Xử lý thay đổi giá trị trong một ô OTP
   *
   * Chỉ cho phép nhập chữ số. Sau khi nhập một ký tự, tự động
   * chuyển focus sang ô tiếp theo (nếu chưa phải ô cuối cùng).
   *
   * @param index - Vị trí ô input trong mảng (0-5)
   * @param value - Giá trị người dùng vừa nhập
   */
  const handleOtpChange = (index: number, value: string) => {
    // Chỉ cho phép ký tự số (0-9)
    if (!/^\d*$/.test(value)) return
    const newOtp = [...otp]
    // Chỉ lấy ký tự cuối cùng nếu người dùng nhập nhiều ký tự
    newOtp[index] = value.slice(-1)
    setOtp(newOtp)
    // Tự động focus sang ô tiếp theo nếu có giá trị và chưa phải ô cuối
    if (value && index < 5) inputRefs.current[index + 1]?.focus()
  }

  /**
   * Xử lý sự kiện phím trong ô OTP
   *
   * Khi người dùng nhấn Backspace trên một ô trống,
   * tự động chuyển focus về ô trước đó để xóa.
   *
   * @param index - Vị trí ô input hiện tại
   * @param e - Sự kiện bàn phím
   */
  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent) => {
    // Nếu nhấn Backspace trên ô trống và không phải ô đầu tiên -> lùi focus
    if (e.key === 'Backspace' && !otp[index] && index > 0) inputRefs.current[index - 1]?.focus()
  }

  /**
   * Xử lý đặt lại mật khẩu
   *
   * Kiểm tra mã OTP đủ 6 số và mật khẩu mới đủ tối thiểu 6 ký tự.
   * Sau đó gọi API resetPassword để cập nhật mật khẩu mới cho tài khoản.
   * Nếu thành công, chuyển hướng về trang đăng nhập để người dùng
   * đăng nhập với mật khẩu mới.
   *
   * @param e - Sự kiện submit form
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Gộp mảng 6 phần tử thành chuỗi OTP
    const code = otp.join('')
    // Kiểm tra mã OTP đủ 6 chữ số
    if (code.length < 6) { toast.error('Vui lòng nhập đủ 6 số OTP'); return }
    // Kiểm tra mật khẩu mới đủ độ dài tối thiểu
    if (newPassword.length < 6) { toast.error('Mật khẩu phải có ít nhất 6 ký tự'); return }
    setLoading(true)
    try {
      // Gọi API đặt lại mật khẩu với email, OTP và mật khẩu mới
      await authService.resetPassword({ email, otp: code, new_password: newPassword })
      toast.success('Đổi mật khẩu thành công!')
      // Chuyển hướng về trang đăng nhập để người dùng đăng nhập với mật khẩu mới
      navigate('/login')
    } catch (err: any) {
      // Hiển thị lỗi từ server hoặc thông báo mặc định
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Không thể đổi mật khẩu')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 bg-gradient-to-br from-primary/5 via-background to-green-500/5">
      {/* Container chính với hiệu ứng fade-in + slide-up */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        {/* Liên kết quay lại trang đăng nhập */}
        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="size-4" /> Quay lại đăng nhập
        </Link>
        {/* Card chứa form đặt lại mật khẩu */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-lg">
          <h2 className="text-lg font-semibold mb-4">Đặt lại mật khẩu</h2>
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              {/* Phần nhập mã OTP - 6 ô input xếp hàng ngang */}
              <div>
                <label className="block text-sm font-medium mb-1.5">Mã OTP</label>
                <div className="flex items-center justify-center gap-2">
                  {otp.map((digit, i) => (
                    <input key={i} ref={el => { inputRefs.current[i] = el }}
                      type="text" inputMode="numeric" maxLength={1} value={digit}
                      onChange={e => handleOtpChange(i, e.target.value)}
                      onKeyDown={e => handleOtpKeyDown(i, e)}
                      className="w-12 h-14 text-center text-xl font-bold rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                    />
                  ))}
                </div>
              </div>
              {/* Phần nhập mật khẩu mới - có nút toggle hiển thị/ẩn */}
              <div>
                <label className="block text-sm font-medium mb-1.5">Mật khẩu mới</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input type={showPassword ? 'text' : 'password'} value={newPassword} onChange={e => setNewPassword(e.target.value)} required minLength={6}
                    className="w-full h-11 pl-10 pr-12 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                    placeholder="••••••••" />
                  {/* Nút toggle hiển thị/ẩn mật khẩu */}
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>
              {/* Nút submit - hiển thị loading spinner khi đang gửi request */}
              <Button type="submit" loading={loading} className="w-full" size="lg">Đổi mật khẩu</Button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  )
}
