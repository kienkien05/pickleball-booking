/**
 * Trang Xác Thực OTP
 *
 * Xác thực mã OTP 6 chữ số được gửi qua email để hoàn tất quá trình
 * đăng nhập hoặc đăng ký tài khoản. Trang này là bước trung gian được
 * chuyển hướng đến từ LoginPage hoặc RegisterPage khi server yêu cầu
 * xác thực hai yếu tố (2FA) qua email.
 *
 * Trang nhận thông tin từ `location.state`, bao gồm:
 *   - email: Email người dùng đã nhập ở bước trước
 *   - type: Phân biệt luồng 'login' (xác thực đăng nhập) hay 'register' (xác thực đăng ký)
 *   - password: Mật khẩu (chỉ có khi type='register', dùng để tạo tài khoản)
 *   - full_name: Họ tên (chỉ có khi type='register')
 *
 * Luồng xác thực đăng nhập:
 *   1. Người dùng nhập mã OTP 6 số.
 *   2. Gọi API `authService.verifyLogin()`.
 *   3. Lưu token vào authStore, chuyển hướng (admin -> /admin, user -> /).
 *
 * Luồng xác thực đăng ký:
 *   1. Người dùng nhập mã OTP 6 số.
 *   2. Gọi API `authService.verifyRegister()` với đầy đủ thông tin đăng ký.
 *   3. Lưu token vào authStore, chuyển hướng về /.
 *
 * Bảo vệ trang: nếu không có email trong state, tự động chuyển hướng về /login.
 *
 * Điều hướng:
 *   - /login (nếu truy cập trực tiếp không có state)
 *   - / hoặc /admin (sau khi xác thực thành công)
 */

import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/authStore'
import { authService } from '@/services'

/**
 * Component trang Xác Thực OTP
 *
 * Giao diện gồm 6 ô input riêng biệt để nhập mã OTP 6 chữ số.
 * Hỗ trợ nhập liệu nhanh: tự động chuyển focus sang ô tiếp theo,
 * xóa lùi, và dán mã OTP từ clipboard.
 *
 * @returns Giao diện nhập mã OTP với 6 ô input và nút xác nhận
 */
