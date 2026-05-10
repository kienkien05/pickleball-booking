import { useState, useRef, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/authStore'
import { authService } from '@/services'

export default function OTPVerifyPage() {
  const [otp, setOtp] = useState(['', '', '', '', '', ''])
  const [loading, setLoading] = useState(false)
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  const navigate = useNavigate()
  const location = useLocation()
  const state = location.state as { email?: string; password?: string; full_name?: string; type?: 'login' | 'register' } | null

  useEffect(() => {
    if (!state?.email) navigate('/login')
  }, [state, navigate])

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const newOtp = [...otp]
    newOtp[index] = value.slice(-1)
    setOtp(newOtp)
    if (value && index < 5) inputRefs.current[index + 1]?.focus()
  }

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    const newOtp = [...otp]
    pasted.split('').forEach((char, i) => { if (i < 6) newOtp[i] = char })
    setOtp(newOtp)
    const nextIdx = Math.min(pasted.length, 5)
    inputRefs.current[nextIdx]?.focus()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = otp.join('')
    if (code.length < 6) { toast.error('Vui lòng nhập đủ 6 số OTP'); return }
    if (!state?.email) return

    setLoading(true)
    try {
      if (state.type === 'register') {
        const { data } = await authService.verifyRegister({
          email: state.email,
          otp: code,
          password: state.password || '',
          full_name: state.full_name || '',
        })
        useAuthStore.getState().login({ token: data.data.token, user: data.data.user })
        toast.success('Đăng ký thành công!')
        navigate('/')
      } else {
        const { data } = await authService.verifyLogin({ email: state.email, otp: code })
        useAuthStore.getState().login({ token: data.data.token, user: data.data.user })
        toast.success('Đăng nhập thành công!')
        navigate(data.data.user.role === 'admin' ? '/admin' : '/')
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Mã OTP không chính xác')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 bg-gradient-to-br from-primary/5 via-background to-green-500/5">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="bg-card border border-border rounded-2xl p-6 shadow-lg text-center">
          <h2 className="text-lg font-semibold mb-2">Xác thực OTP</h2>
          <p className="text-sm text-muted-foreground mb-6">Nhập mã 6 số đã gửi đến {state?.email}</p>
          <form onSubmit={handleSubmit}>
            <div className="flex items-center justify-center gap-2 mb-6">
              {otp.map((digit, i) => (
                <input key={i} ref={el => { inputRefs.current[i] = el }}
                  type="text" inputMode="numeric" maxLength={1} value={digit}
                  onChange={e => handleChange(i, e.target.value)}
                  onKeyDown={e => handleKeyDown(i, e)}
                  onPaste={i === 0 ? handlePaste : undefined}
                  className="w-12 h-14 text-center text-xl font-bold rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                />
              ))}
            </div>
            <Button type="submit" loading={loading} className="w-full" size="lg">Xác nhận</Button>
          </form>
        </div>
      </motion.div>
    </div>
  )
}
