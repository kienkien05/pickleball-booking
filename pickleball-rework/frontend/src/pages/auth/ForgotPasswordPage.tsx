import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Mail } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { authService } from '@/services'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await authService.forgotPassword(email)
      setSent(true)
      toast.success('Mã OTP đã được gửi vào email của bạn')
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Không thể gửi mã OTP')
    } finally { setLoading(false) }
  }

  if (sent) {
    return (
      <div className="min-h-screen relative flex items-center justify-center px-4 bg-gradient-to-br from-primary/5 via-background to-green-500/5">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md text-center">
          <div className="size-16 mx-auto rounded-full bg-success/10 flex items-center justify-center mb-4">
            <Mail className="size-8 text-success" />
          </div>
          <h2 className="text-xl font-bold">Kiểm tra email của bạn</h2>
          <p className="mt-2 text-muted-foreground">Chúng tôi đã gửi mã OTP đến {email}</p>
          <Button className="mt-6" onClick={() => navigate('/reset-password', { state: { email } })}>Tiếp tục</Button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center px-4 bg-gradient-to-br from-primary/5 via-background to-green-500/5">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <Link to="/login" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-8">
          <ArrowLeft className="size-4" /> Quay lại đăng nhập
        </Link>
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
              <Button type="submit" loading={loading} className="w-full" size="lg">Gửi mã xác nhận</Button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  )
}
