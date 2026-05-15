/**
 * Trang Hồ Sơ Người Dùng (ProfilePage)
 * ====================================
 * @purpose Trang quản lý thông tin cá nhân của người dùng, cho phép:
 *   - Xem và chỉnh sửa họ tên, số điện thoại, địa chỉ
 *   - Cập nhật ảnh đại diện (upload file ảnh)
 *   - Xem thông tin email (read-only, không thể thay đổi)
 *   - Hiển thị trạng thái VIP (nếu có)
 *   - Đăng xuất khỏi tài khoản
 *
 * @route /profile
 * @access Người dùng đã đăng nhập
 *
 * @businessLogic
 *   - Email không thể chỉnh sửa (trường readonly)
 *   - Ảnh đại diện upload qua uploadService, sau đó cập nhật avatar_url vào profile
 *   - Thông tin profile được lưu trong authStore (Zustand), đồng bộ sau mỗi lần cập nhật
 *   - Người dùng VIP có thông báo đặc quyền riêng
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { User, Mail, Phone, MapPin, LogOut, Camera } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/Button'
import { useAuthStore } from '@/stores/authStore'
import { authService, uploadService } from '@/services'

/**
 * Trang hồ sơ người dùng
 * @description Component cho phép người dùng xem và chỉnh sửa thông tin cá nhân,
 *   upload ảnh đại diện, xem trạng thái VIP và đăng xuất
 * @returns Giao diện trang hồ sơ cá nhân
 */
export default function ProfilePage() {
  // Lấy thông tin user, hàm cập nhật user, và hàm logout từ authStore (Zustand)
  const { user, updateUser, logout } = useAuthStore()
  const navigate = useNavigate()

  // state lưu giá trị các trường trong form (khởi tạo từ dữ liệu user hiện tại)
  const [fullName, setFullName] = useState(user?.full_name || '')        // Họ và tên
  const [phoneNumber, setPhoneNumber] = useState(user?.phone_number || '') // Số điện thoại
  const [address, setAddress] = useState(user?.address || '')             // Địa chỉ
  const [avatarUploading, setAvatarUploading] = useState(false)            // Trạng thái đang upload ảnh

  /**
   * Mutation cập nhật thông tin profile (họ tên, sđt, địa chỉ)
   * @description Gọi API update profile, sau đó đồng bộ dữ liệu mới vào authStore
   * @onSuccess Cập nhật store và hiển thị toast thành công
   * @onError Hiển thị thông báo lỗi từ server
   */
  const updateMutation = useMutation({
    mutationFn: (data: Record<string, any>) => authService.updateProfile(data),
    onSuccess: (res) => {
      // Cập nhật lại user trong store để UI đồng bộ ngay lập tức
      updateUser(res.data.data ?? res.data)
      toast.success('Cập nhật thông tin thành công!')
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || 'Cập nhật thất bại')
    },
  })

  /**
   * Xử lý upload ảnh đại diện khi người dùng chọn file
   * @description Upload file ảnh lên server, lấy URL, rồi cập nhật avatar_url vào profile
   * @param e Sự kiện onChange từ input file
   * @logic
   *   1. Lấy file đầu tiên từ input
   *   2. Gọi uploadService.upload(file, 'avatars') để upload lên thư mục avatars
   *   3. Lấy URL ảnh từ response
   *   4. Gọi authService.updateProfile để lưu avatar_url mới
   *   5. Cập nhật user trong store
   * @errorHandling Hiển thị toast lỗi nếu upload hoặc cập nhật thất bại
   */
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setAvatarUploading(true)
    try {
      // Upload file ảnh lên thư mục 'avatars'
      const { data } = await uploadService.upload(file, 'avatars')
      // Lấy URL ảnh từ response
      const avatarUrl = data.data?.url ?? data.url
      // Cập nhật avatar_url trong profile
      await authService.updateProfile({ avatar_url: avatarUrl })
      // Đồng bộ vào store để hiển thị ảnh mới ngay
      updateUser({ avatar_url: avatarUrl })
      toast.success('Cập nhật ảnh đại diện thành công!')
    } catch (err: any) {
      toast.error('Tải ảnh lên thất bại')
    } finally { setAvatarUploading(false) }
  }

  /**
   * Lưu thông tin profile (họ tên, sđt, địa chỉ)
   * @description Gọi mutation updateProfile với dữ liệu từ form
   */
  const handleSave = () => {
    updateMutation.mutate({ full_name: fullName, phone_number: phoneNumber, address })
  }

  /**
   * Đăng xuất tài khoản
   * @description Gọi logout() từ authStore để xóa token/phiên, sau đó chuyển về trang chủ
   */
  const handleLogout = () => { logout(); navigate('/') }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Animation fade-in + slide-up khi vào trang */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Khu vực Avatar: hiển thị ảnh đại diện + nút upload */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            {/* Khung avatar hình tròn */}
            <div className="size-24 rounded-full overflow-hidden border-2 border-border bg-muted flex items-center justify-center">
              {user?.avatar_url ? (
                // Nếu có avatar_url thì hiển thị ảnh
                <img src={user.avatar_url} alt={user.full_name} className="size-full object-cover" />
              ) : (
                // Nếu chưa có avatar thì hiển thị icon User mặc định
                <User className="size-10 text-muted-foreground" />
              )}
            </div>
            {/* Nút upload ảnh: icon camera ở góc dưới-phải của avatar */}
            <label className="absolute bottom-0 right-0 size-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center cursor-pointer hover:bg-primary/90 transition-colors">
              <Camera className="size-4" />
              {/* Input file ẩn, chỉ chấp nhận file ảnh */}
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} disabled={avatarUploading} />
            </label>
          </div>
          {/* Thông báo trạng thái đang upload */}
          {avatarUploading && <p className="text-sm text-muted-foreground">Đang tải ảnh lên...</p>}
        </div>

        {/* Form thông tin cá nhân */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
          <h2 className="text-lg font-semibold">Thông tin cá nhân</h2>

          {/* Email: trường read-only, không cho phép chỉnh sửa */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Email</label>
            <div className="flex items-center gap-3 h-11 px-4 rounded-lg border border-input bg-muted/50 text-muted-foreground">
              <Mail className="size-4" />
              <span>{user?.email}</span>
            </div>
          </div>

          {/* Họ và tên: trường có thể chỉnh sửa, có icon User */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Họ và tên</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input type="text" value={fullName} onChange={e => setFullName(e.target.value)}
                className="w-full h-11 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all" />
            </div>
          </div>

          {/* Số điện thoại: trường có thể chỉnh sửa, có icon Phone */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Số điện thoại</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input type="tel" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)}
                className="w-full h-11 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all" />
            </div>
          </div>

          {/* Địa chỉ: trường có thể chỉnh sửa, có icon MapPin */}
          <div>
            <label className="block text-sm font-medium mb-1.5">Địa chỉ</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                className="w-full h-11 pl-10 pr-4 rounded-lg border border-input bg-background text-foreground focus:ring-2 focus:ring-ring focus:border-transparent outline-none transition-all" />
            </div>
          </div>

          {/* Thông báo VIP: chỉ hiển thị khi user có is_vip = true */}
          {user?.is_vip && (
            <div className="px-3 py-2 rounded-lg bg-amber-500/10 text-amber-600 text-sm font-medium">
              Khách hàng VIP - Được hưởng đặc quyền tự động đặt lịch
            </div>
          )}

          {/* Nút hành động: Lưu thay đổi + Đăng xuất */}
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
