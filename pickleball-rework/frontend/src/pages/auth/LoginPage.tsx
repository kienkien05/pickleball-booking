import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sun, Moon, Eye, EyeOff, Mail, Lock, User, Phone } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/authStore'
import { useThemeStore } from '@/stores/themeStore'
import { authService } from '@/services'

export default function LoginPage() {
  const [step, setStep] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [phoneNumber, setPhoneNumber] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()
  const { theme, toggleTheme } = useThemeStore()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await authService.login({ email, password })
      if (data.data?.token) {
        useAuthStore.getState().login({ token: data.data.token, user: data.data.user })
        toast.success('Đăng nhập thành công!')
        navigate(data.data.user.role === 'admin' ? '/admin' : '/')
      } else {
        navigate('/verify-otp', { state: { email, type: 'login' } })
        toast.info('Vui lòng nhập mã OTP đã gửi vào email')
      }
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Email hoặc mật khẩu không đúng')
    } finally { setLoading(false) }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await authService.register({ email, password, full_name: fullName, phone_number: phoneNumber })
      navigate('/verify-otp', { state: { email, password, full_name: fullName, type: 'register' } })
      toast.info('Vui lòng nhập mã OTP đã gửi vào email')
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Đăng ký thất bại')
    } finally { setLoading(false) }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 bg-gradient-to-br from-primary/5 via-background to-green-500/5">
      <div className="absolute top-4 right-4">
        <Button variant="ghost" size="icon" onClick={toggleTheme} className="rounded-full hover:bg-muted/50">
          {theme === 'dark' ? <Sun className="size-5" /> : <Moon className="size-5" />}
        </Button>
      </div>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="size-16 mx-auto rounded-2xl bg-primary/10 flex items-center justify-center mb-3">
            <span className="text-3xl">🏓</span>
          </div>
          <h1 className="text-2xl font-bold">PickleBall</h1>
          <p className="mt-2 text-muted-foreground">
            {step === 'login' ? 'Đăng nhập vào tài khoản' : 'Tạo tài khoản mới'}
          </p>
        </div>

        <div className="bg-card border border-border rounded-2xl p-6 shadow-lg">
          <form onSubmit={step === 'login' ? handleLogin : handleRegister}>
            <div className="space-y-4">
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

              <div>
                <label className="block text-sm font-medium mb-1.5">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    className="w-full h-11 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                    placeholder="email@example.com" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5">Mật khẩu</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <input type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={6}
                    className="w-full h-11 pl-10 pr-12 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all"
                    placeholder="••••••••" />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {step === 'login' && (
                <div className="text-right">
                  <Link to="/forgot-password" className="text-sm text-primary hover:underline">Quên mật khẩu?</Link>
                </div>
              )}

              <Button type="submit" loading={loading} className="w-full" size="lg">
                {step === 'login' ? 'Đăng nhập' : 'Đăng ký'}
              </Button>
            </div>
          </form>

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
