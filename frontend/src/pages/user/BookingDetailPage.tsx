import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, MapPin, Clock, CreditCard, Star, QrCode } from 'lucide-react'
import { toast } from 'sonner'
import { bookingService, reviewService } from '@/services'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice, formatDate, formatTime } from '@/lib/utils'

export default function BookingDetailPage() {
  const { id } = useParams<{ id: string }>()

  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const queryClient = useQueryClient()

  const { data: booking, isLoading } = useQuery({
    queryKey: ['bookings', id],
    queryFn: () => bookingService.getBookingById(id!).then(r => r.data.data ?? r.data),
    enabled: !!id,
  })

  const { data: qrData } = useQuery({
    queryKey: ['bookings', id, 'qr'],
    queryFn: () => bookingService.getBookingQR(id!).then(r => r.data.data ?? r.data),
    enabled: !!id && booking?.trangThai !== 'Đã hủy' && booking?.trangThai !== 'Hoàn thành',
  })

  const { data: existingReview } = useQuery({
    queryKey: ['reviews', 'booking', id],
    queryFn: () => reviewService.getByCourt(booking?.sanId, { limit: 100 }).then(r => {
      const reviews = r.data.data ?? r.data ?? []
      return reviews.find((rev: any) => rev.donDatId === parseInt(id!)) ?? null
    }),
    enabled: !!id && !!booking?.sanId,
  })

  const reviewMutation = useMutation({
    mutationFn: () => reviewService.create({ booking_id: id!, rating, comment: comment || undefined }),
    onSuccess: () => {
      toast.success('Cảm ơn bạn đã đánh giá!')
      queryClient.invalidateQueries({ queryKey: ['reviews', 'booking', id] })
      setRating(0); setComment('')
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gửi đánh giá thất bại'),
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
          <div className="flex justify-between text-sm"><span>Đã thanh toán</span><span>{formatPrice(Number(booking.tongTien || 0))}</span></div>
        </div>

        {qrData?.qr && (
          <div className="pt-4 border-t border-border text-center">
            <p className="text-sm font-medium mb-2">Mã QR Check-in</p>
            <img src={qrData.qr} alt="QR Code" className="mx-auto w-40 h-40" />
            <p className="text-xs text-muted-foreground mt-2">Đưa mã này cho nhân viên khi đến sân</p>
            <p className="text-xs text-muted-foreground mt-1">Hoặc đọc mã đơn: <span className="font-mono font-bold text-foreground select-all">{booking.id}</span></p>
          </div>
        )}

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

        {/* Review Section */}
        {booking.trangThai === 'Hoàn thành' && (
          <div className="pt-4 border-t border-border">
            <p className="text-sm font-medium mb-3">Đánh giá trải nghiệm</p>
            {existingReview ? (
              <div className="p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-1 mb-1">
                  {[1, 2, 3, 4, 5].map(s => (
                    <Star key={s} className={`size-4 ${s <= existingReview.diemSao ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground'}`} />
                  ))}
                </div>
                {existingReview.binhLuan && <p className="text-sm text-muted-foreground">{existingReview.binhLuan}</p>}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(s => (
                    <button key={s} onClick={() => setRating(s)} className="p-0.5">
                      <Star className={`size-6 ${s <= rating ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground'}`} />
                    </button>
                  ))}
                </div>
                <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Chia sẻ trải nghiệm của bạn..."
                  className="w-full h-20 px-4 py-3 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none resize-none text-sm" />
                <Button onClick={() => reviewMutation.mutate()} disabled={rating === 0} loading={reviewMutation.isPending}>
                  Gửi đánh giá
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
