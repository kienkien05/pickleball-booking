/**
 * Trang Thanh Toán (PaymentPage)
 * ================================
 * @purpose Trang thanh toán cho đơn đang chờ thanh toán.
 *   Hiển thị mã giao dịch, timer đếm ngược, và nút thanh toán.
 *   Timer dựa trên expiresAt từ DB (không reset khi quay lại).
 * @route /payment/:id
 * @access Người dùng đã đăng nhập, sở hữu đơn
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Clock, CreditCard, MapPin, QrCode, AlertCircle, ArrowLeft, Loader2, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { bookingService } from '@/services'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice, formatDate, formatTime } from '@/lib/utils'

/** Thời gian thanh toán tối đa (ms) */
const PAYMENT_TIMEOUT_MS = 15 * 60 * 1000

/**
 * Format thời gian còn lại dạng MM:SS
 */
function formatTimeLeft(ms: number): string {
  if (ms <= 0) return '00:00'
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

/**
 * Trang thanh toán - hiển thị thông tin thanh toán và timer đếm ngược
 */
export default function PaymentPage() {
  const { id } = useParams<{ id: string }>()
  const [timeLeft, setTimeLeft] = useState<number>(PAYMENT_TIMEOUT_MS)
  const [isExpired, setIsExpired] = useState(false)
  const [isPaying, setIsPaying] = useState(false)
  const didAutoRedirect = useRef(false)

  /** Lấy thông tin booking + payment */
  const { data: booking, isLoading } = useQuery({
    queryKey: ['bookings', id],
    queryFn: () => bookingService.getBookingById(id!).then(r => r.data.data ?? r.data),
    enabled: !!id,
  })

  /** Lấy QR nếu đã thanh toán */
  const { data: qrData } = useQuery({
    queryKey: ['bookings', id, 'qr'],
    queryFn: () => bookingService.getBookingQR(id!).then(r => r.data.data ?? r.data),
    enabled: !!id && booking?.trangThai === 'Đã thanh toán',
  })

  /** Tính toán thời gian còn lại từ expiresAt */
  const computeTimeLeft = useCallback(() => {
    if (!booking?.expiresAt) return 0
    const expires = new Date(booking.expiresAt).getTime()
    if (!Number.isFinite(expires)) return 0
    const remaining = expires - Date.now()
    return Math.max(0, remaining)
  }, [booking?.expiresAt])

  /** Timer đếm ngược - cập nhật mỗi giây */
  useEffect(() => {
    if (!booking || booking.trangThai === 'Đã thanh toán') return

    const initial = computeTimeLeft()
    setTimeLeft(initial)
    if (initial <= 0) {
      setIsExpired(true)
      return
    }

    const interval = setInterval(() => {
      const remaining = computeTimeLeft()
      setTimeLeft(remaining)
      if (remaining <= 0) {
        setIsExpired(true)
        clearInterval(interval)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [booking, computeTimeLeft])

  /** Mutation mở URL thanh toán */
  const payMutation = useMutation({
    mutationFn: () => bookingService.getPaymentUrl(id!),
    onMutate: () => setIsPaying(true),
    onSuccess: (res: any) => {
      const paymentUrl = res.data?.data?.paymentUrl || res.data?.paymentUrl
      if (!paymentUrl) {
        toast.error('Không lấy được link thanh toán')
        setIsPaying(false)
        return
      }
      window.location.href = paymentUrl
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Không thể mở trang thanh toán')
      setIsPaying(false)
    },
  })

  useEffect(() => {
    if (!id || didAutoRedirect.current) return
    didAutoRedirect.current = true
    payMutation.mutate()
  }, [id])

  // --- Loading ---
  if (isLoading) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    )
  }

  // --- Không tìm thấy ---
  if (!booking) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center text-muted-foreground">
        <p className="text-lg">Không tìm thấy đơn đặt sân</p>
        <Link to="/my-bookings" className="mt-4 inline-block text-primary hover:underline">Quay lại lịch sử</Link>
      </div>
    )
  }

  const isPaid = booking.trangThai === 'Đã thanh toán'
  const isPending = booking.trangThai === 'Chờ thanh toán'

  // Nếu đã thanh toán hoặc không phải trạng thái chờ → hiển thị kết quả
  if (isPaid) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 text-center">
        <div className="rounded-xl border border-border bg-card p-6 space-y-4">
          <div className="size-14 mx-auto rounded-full bg-success/10 flex items-center justify-center">
            <QrCode className="size-7 text-success" />
          </div>
          <h1 className="text-lg font-bold">Đã thanh toán thành công</h1>
          <p className="text-sm text-muted-foreground">
            Đơn đặt sân của bạn đã được thanh toán. Hãy dùng QR bên dưới để check-in khi đến sân.
          </p>

          {qrData?.qr && (
            <div className="bg-white p-3 inline-block rounded-lg shadow-sm">
              <img src={qrData.qr} alt="QR Check-in" className="w-40 h-40" />
            </div>
          )}

          <div className="text-xs text-muted-foreground space-y-1">
            <p>Mã giao dịch: <span className="font-mono font-medium text-foreground select-all">{booking.txnRef || 'N/A'}</span></p>
            <p>Mã đơn: <span className="font-mono font-medium text-foreground select-all">{booking.id}</span></p>
          </div>

          <div className="pt-4 flex justify-center gap-4">
            <Link to={`/booking/${booking.id}`} className="text-sm text-primary hover:underline font-medium">
              Xem chi tiết đơn
            </Link>
            <Link to="/my-bookings" className="text-sm text-muted-foreground hover:underline">
              Lịch sử đặt sân
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!isPending) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center text-muted-foreground">
        <AlertCircle className="size-12 mx-auto mb-4 opacity-30" />
        <p className="text-lg">Đơn này không ở trạng thái chờ thanh toán</p>
        <p className="text-sm mt-1">Trạng thái hiện tại: {booking.trangThai}</p>
        <Link to="/my-bookings" className="mt-4 inline-block text-primary hover:underline">Quay lại lịch sử</Link>
      </div>
    )
  }

  // --- Giao diện chờ thanh toán ---
  return (
    <div className="max-w-md mx-auto px-4 py-8">
      <Link to="/my-bookings" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="size-4" /> Quay lại lịch sử
      </Link>

      <div className="rounded-xl border border-border bg-card p-6 space-y-5">
        <h1 className="text-lg font-bold text-center">Thanh toán đơn đặt sân</h1>

        {/* Thông tin đơn */}
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-3">
            <MapPin className="size-4 text-muted-foreground shrink-0" />
            <span className="font-medium">{booking.tenSan || `Sân #${booking.sanId}`}</span>
          </div>
          <div className="flex items-center gap-3">
            <Clock className="size-4 text-muted-foreground shrink-0" />
            <span>
              {booking.ngayChoi ? formatDate(booking.ngayChoi) : ''} • {booking.gioBatDau ? formatTime(booking.gioBatDau) : ''} - {booking.gioKetThuc ? formatTime(booking.gioKetThuc) : ''}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <CreditCard className="size-4 text-muted-foreground shrink-0" />
            <span className="font-semibold text-base">{formatPrice(Number(booking.tongTien || 0))}</span>
          </div>
        </div>

        {/* Mã giao dịch */}
        <div className="p-3 rounded-lg bg-muted/30 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Mã giao dịch</p>
          <p className="font-mono text-sm font-bold select-all">{booking.txnRef || 'N/A'}</p>
        </div>

        {/* Timer đếm ngược hoặc hết hạn */}
        {isExpired ? (
          <div className="p-4 rounded-lg bg-destructive/10 text-center space-y-3">
            <AlertCircle className="size-8 mx-auto text-destructive" />
            <p className="font-semibold text-destructive">Đã quá hạn thanh toán</p>
            <p className="text-xs text-muted-foreground">
              Thời gian thanh toán 15 phút đã kết thúc. Vui lòng đặt lại sân.
            </p>
            <Link to="/courts">
              <Button variant="outline" size="sm">Đặt lại sân</Button>
            </Link>
          </div>
        ) : (
          <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/20 text-center space-y-3">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Thời gian còn lại để thanh toán</p>
            <p className={`text-3xl font-bold font-mono tabular-nums ${timeLeft < 60000 ? 'text-destructive animate-pulse' : 'text-amber-600'}`}>
              {formatTimeLeft(timeLeft)}
            </p>
            <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${timeLeft < 60000 ? 'bg-destructive' : 'bg-amber-500'}`}
                style={{ width: `${(timeLeft / PAYMENT_TIMEOUT_MS) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Nút thanh toán */}
        <Button
          className="w-full"
          size="lg"
          disabled={isExpired || isPaying}
          loading={isPaying}
          onClick={() => payMutation.mutate()}
        >
          {isPaying ? (
            'Đang chuyển đến trang thanh toán...'
          ) : (
            <>
              <ExternalLink className="size-4 mr-2" />
              Thanh toán qua VNPay
            </>
          )}
        </Button>

        <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
          Bạn sẽ được chuyển đến cổng thanh toán VNPay Sandbox.
          <br />Sau khi thanh toán thành công, QR check-in sẽ hiển thị ở đây.
        </p>
      </div>
    </div>
  )
}
