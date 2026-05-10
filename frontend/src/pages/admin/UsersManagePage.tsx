import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, Lock, Unlock, Star, StarOff } from 'lucide-react'
import { toast } from 'sonner'
import { adminService } from '@/services'
import { Button } from '@/components/ui/Button'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatDate } from '@/lib/utils'

export default function UsersManagePage() {
  const [search, setSearch] = useState('')
  const [toggleId, setToggleId] = useState<string | null>(null)
  const [toggleType, setToggleType] = useState<'status' | 'vip' | null>(null)
  const queryClient = useQueryClient()

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['admin', 'users', search],
    queryFn: () => adminService.getUsers({ search: search || undefined, limit: 100 }).then(r => r.data.data ?? r.data ?? []),
  })
  const users = Array.isArray(usersData) ? usersData : usersData?.users ?? []

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

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Tìm theo tên, email, SĐT..." className="w-full h-11 pl-10 pr-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" />
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <div className="space-y-3">
          {users.map((u: any) => (
            <div key={u.id} className="rounded-xl border border-border bg-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="font-semibold">{u.full_name || u.hoTen}</p>
                <p className="text-sm text-muted-foreground">{u.email} • {u.phone_number || u.soDienThoai}</p>
                <div className="flex items-center gap-2 mt-1">
                  {u.stats && (
                    <span className="text-xs text-muted-foreground">
                      Đặt: {u.stats.totalBookings} • HT: {u.stats.completedBookings} • Hủy: {u.stats.cancelledBookings}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.vaiTro === 'Admin' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
                    {u.vaiTro || u.role}
                  </span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${(u.trangThai || u.is_active) !== false && (u.trangThai || 'Active') !== 'Locked' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                    {(u.trangThai || u.is_active) !== false && (u.trangThai || 'Active') !== 'Locked' ? 'Active' : 'Locked'}
                  </span>
                  {(u.isVIP || u.is_vip) && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/10 text-amber-600">VIP</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => { setToggleId(u.id); setToggleType('vip') }}>
                  {(u.isVIP || u.is_vip) ? <StarOff className="size-3 mr-1" /> : <Star className="size-3 mr-1" />}
                  {(u.isVIP || u.is_vip) ? 'Tắt VIP' : 'Bật VIP'}
                </Button>
                <Button variant={((u.trangThai || u.is_active) !== false && (u.trangThai || 'Active') !== 'Locked') ? 'destructive' : 'success'} size="sm"
                  onClick={() => { setToggleId(u.id); setToggleType('status') }}>
                  {((u.trangThai || u.is_active) !== false && (u.trangThai || 'Active') !== 'Locked') ? <Lock className="size-3 mr-1" /> : <Unlock className="size-3 mr-1" />}
                  {((u.trangThai || u.is_active) !== false && (u.trangThai || 'Active') !== 'Locked') ? 'Khóa' : 'Mở khóa'}
                </Button>
              </div>
            </div>
          ))}
          {users.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">Không tìm thấy khách hàng nào</div>
          )}
        </div>
      )}

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
