import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { User, Mail, Phone, MapPin, LogOut, Camera } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/authStore'
import { authService, uploadService } from '@/services'

export default function ProfilePage() {
  const { user, updateUser, logout } = useAuthStore()
  const navigate = useNavigate()
  const [fullName, setFullName] = useState(user?.full_name || '')
  const [phoneNumber, setPhoneNumber] = useState(user?.phone_number || '')
  const [address, setAddress] = useState(user?.address || '')
  const [avatarUploading, setAvatarUploading] = useState(false)

  const updateMutation = useMutation({
    mutationFn: (data: Record<string, any>) => authService.updateProfile(data),
    onSuccess: (res) => {
      updateUser(res.data.data ?? res.data)
      toast.success('Cập nhật thông tin thành công!')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Cập nhật thất bại')
    },
  })

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarUploading(true)
    try {
      const { data } = await uploadService.upload(file, 'avatars')
      const avatarUrl = data.data?.url ?? data.url
      await authService.updateProfile({ avatar_url: avatarUrl })
      updateUser({ avatar_url: avatarUrl })
      toast.success('Cập nhật ảnh đại diện thành công!')
    } catch (err: any) {
      toast.error('Tải ảnh lên thất bại')
    } finally { setAvatarUploading(false) }
  }

  const handleSave = () => {
    updateMutation.mutate({ full_name: fullName, phone_number: phoneNumber, address })
  }

  const handleLogout = () => { logout(); navigate('/') }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Avatar */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="size-24 rounded-full overflow-hidden border-2 border-border bg-muted flex items-center justify-center">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt={user.full_name} className="size-full object-cover" />
              ) : (
                <User className="size-10 text-muted-foreground" />
              )}
            </div>
            <label className="absolute bottom-0 right-0 size-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-colors">
              <Camera className="size-4" />
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={avatarUploading} />
            </label>
          </div>
          {avatarUploading && <p className="text-sm text-muted-foreground">Đang tải ảnh lên...</p>}
        </div>

        {/* Info */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">Thông tin cá nhân</h2>

          <div>
            <label className="block text-sm font-medium mb-1.5">Email</label>
            <div className="flex items-center gap-3 h-11 px-4 rounded-lg border border-input bg-muted/50 text-muted-foreground">
              <Mail className="size-4" />
              <span>{user?.email}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Họ và tên</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                className="w-full h-11 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Số điện thoại</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input type="tel" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)}
                className="w-full h-11 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Địa chỉ</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                className="w-full h-11 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all" />
            </div>
          </div>

          {user?.is_vip && (
            <div className="px-3 py-2 rounded-lg bg-amber-500/10 text-amber-600 text-sm font-medium">
              Khách hàng VIP - Được hưởng đặc quyền tự động đặt lịch
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button onClick={handleSave} loading={updateMutation.isPending} className="flex-1">Lưu thay đổi</Button>
            <Button variant="outline" onClick={handleLogout} className="gap-2">
              <LogOut className="size-4" /> Đăng xuất
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
