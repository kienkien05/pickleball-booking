/**
 * Trang Chi Tiết Đơn Đặt Sân (BookingDetailPage)
 * ==============================================
 * @purpose Hiển thị toàn bộ thông tin của một đơn đặt sân, bao gồm:
 *   - Thông tin sân, thời gian chơi, tổng tiền
 *   - Danh sách dịch vụ đi kèm (nếu có)
 *   - Chi tiết thanh toán (tạm tính, giảm giá từ voucher, tổng thanh toán)
 *   - Mã QR check-in (chỉ hiển thị khi đơn chưa bị hủy/chưa hoàn thành)
 *   - Khu vực đánh giá trải nghiệm (chỉ hiển thị khi đơn ở trạng thái "Hoàn thành")
 * @route /booking/:id
 * @access Người dùng đã đăng nhập
 */

import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowLeft, MapPin, Clock, CreditCard, Star, QrCode, AlertCircle, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { bookingService, reviewService } from '@/services'
import { Button } from '@/components/ui/Button'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice, formatDate, formatTime } from '@/lib/utils'

const CHECK_IN_QR_STATUSES = new Set(['Đã thanh toán', 'Đã cọc', 'Đã đặt'])

/**
 * Trang chi tiết đơn đặt sân
 * @description Component hiển thị đầy đủ thông tin của một đơn đặt sân,
 *   bao gồm QR check-in và phần đánh giá sau khi hoàn thành.
 * @returns Giao diện chi tiết đơn đặt sân
 */
