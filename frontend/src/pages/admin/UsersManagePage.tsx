/**
 * UsersManagePage.tsx
 *
 * Trang quản lý khách hàng / người dùng dành cho admin.
 * Chức năng chính:
 * - Hiển thị danh sách người dùng hệ thống (dạng card).
 * - Tìm kiếm người dùng theo tên, email, số điện thoại.
 * - Xem thông tin cơ bản: tên, email, SĐT, vai trò, trạng thái, VIP.
 * - Xem thống kê đặt sân của người dùng (tổng đơn, hoàn thành, đã hủy).
 * - Khóa/Mở khóa tài khoản người dùng (toggle trạng thái Active/Locked).
 * - Bật/Tắt trạng thái VIP cho người dùng.
 *
 * Sử dụng React Query để cache danh sách người dùng và tự động làm mới
 * sau khi thay đổi trạng thái/VIP.
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Lock, Unlock, Star, StarOff } from 'lucide-react'
import { toast } from 'sonner'
import { adminService } from '@/services'
import { Button } from '@/components/ui/Button'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatDate } from '@/lib/utils'

/**
 * Component trang quản lý người dùng.
 * Cho phép admin tìm kiếm, khóa/mở khóa, và bật/tắt VIP cho người dùng.
 *
 * @returns Giao diện danh sách người dùng dạng card kèm các nút thao tác.
 */
export default function UsersManagePage() {
  /** Từ khóa tìm kiếm người dùng (tên, email, SĐT) */
  const [search, setSearch] = useState('')
  /** ID của người dùng đang được chọn để thay đổi trạng thái/VIP (null = không có modal) */
  const [toggleId, setToggleId] = useState<string | null>(null)
  /**
   * Loại thao tác đang thực hiện:
   * - 'status': khóa hoặc mở khóa tài khoản.
   * - 'vip': bật hoặc tắt trạng thái VIP.
   * - null: không có thao tác nào đang chờ xác nhận.
   */
  const [toggleType, setToggleType] = useState<'status' | 'vip' | null>(null)
  const queryClient = useQueryClient()

  /**
   * Lấy danh sách người dùng từ API admin.
   * Query key bao gồm `search` để cache riêng cho từng từ khóa tìm kiếm.
   * `search` undefined khi rỗng -> API trả về tất cả người dùng.
   */
  const { data: usersData, isLoading } = useQuery({
    queryKey: ['admin', 'users', search],
    queryFn: () => adminService.getUsers({ search: search || undefined, limit: 100 }).then(r => r.data.data ?? r.data ?? []),
  })
  /** Chuẩn hóa thành mảng người dùng */
  const users = Array.isArray(usersData) ? usersData : usersData?.users ?? []

  /**
   * Mutation thay đổi trạng thái hoặc VIP của người dùng.
   * - type = 'status': gọi API toggleUserStatus (khóa/mở khóa).
   * - type = 'vip': gọi API toggleVip (bật/tắt VIP).
   * Sau khi thành công: đóng modal và làm mới danh sách người dùng.
   */
  const toggleMutation = useMutation({
    mutationFn: ({ id, type }: { id: string; type: string }) =>
      type === 'status' ? adminService.toggleUserStatus(id) : adminService.toggleVip(id),
    onSuccess: (_, { type }) => {
      toast.success(type === 'status' ? 'Đã thay đổi trạng thái!' : 'Đã thay đổi VIP!')
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      setToggleId(null); setToggleType(null)
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Thao tác thất bại'),
  })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Quản lý khách hàng</h1>

      {/* Thanh tìm kiếm người dùng */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Tìm theo tên, email, SĐT..." className="w-full h-11 pl-10 pr-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" />
      </div>

      {/* Loading skeleton */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        /* Danh sách người dùng dạng card */
        <div className="space-y-3">
          {users.map((u: any) => (
            <div key={u.id} className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Thông tin cơ bản của người dùng */}
              <div>
                {/* Tên người dùng - hỗ trợ cả full_name và hoTen */}
                <p className="font-semibold">{u.full_name || u.hoTen}</p>
                {/* Email và số điện thoại */}
                <p className="text-sm text-muted-foreground">{u.email} • {u.phone_number || u.soDienThoai}</p>
                {/* Thống kê đặt sân (nếu có) */}
                <div className="flex items-center gap-2 mt-1">
                  {u.stats && (
                    <span className="text-xs text-muted-foreground">
                      Đặt: {u.stats.totalBookings} • HT: {u.stats.completedBookings} • Hủy: {u.stats.cancelledBookings}
                    </span>
                  )}
                </div>
                {/* Badge vai trò, trạng thái, và VIP */}
                <div className="flex items-center gap-2 mt-1">
                  {/* Badge vai trò (Admin hoặc User) */}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.vaiTro === 'Admin' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {u.vaiTro || u.role}
                  </span>
                  {/* Badge trạng thái (Active hoặc Locked) */}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${(u.trangThai || u.is_active) !== false && (u.trangThai || 'Active') !== 'Locked' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                    {(u.trangThai || u.is_active) !== false && (u.trangThai || 'Active') !== 'Locked' ? 'Active' : 'Locked'}
                  </span>
                  {/* Badge VIP - chỉ hiển thị nếu người dùng là VIP */}
                  {(u.isVIP || u.is_vip) && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600">VIP</span>
                  )}
                </div>
              </div>
              {/* Các nút thao tác */}
              <div className="flex items-center gap-2">
                {/* Nút bật/tắt VIP */}
                <Button variant="outline" size="sm" onClick={() => { setToggleId(u.id); setToggleType('vip') }}>
                  {(u.isVIP || u.is_vip) ? <StarOff className="size-3 mr-1" /> : <Star className="size-3 mr-1" />}
                  {(u.isVIP || u.is_vip) ? 'Tắt VIP' : 'Bật VIP'}
                </Button>
                {/* Nút khóa/mở khóa - màu sắc thay đổi theo trạng thái hiện tại */}
                <Button variant={((u.trangThai || u.is_active) !== false && (u.trangThai || 'Active') !== 'Locked') ? 'destructive' : 'success'} size="sm"
                  onClick={() => { setToggleId(u.id); setToggleType('status') }}>
                  {((u.trangThai || u.is_active) !== false && (u.trangThai || 'Active') !== 'Locked') ? <Lock className="size-3 mr-1" /> : <Unlock className="size-3 mr-1" />}
                  {((u.trangThai || u.is_active) !== false && (u.trangThai || 'Active') !== 'Locked') ? 'Khóa' : 'Mở khóa'}
                </Button>
              </div>
            </div>
          ))}
          {/* Trạng thái rỗng khi không tìm thấy kết quả */}
          {users.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">Không tìm thấy khách hàng nào</div>
          )}
        </div>
      )}

      {/* Modal xác nhận trước khi khóa/mở khóa hoặc bật/tắt VIP */}
      <Modal isOpen={!!toggleId} onClose={() => { setToggleId(null); setToggleType(null) }} title="Xác nhận" size="sm">
        <p className="text-sm">Bạn có chắc chắn muốn thực hiện thao tác này?</p>
        <ModalFooter>
          <Button variant="outline" onClick={() => { setToggleId(null); setToggleType(null) }}>Hủy</Button>
          <Button onClick={() => toggleId && toggleType && toggleMutation.mutate({ id: toggleId, type: toggleType })}
            loading={toggleMutation.isPending}>Xác nhận</Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