export default function OTPVerifyPage() {
  // Mảng 6 phần tử lưu từng chữ số của mã OTP
  const [otp, setOtp] = useState(['', '', '', '', '', ''])

  // Trạng thái loading khi gửi request API
  const [loading, setLoading] = useState(false)

  // Countdown 30 giây trước khi cho phép gửi lại OTP
  const [countdown, setCountdown] = useState(30)
  const [resending, setResending] = useState(false)

  // Mảng refs cho 6 ô input, dùng để quản lý focus
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])

  // Hook điều hướng
  const navigate = useNavigate()
  // Hook lấy thông tin được truyền qua state từ trang trước
  const location = useLocation()
  // Ép kiểu state từ location, chứa email, password, full_name, type
  const state = location.state as { email?: string; password?: string; full_name?: string; type?: 'login' | 'register'; redirect?: string } | null

  /**
   * Bảo vệ trang khỏi truy cập trực tiếp
   *
   * Nếu người dùng truy cập /verify-otp mà không có email trong state
   * (truy cập trực tiếp URL hoặc refresh trang), tự động chuyển hướng về /login.
   */
  useEffect(() => {
    if (!state?.email) navigate('/login')
  }, [state, navigate])

  // Countdown timer: giảm mỗi giây, dừng khi về 0
  useEffect(() => {
    if (countdown <= 0) return
    const timer = setInterval(() => setCountdown(c => c - 1), 1000)
    return () => clearInterval(timer)
  }, [countdown])

  /**
   * Gửi lại mã OTP mới
   */
  const handleResend = async () => {
    if (!state?.email || !state?.type) return
    setResending(true)
    try {
      const resendType = state.type === 'register' ? 'register' : 'reset'
      await authService.resendOtp({ email: state.email, type: resendType })
      toast.success('Đã gửi lại mã OTP mới (kiểm tra console)')
      setCountdown(30)
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Gửi lại mã OTP thất bại')
    } finally { setResending(false) }
  }

  /**
   * Xử lý thay đổi giá trị trong một ô OTP
   *
   * Chỉ cho phép nhập chữ số. Sau khi nhập một ký tự, tự động
   * chuyển focus sang ô tiếp theo (nếu chưa phải ô cuối cùng).
   *
   * @param index - Vị trí ô input trong mảng (0-5)
   * @param value - Giá trị người dùng vừa nhập
   */
  const handleChange = (index: number, value: string) => {
    // Chỉ cho phép ký tự số (0-9)
    if (!/^\d*$/.test(value)) return
    setOtp(prev => {
      const newOtp = [...prev]
      newOtp[index] = value.slice(-1)
      return newOtp
    })
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
  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    // Nếu nhấn Backspace trên ô trống và không phải ô đầu tiên -> lùi focus
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  /**
   * Xử lý dán mã OTP từ clipboard
   *
   * Cho phép người dùng dán toàn bộ mã OTP 6 số thay vì nhập từng số.
   * Chỉ lấy các ký tự số từ clipboard, giới hạn tối đa 6 ký tự.
   * Sau khi dán, focus vào ô cuối cùng đã được điền.
   *
   * @param e - Sự kiện paste từ clipboard
   */
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    // Lấy text từ clipboard, chỉ giữ lại chữ số (loại bỏ khoảng trắng, dấu cách,...)
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    const newOtp = [...otp]
    // Điền từng chữ số vào các ô tương ứng
    pasted.split('').forEach((char, i) => { if (i < 6) newOtp[i] = char })
    setOtp(newOtp)
    // Focus vào ô tiếp theo sau chữ số cuối cùng được dán
    const nextIdx = Math.min(pasted.length, 5)
    inputRefs.current[nextIdx]?.focus()
  }

  /**
   * Xác thực mã OTP và hoàn tất đăng nhập/đăng ký
   *
   * Gộp 6 chữ số thành chuỗi OTP, kiểm tra đủ 6 số, sau đó gọi API
   * tương ứng với loại xác thực (login hoặc register).
   *
   * @param e - Sự kiện submit form
   */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    // Gộp mảng 6 phần tử thành chuỗi OTP
    const code = otp.join('')
    // Kiểm tra mã OTP đủ 6 chữ số
    if (code.length < 6) { toast.error('Vui lòng nhập đủ 6 số OTP'); return }
    // Kiểm tra có email trong state không (bảo vệ an toàn)
    if (!state?.email) return

    setLoading(true)
    try {
      // Phân biệt luồng xác thực đăng ký và đăng nhập
      if (state.type === 'register') {
        // Xác thực OTP cho đăng ký - gửi kèm thông tin tài khoản mới
        const { data } = await authService.verifyRegister({
          email: state.email,
          otp: code,
          password: state.password || '',
          full_name: state.full_name || '',
        })
        // Lưu token và thông tin user vào authStore
        useAuthStore.getState().login({ token: data.data.token, user: data.data.user })
        toast.success('Đăng ký thành công!')
        navigate(state.redirect || '/')
      } else {
        // Xác thực OTP cho đăng nhập - chỉ gửi email và OTP
        const { data } = await authService.verifyLogin({ email: state.email, otp: code })
        // Lưu token và thông tin user vào authStore
        useAuthStore.getState().login({ token: data.data.token, user: data.data.user })
        toast.success('Đăng nhập thành công!')
        // Nếu có redirect param thì quay lại trang đó, nếu không thì admin -> /admin, user -> /
        navigate(state.redirect || (data.data.user.role === 'admin' ? '/admin' : '/'))
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Mã OTP không chính xác')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 bg-gradient-to-br from-primary/5 via-background to-green-500/5">
      {/* Container chính với hiệu ứng fade-in + slide-up */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        {/* Card chứa form nhập OTP */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-lg text-center">
          <h2 className="text-lg font-semibold mb-2">Xác thực OTP</h2>
          {/* Hiển thị email đã nhập ở bước trước để người dùng xác nhận */}
          <p className="text-sm text-muted-foreground mb-6">Nhập mã 6 số đã gửi đến {state?.email}</p>
          <form onSubmit={handleSubmit}>
            {/* 6 ô input xếp hàng ngang, mỗi ô nhận 1 chữ số */}
            <div className="flex items-center justify-center gap-2 mb-6">
              {otp.map((digit, i) => (
                <input key={i} ref={el => { inputRefs.current[i] = el }}
                  type="text" inputMode="numeric" maxLength={1} value={digit}
                  onChange={e => handleChange(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  // Chỉ gắn sự kiện paste cho ô đầu tiên để tránh xung đột
                  onPaste={i === 0 ? handlePaste : undefined}
                  className="w-12 h-14 text-center text-xl font-bold rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                />
              ))}
            </div>
            {/* Nút xác nhận - hiển thị loading spinner khi đang gửi request */}
            <Button type="submit" loading={loading} className="w-full" size="lg">Xác nhận</Button>
          </form>

          {/* Gửi lại mã OTP với countdown 30 giây */}
          <div className="mt-4 pt-4 border-t border-border">
            {countdown > 0 ? (
              <p className="text-xs text-muted-foreground">
                Gửi lại mã sau <span className="font-bold text-foreground">{countdown}s</span>
              </p>
            ) : (
              <button
                onClick={handleResend}
                disabled={resending}
                className="text-sm text-primary hover:underline font-medium disabled:opacity-50"
              >
                {resending ? 'Đang gửi...' : 'Gửi lại mã OTP'}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  )
}
