import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, LogIn, LogOut, UserX, MoreHorizontal, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { bookingService } from '@/services'
import { Button } from '@/components/ui/Button'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice, formatDate, formatTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

const statusTabs = [
  { key: '', label: 'Tất cả' },
  { key: 'Đã thanh toán', label: 'Đã thanh toán' },
  { key: 'Đang sử dụng', label: 'Đang dùng' },
  { key: 'Hoàn thành', label: 'Hoàn thành' },
  { key: 'Đã hủy', label: 'Đã hủy' },
]

export default function BookingsManagePage() {
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFilter, setDateFilter] = useState(new Date().toISOString().slice(0, 10))
  const [search, setSearch] = useState('')
  const [selectedBooking, setSelectedBooking] = useState<any>(null)
  const [showActions, setShowActions] = useState(false)
  const [showDetail, setShowDetail] = useState(false)
  const [actionConfirm, setActionConfirm] = useState<'checkin' | 'checkout' | 'noshow' | null>(null)
  const queryClient = useQueryClient()

  const { data: bookingsData, isLoading } = useQuery({
    queryKey: ['admin', 'bookings', statusFilter, dateFilter],
    queryFn: () => bookingService.getAllBookings({ status: statusFilter || undefined, date: dateFilter, limit: 100 })
      .then(r => r.data.data ?? r.data ?? []),
  })
  const bookings = Array.isArray(bookingsData) ? bookingsData : bookingsData?.bookings ?? []

  const actionMutation = useMutation({
    mutationFn: ({ id, type }: { id: string; type: string }) => {
      if (type === 'checkin') return bookingService.checkIn(id)
      if (type === 'checkout') return bookingService.checkOut(id)
      return bookingService.markNoShow(id)
    },
    onSuccess: (_, { type }) => {
      toast.success(type === 'checkin' ? 'Check-in thành công!' : type === 'checkout' ? 'Check-out thành công!' : 'Đã hủy vắng mặt!')
      queryClient.invalidateQueries({ queryKey: ['admin', 'bookings'] })
      setShowActions(false); setActionConfirm(null); setSelectedBooking(null)
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Thao tác thất bại'),
  })

  const filtered = search ? bookings.filter((b: any) =>
    b.tenSan?.toLowerCase().includes(search.toLowerCase()) ||
    b.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    String(b.id).includes(search)
  ) : bookings

  const getActions = (b: any) => {
    const actions: { type: 'checkin' | 'checkout' | 'noshow'; label: string; icon: any; variant: any }[] = []
    if (b.trangThai === 'Đã thanh toán') {
      actions.push({ type: 'checkin', label: 'Check-in', icon: LogIn, variant: 'success' })
      actions.push({ type: 'noshow', label: 'Vắng mặt', icon: UserX, variant: 'destructive' })
    } else if (b.trangThai === 'Đang sử dụng') {
      actions.push({ type: 'checkout', label: 'Check-out', icon: LogOut, variant: 'default' })
    }
    return actions
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Quản lý đơn đặt sân</h1>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo tên sân, khách hàng..." className="w-full h-11 pl-10 pr-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" />
        </div>
        <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
          className="h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" />
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
        {statusTabs.map(tab => (
          <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
            className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === tab.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Khách hàng</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Sân</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Thời gian</th>
                <th className="text-left px-4 py-3 font-medium">Tổng tiền</th>
                <th className="text-left px-4 py-3 font-medium">Trạng thái</th>
                <th className="text-center px-4 py-3 font-medium w-16">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((booking: any) => {
                const actions = getActions(booking)
                return (
                  <tr key={booking.id} className="hover:bg-muted/30 cursor-pointer"
                    onClick={() => { setSelectedBooking(booking); setShowDetail(true) }}>
                    <td className="px-4 py-3 font-medium">{booking.full_name || `KH #${booking.nguoiDungId}`}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{booking.tenSan || `Sân #${booking.sanId}`}</td>
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      {booking.ngayChoi ? formatDate(booking.ngayChoi) : ''} {booking.gioBatDau ? formatTime(booking.gioBatDau) + '-' + formatTime(booking.gioKetThuc) : ''}
                    </td>
                    <td className="px-4 py-3">{formatPrice(Number(booking.tongTien || 0))}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        booking.trangThai === 'Đã thanh toán' ? 'bg-blue-500/10 text-blue-600' :
                        booking.trangThai === 'Đang sử dụng' ? 'bg-success/10 text-success' :
                        booking.trangThai === 'Hoàn thành' ? 'bg-muted text-muted-foreground' :
                        'bg-destructive/10 text-destructive'}`}>
                        {booking.trangThai}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      {actions.length > 0 && (
                        <Button variant="ghost" size="icon"
                          onClick={() => { setSelectedBooking(booking); setShowActions(true) }}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Không có đơn đặt sân nào</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail Modal */}
      <Modal isOpen={showDetail && !!selectedBooking} onClose={() => setShowDetail(false)} title={`Chi tiết đơn #${selectedBooking?.id}`}>
        {selectedBooking && (
          <div className="space-y-3 text-sm">
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-muted-foreground">Khách hàng</p><p className="font-medium">{selectedBooking.full_name}</p></div>
              <div><p className="text-muted-foreground">Email</p><p className="font-medium">{selectedBooking.email || '--'}</p></div>
              <div><p className="text-muted-foreground">Sân</p><p className="font-medium">{selectedBooking.tenSan}</p></div>
              <div><p className="text-muted-foreground">Ngày</p><p className="font-medium">{selectedBooking.ngayChoi ? formatDate(selectedBooking.ngayChoi) : '--'}</p></div>
              <div><p className="text-muted-foreground">Khung giờ</p><p className="font-medium">{selectedBooking.gioBatDau ? formatTime(selectedBooking.gioBatDau) + ' - ' + formatTime(selectedBooking.gioKetThuc) : '--'}</p></div>
              <div><p className="text-muted-foreground">Trạng thái</p><p className="font-medium">{selectedBooking.trangThai}</p></div>
              <div><p className="text-muted-foreground">Tổng tiền</p><p className="font-medium">{formatPrice(Number(selectedBooking.tongTien || 0))}</p></div>
              <div><p className="text-muted-foreground">Đã cọc</p><p className="font-medium">{formatPrice(Number(selectedBooking.tienDaCoc || 0))}</p></div>
            </div>
            {selectedBooking.ghiChu && (
              <div><p className="text-muted-foreground">Ghi chú</p><p>{selectedBooking.ghiChu}</p></div>
            )}
          </div>
        )}
        <ModalFooter>
          <Button variant="outline" onClick={() => setShowDetail(false)}>Đóng</Button>
        </ModalFooter>
      </Modal>

      {/* Actions Modal */}
      <Modal isOpen={showActions && !!selectedBooking} onClose={() => setShowActions(false)}
        title={selectedBooking ? `Thao tác với đơn #${selectedBooking.id}` : 'Thao tác'} size="sm">
        {selectedBooking && (
          <div className="space-y-2">
            {getActions(selectedBooking).map((action) => (
              <Button key={action.type} variant={action.variant} className="w-full justify-start"
                onClick={() => setActionConfirm(action.type)}>
                <action.icon className="size-4 mr-2" />{action.label}
              </Button>
            ))}
          </div>
        )}
        <ModalFooter>
          <Button variant="outline" onClick={() => setShowActions(false)}>Đóng</Button>
        </ModalFooter>
      </Modal>

      {/* Action Confirm Modal */}
      <Modal isOpen={!!actionConfirm} onClose={() => setActionConfirm(null)}
        title={actionConfirm === 'checkin' ? 'Xác nhận Check-in' : actionConfirm === 'checkout' ? 'Xác nhận Check-out' : 'Hủy vắng mặt'}
        size="sm">
        <p className="text-sm">{actionConfirm === 'noshow' ? 'Khách không đến? Đơn sẽ bị hủy.' : 'Xác nhận thao tác này?'}</p>
        <ModalFooter>
          <Button variant="outline" onClick={() => setActionConfirm(null)}>Hủy</Button>
          <Button variant={actionConfirm === 'noshow' ? 'destructive' : 'default'}
            onClick={() => selectedBooking && actionConfirm && actionMutation.mutate({ id: selectedBooking.id, type: actionConfirm })}
            loading={actionMutation.isPending}>Xác nhận</Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
