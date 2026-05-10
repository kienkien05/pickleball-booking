import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ClipboardList, XCircle, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { bookingService } from '@/services'
import { Button } from '@/components/ui/Button'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice, formatDate, formatTime } from '@/lib/utils'

const statusTabs = [
  { key: '', label: 'Tất cả' },
  { key: 'Đã thanh toán', label: 'Đã thanh toán' },
  { key: 'Đang sử dụng', label: 'Đang dùng' },
  { key: 'Hoàn thành', label: 'Hoàn thành' },
  { key: 'Đã hủy', label: 'Đã hủy' },
]

const statusColors: Record<string, string> = {
  'Đã thanh toán': 'bg-blue-500/10 text-blue-600',
  'Đang sử dụng': 'bg-success/10 text-success',
  'Hoàn thành': 'bg-muted text-muted-foreground',
  'Đã hủy': 'bg-destructive/10 text-destructive',
}

export default function MyBookingsPage() {
  const [statusFilter, setStatusFilter] = useState('')
  const [cancelId, setCancelId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: bookingsData, isLoading } = useQuery({
    queryKey: ['bookings', 'my', statusFilter],
    queryFn: () => bookingService.getMyBookings({ status: statusFilter || undefined, limit: 50 })
      .then(r => r.data.data ?? r.data ?? []),
  })

  const bookings = Array.isArray(bookingsData) ? bookingsData : bookingsData?.bookings ?? []

  const cancelMutation = useMutation({
    mutationFn: (id: string) => bookingService.cancelBooking(id),
    onSuccess: () => {
      toast.success('Hủy đặt sân thành công!')
      queryClient.invalidateQueries({ queryKey: ['bookings', 'my'] })
      setCancelId(null)
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Không thể hủy đặt sân')
    },
  })

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold mb-6">Lịch sử đặt sân</h1>

        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-thin">
          {statusTabs.map(tab => (
            <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
              className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === tab.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
          </div>
        ) : bookings.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <ClipboardList className="size-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg">Chưa có lịch sử đặt sân nào</p>
            <Link to="/courts" className="mt-4 inline-block text-primary hover:underline">Đặt sân ngay</Link>
          </div>
        ) : (
          <div className="space-y-4">
            {bookings.map((booking: any) => (
              <div key={booking.id} className="rounded-xl border border-border bg-card p-4 sm:p-6 hover:border-primary/20 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <Link to={`/booking/${booking.id}`} className="font-semibold hover:text-primary transition-colors">
                      {booking.tenSan || `Sân #${booking.sanId}`}
                    </Link>
                    <p className="text-sm text-muted-foreground mt-1">
                      {booking.ngayChoi ? formatDate(booking.ngayChoi) : ''} • {booking.gioBatDau ? formatTime(booking.gioBatDau) : ''} - {booking.gioKetThuc ? formatTime(booking.gioKetThuc) : ''}
                    </p>
                    <p className="text-sm font-medium mt-1">{formatPrice(Number(booking.tongTien || 0))}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[booking.trangThai] || 'bg-muted text-muted-foreground'}`}>
                      {booking.trangThai}
                    </span>
                    {booking.trangThai === 'Đã thanh toán' && (
                      <Button variant="outline" size="sm" onClick={() => setCancelId(booking.id)}>
                        <XCircle className="size-3 mr-1" /> Hủy
                      </Button>
                    )}
                  </div>
                </div>
                {booking.dichVu && booking.dichVu.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs text-muted-foreground">Dịch vụ: {booking.dichVu.map((d: any) => `${d.tenDichVu} x${d.soLuong}`).join(', ')}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </motion.div>

      <Modal isOpen={!!cancelId} onClose={() => setCancelId(null)} title="Xác nhận hủy sân">
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>Bạn có thể hủy trước 3 tiếng. Hủy sau thời gian này sẽ không được chấp nhận.</span>
          </div>
          <p>Bạn có chắc chắn muốn hủy lịch đặt sân này?</p>
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={() => setCancelId(null)}>Giữ lịch</Button>
          <Button variant="destructive" onClick={() => cancelId && cancelMutation.mutate(cancelId)} loading={cancelMutation.isPending}>
            Xác nhận hủy
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
