import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, MapPin, Clock, CreditCard } from 'lucide-react'
import { bookingService } from '@/services'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice, formatDate, formatTime } from '@/lib/utils'

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data: booking, isLoading } = useQuery({
    queryKey: ['bookings', id],
    queryFn: () => bookingService.getBookingById(id!).then(r => r.data.data ?? r.data),
    enabled: !!id,
  })

  if (isLoading) {
    return <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  }

  if (!booking) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-muted-foreground">
        <p className="text-lg">Không tìm thấy đơn đặt sân</p>
        <Link to="/my-bookings" className="mt-4 inline-block text-primary hover:underline">Quay lại lịch sử</Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <Link to="/my-bookings" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="size-4" /> Quay lại lịch sử
      </Link>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h1 className="text-xl font-bold">Chi tiết đơn đặt sân</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-3">
            <MapPin className="size-5 text-muted-foreground" />
            <div><p className="text-muted-foreground">Sân</p><p className="font-medium">{booking.tenSan || `Sân #${booking.sanId}`}</p></div>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="size-5 text-muted-foreground" />
            <div><p className="text-muted-foreground">Thời gian</p>
              <p className="font-medium">{booking.ngayChoi ? formatDate(booking.ngayChoi) : ''} • {booking.gioBatDau ? formatTime(booking.gioBatDau) : ''} - {booking.gioKetThuc ? formatTime(booking.gioKetThuc) : ''}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <CreditCard className="size-5 text-muted-foreground" />
            <div><p className="text-muted-foreground">Tổng tiền</p><p className="font-medium">{formatPrice(Number(booking.tongTien || 0))}</p></div>
          </div>
        </div>

        <div className="pt-4 border-t border-border space-y-2">
          <div className="flex justify-between text-sm"><span>Mã đơn</span><span className="font-mono">{booking.id}</span></div>
          <div className="flex justify-between text-sm"><span>Trạng thái</span><span className="font-medium">{booking.trangThai}</span></div>
          <div className="flex justify-between text-sm"><span>Tiền đã cọc</span><span>{formatPrice(Number(booking.tienDaCoc || 0))}</span></div>
        </div>

        {booking.dichVu && booking.dichVu.length > 0 && (
          <div className="pt-4 border-t border-border">
            <p className="text-sm font-medium mb-2">Dịch vụ đi kèm</p>
            {booking.dichVu.map((d: any, i: number) => (
              <div key={i} className="flex justify-between text-sm py-1">
                <span>{d.tenDichVu} x{d.soLuong}</span>
                <span>{formatPrice(Number(d.tongTien || 0))}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
