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

        <div className="pt-4 border-t border-border space-y-3">
          <div className="flex justify-between text-sm"><span>Mã đơn</span><span className="font-mono">{booking.id}</span></div>
          <div className="flex justify-between text-sm"><span>Hình thức thanh toán</span><span className="font-medium">{booking.loaiThanhToan || 'N/A'}</span></div>
          <div className="flex justify-between text-sm"><span>Trạng thái</span><span className={`font-medium ${
            booking.trangThai === 'Đã thanh toán' ? 'text-blue-600' :
            booking.trangThai === 'Đang sử dụng' ? 'text-success' :
            booking.trangThai === 'Hoàn thành' ? 'text-muted-foreground' : 'text-destructive'
          }`}>{booking.trangThai}</span></div>
        </div>

        {booking.dichVu && booking.dichVu.length > 0 && (
          <div className="pt-4 border-t border-border">
            <p className="text-sm font-semibold mb-3">Dịch vụ đi kèm</p>
            <div className="bg-muted/30 rounded-lg p-3 space-y-2">
              {booking.dichVu.map((d: any, i: number) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{d.tenDichVu} x{d.soLuong}</span>
                  <span className="font-medium">{formatPrice(Number(d.tongTien || 0))}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="pt-4 border-t border-border space-y-2">
          <p className="text-sm font-semibold mb-2">Chi tiết thanh toán</p>
          <div className="space-y-1.5 text-sm">
            {booking.giaGoc && (
              <div className="flex justify-between text-muted-foreground">
                <span>Tạm tính (Sân & Dịch vụ):</span>
                <span>{formatPrice(Number(booking.giaGoc))}</span>
              </div>
            )}
            {Number(booking.tienGiam || 0) > 0 && (
              <div className="flex justify-between text-success">
                <span>Giảm giá (Voucher {booking.maGiamGia}):</span>
                <span>-{formatPrice(Number(booking.tienGiam))}</span>
              </div>
            )}
            <div className="flex justify-between text-lg font-bold pt-2 border-t border-dashed border-border text-primary">
              <span>Tổng thanh toán:</span>
              <span>{formatPrice(Number(booking.tongTien || 0))}</span>
            </div>
          </div>
        </div>

        {qrData?.qr && (
          <div className="pt-6 border-t border-border text-center bg-muted/20 rounded-xl p-4 mt-4">
            <p className="text-sm font-bold mb-3 uppercase tracking-wider">Mã QR Check-in</p>
            <div className="bg-white p-3 inline-block rounded-lg shadow-sm">
              <img src={qrData.qr} alt="QR Code" className="w-44 h-44" />
            </div>
            <p className="text-xs text-muted-foreground mt-4">Đưa mã này cho nhân viên khi đến sân để check-in nhanh</p>
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-background rounded-full border border-border">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Mã đơn:</span>
              <span className="font-mono font-bold text-sm select-all">{booking.id}</span>
            </div>
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