export default function BookingDetailPage() {
  // Lấy id đơn đặt sân từ URL params (vd: /booking/123)
  const { id } = useParams<{ id: string }>()

  // state cho form đánh giá: số sao (1-5) và nội dung bình luận
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [cancelOpen, setCancelOpen] = useState(false)
  const queryClient = useQueryClient()

  /**
   * Truy vấn lấy thông tin chi tiết đơn đặt sân theo ID
   * @enabled chỉ chạy khi có id hợp lệ
   * @data bao gồm thông tin sân, thời gian, thanh toán, trạng thái
   */
  const { data: booking, isLoading } = useQuery({
    queryKey: ['bookings', id],
    queryFn: () => bookingService.getBookingById(id!).then(r => r.data.data ?? r.data),
    enabled: !!id,
  })

  const canRequestCheckInQR = booking ? CHECK_IN_QR_STATUSES.has(booking.trangThai) : false

  /**
   * Truy vấn lấy mã QR check-in cho đơn đặt sân
   * @enabled chỉ lấy QR khi đơn ở trạng thái có thể check-in.
   */
  const { data: qrData } = useQuery({
    queryKey: ['bookings', id, 'qr'],
    queryFn: () => bookingService.getBookingQR(id!).then(r => r.data.data ?? r.data),
    enabled: !!id && canRequestCheckInQR,
  })

  /**
   * Truy vấn tìm đánh giá hiện có của người dùng cho đơn này
   * @description Lấy tất cả đánh giá của sân, sau đó tìm đánh giá có donDatId khớp với id hiện tại
   * @enabled chỉ chạy khi có id và sanId (cần sanId để gọi API đánh giá theo sân)
   */
  const { data: existingReview } = useQuery({
    queryKey: ['reviews', 'booking', id],
    queryFn: () => reviewService.getByCourt(booking?.sanId, { limit: 100 }).then(r => {
      const reviews = r.data.data ?? r.data ?? []
      // Lọc danh sách đánh giá để tìm đánh giá trùng khớp với donDatId hiện tại
      return reviews.find((rev: any) => rev.donDatId === parseInt(id!)) ?? null
    }),
    enabled: !!id && !!booking?.sanId,
  })

  /**
   * Mutation gửi đánh giá mới cho đơn đặt sân
   * @description Gửi số sao (rating) và bình luận (comment - tùy chọn) lên server
   * @onSuccess Hiển thị toast thành công, làm mới danh sách đánh giá, reset form
   * @onError Hiển thị thông báo lỗi từ server
   */
  const reviewMutation = useMutation({
    mutationFn: () => reviewService.create({ booking_id: id!, rating, comment: comment || undefined }),
    onSuccess: () => {
      toast.success('Cảm ơn bạn đã đánh giá!')
      // Làm mới dữ liệu đánh giá để hiển thị đánh giá vừa gửi
      queryClient.invalidateQueries({ queryKey: ['reviews', 'booking', id] })
      setRating(0); setComment('')
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gửi đánh giá thất bại'),
  })

  /**
   * Mutation hủy đơn từ trang chi tiết.
   * Dùng chung API với lịch sử đặt sân nên VIP/user thường có cùng policy hủy.
   */
  const cancelMutation = useMutation({
    mutationFn: () => bookingService.cancelBooking(id!),
    onSuccess: () => {
      toast.success('Hủy đặt sân thành công!')
      setCancelOpen(false)
      queryClient.invalidateQueries({ queryKey: ['bookings', id] })
      queryClient.invalidateQueries({ queryKey: ['bookings', 'my'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    },
    onError: (err: any) => toast.error(err.response?.data?.message || err.response?.data?.error || 'Không thể hủy đặt sân'),
  })

  // --- Trạng thái loading: hiển thị skeleton placeholder ---
  if (isLoading) {
    return <div className="max-w-2xl mx-auto px-4 py-8 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  }

  // --- Trạng thái không tìm thấy đơn: hiển thị thông báo lỗi ---
  if (!booking) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center text-muted-foreground">
        <p className="text-lg">Không tìm thấy đơn đặt sân</p>
        <Link to="/my-bookings" className="mt-4 inline-block text-primary hover:underline">Quay lại lịch sử</Link>
      </div>
    )
  }

  const isAutoBooking = booking.isAutoBooking === true || booking.autoBookingSeriesId
  const canCancel = CHECK_IN_QR_STATUSES.has(booking.trangThai)
  const canShowCheckInQR = CHECK_IN_QR_STATUSES.has(booking.trangThai)

  // --- Giao diện chính của chi tiết đơn đặt sân ---
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Link quay lại lịch sử đặt sân */}
      <Link to="/my-bookings" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="size-4" /> Quay lại lịch sử
      </Link>

      <div className="rounded-xl border border-border bg-card p-6 space-y-4">
        <h1 className="text-xl font-bold">Chi tiết đơn đặt sân</h1>

        {/* Thông tin cơ bản: sân, thời gian, tổng tiền (layout 2 cột trên màn rộng) */}
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

        {/* Chi tiết đơn: mã đơn, hình thức thanh toán, trạng thái */}
        <div className="pt-4 border-t border-border space-y-3">
          <div className="flex justify-between text-sm"><span>Mã đơn</span><span className="font-mono">{booking.id}</span></div>
          {isAutoBooking && (
            <div className="flex justify-between text-sm"><span>Loại lịch</span><span className="font-medium text-amber-600">VIP tự động 30 ngày</span></div>
          )}
          <div className="flex justify-between text-sm"><span>Hình thức thanh toán</span><span className="font-medium">{booking.loaiThanhToan || 'N/A'}</span></div>
          {/* Hiển thị trạng thái với màu sắc tương ứng:
              - Đã cọc: màu tím
              - Đã thanh toán: màu xanh dương
              - Đang sử dụng: màu success (xanh lá)
              - Hoàn thành: màu xám
              - Các trạng thái khác (Đã hủy, ...): màu đỏ */}
          <div className="flex justify-between text-sm"><span>Trạng thái</span><span className={`font-medium ${
            booking.trangThai === 'Đã thanh toán' ? 'text-blue-600' :
            booking.trangThai === 'Đã cọc' ? 'text-purple-600' :
            booking.trangThai === 'Đã đặt' ? 'text-amber-600' :
            booking.trangThai === 'Đang sử dụng' ? 'text-success' :
            booking.trangThai === 'Hoàn thành' ? 'text-muted-foreground' : 'text-destructive'
          }`}>{booking.trangThai}</span></div>
        </div>

        {/* Danh sách dịch vụ đi kèm (chỉ hiển thị nếu có dịch vụ) */}
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

        {/* Chi tiết thanh toán: tạm tính, giảm giá voucher, tổng thanh toán */}
        <div className="pt-4 border-t border-border space-y-2">
          <p className="text-sm font-semibold mb-2">Chi tiết thanh toán</p>
          <div className="space-y-1.5 text-sm">
            {/* Dòng tạm tính (giá sân + dịch vụ trước khi giảm) */}
            {booking.giaGoc && (
              <div className="flex justify-between text-muted-foreground">
                <span>Tạm tính (Sân & Dịch vụ):</span>
                <span>{formatPrice(Number(booking.giaGoc))}</span>
              </div>
            )}
            {/* Dòng giảm giá từ voucher (chỉ hiển thị nếu có giảm giá > 0) */}
            {Number(booking.tienGiam || 0) > 0 && (
              <div className="flex justify-between text-success">
                <span>Giảm giá (Voucher {booking.maGiamGia}):</span>
                <span>-{formatPrice(Number(booking.tienGiam))}</span>
              </div>
            )}
            {/* Dòng tổng thanh toán cuối cùng, in đậm */}
          <div className="flex justify-between text-lg font-bold pt-2 border-t border-dashed border-border text-primary">
              <span>Tổng thanh toán:</span>
              <span>{formatPrice(Number(booking.tongTien || 0))}</span>
            </div>
          </div>
        </div>

        {canCancel && (
          <div className="pt-4 border-t border-border">
            <Button variant="outline" className="w-full border-destructive/40 text-destructive hover:bg-destructive/5" onClick={() => setCancelOpen(true)}>
              <XCircle className="size-4 mr-2" /> {isAutoBooking ? 'Hủy buổi VIP này' : 'Hủy đặt sân'}
            </Button>
          </div>
        )}

        {/* Mã QR Check-in (chỉ hiển thị khi có dữ liệu QR từ API) */}
        {canShowCheckInQR && qrData?.qr && (
          <div className="pt-6 border-t border-border text-center bg-muted/20 rounded-xl p-4 mt-4">
            <p className="text-sm font-bold mb-3 uppercase tracking-wider">Mã QR Check-in</p>
            {/* QR code được render từ URL (base64 hoặc URL ảnh) */}
            <div className="bg-white p-3 inline-block rounded-lg shadow-sm">
              <img src={qrData.qr} alt="QR Code" className="w-44 h-44" />
            </div>
            {/* Hướng dẫn sử dụng QR code khi đến sân */}
            <p className="text-xs text-muted-foreground mt-4">Đưa mã này cho nhân viên khi đến sân để check-in nhanh</p>
            <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-background rounded-full border border-border">
              <span className="text-[10px] text-muted-foreground uppercase font-bold">Mã đơn:</span>
              <span className="font-mono font-bold text-sm select-all">{booking.id}</span>
            </div>
          </div>
        )}

        {/* Phần đánh giá (Review Section)
            Chỉ hiển thị khi đơn đã HOÀN THÀNH - người dùng có thể đánh giá trải nghiệm */}
        {booking.trangThai === 'Hoàn thành' && (
          <div className="pt-4 border-t border-border">
            <p className="text-sm font-medium mb-3">Đánh giá trải nghiệm</p>
            {/* Nếu đã có đánh giá trước đó: hiển thị số sao và bình luận (read-only) */}
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
              // Form đánh giá mới: chọn số sao + nhập bình luận
              <div className="space-y-3">
                {/* 5 ngôi sao clickable để chọn rating */}
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map(s => (
                    <button key={s} onClick={() => setRating(s)} className="p-0.5">
                      <Star className={`size-6 ${s <= rating ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground'}`} />
                    </button>
                  ))}
                </div>
                <textarea value={comment} onChange={e => setComment(e.target.value)} placeholder="Chia sẻ trải nghiệm của bạn..."
                  className="w-full h-20 px-4 py-3 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none resize-none text-sm" />
                {/* Nút gửi: bị vô hiệu hóa nếu chưa chọn sao, hiển thị loading khi đang gửi */}
                <Button onClick={() => reviewMutation.mutate()} disabled={rating === 0} loading={reviewMutation.isPending}>
                  Gửi đánh giá
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      <Modal isOpen={cancelOpen} onClose={() => setCancelOpen(false)} title={isAutoBooking ? 'Xác nhận hủy buổi VIP' : 'Xác nhận hủy sân'}>
        <div className="space-y-3 text-sm">
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>
              {isAutoBooking
                ? 'Bạn đang hủy buổi VIP đã được khóa trong chuỗi 30 ngày. Đơn đã thanh toán/cọc khi hủy sẽ không hoàn tiền.'
                : 'Bạn có thể hủy trước 3 tiếng. Đơn đã thanh toán/cọc khi hủy sẽ không hoàn tiền.'}
            </span>
          </div>
          <p>Bạn có chắc chắn muốn hủy lịch đặt sân này?</p>
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={() => setCancelOpen(false)}>Giữ lịch</Button>
          <Button variant="destructive" onClick={() => cancelMutation.mutate()} loading={cancelMutation.isPending}>
            Xác nhận hủy
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
