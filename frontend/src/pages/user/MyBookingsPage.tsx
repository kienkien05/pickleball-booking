/**
 * Trang Lịch sử Đặt sân (MyBookingsPage) - Hiển thị danh sách các lần đặt sân của
 * người dùng hiện tại và cho phép hủy đặt sân.
 *
 * Trang này cung cấp:
 * - Thanh tabs lọc theo trạng thái đặt sân: Tất cả, Đã đặt, Đã cọc, Đã thanh toán,
 *   Đang sử dụng, Hoàn thành, Đã hủy.
 * - Danh sách booking dưới dạng card, mỗi card hiển thị:
 *   + Tên sân (link đến trang chi tiết booking).
 *   + Ngày chơi và khung giờ.
 *   + Phương thức thanh toán.
 *   + Tổng tiền.
 *   + Badge trạng thái với màu sắc tương ứng.
 *   + Nút "Xem hóa đơn & QR check-in" cho các booking đang hoạt động.
 *   + Nút "Hủy" cho các booking ở trạng thái Đã thanh toán, Đã cọc hoặc Đã đặt.
 *   + Danh sách dịch vụ đi kèm (nếu có).
 * - Modal xác nhận hủy với cảnh báo chính sách hủy (trước 3 tiếng).
 *
 * Sử dụng React Query để fetch danh sách booking và mutation để hủy booking.
 * Khi thay đổi tab lọc, queryKey thay đổi -> tự động re-fetch với filter mới.
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ClipboardList, XCircle, AlertCircle, QrCode } from 'lucide-react'
import { toast } from 'sonner'
import { bookingService } from '@/services'
import { Button } from '@/components/ui/Button'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice, formatDate, formatTime } from '@/lib/utils'

/**
 * Danh sách các tab lọc trạng thái booking.
 * Mỗi tab có:
 * - key: giá trị gửi lên API để lọc (chuỗi rỗng = tất cả).
 * - label: nhãn hiển thị trên tab.
 */
const statusTabs = [
  { key: '', label: 'Tất cả' },
  { key: 'Đã thanh toán', label: 'Đã thanh toán' },
  { key: 'Đang sử dụng', label: 'Đang dùng' },
  { key: 'Hoàn thành', label: 'Hoàn thành' },
  { key: 'Đã hủy', label: 'Đã hủy' },
]

/**
 * Bảng màu sắc cho từng trạng thái booking.
 * Dùng để hiển thị badge trạng thái với màu nền (bg) và màu chữ (text) tương ứng.
 * - Đã đặt: vàng (amber).
 * - Đã cọc: tím (purple).
 * - Đã thanh toán: xanh dương (blue).
 * - Đang sử dụng: xanh lá (success).
 * - Hoàn thành: xám (muted).
 * - Đã hủy: đỏ (destructive).
 */
const statusColors: Record<string, string> = {
  'Chờ thanh toán': 'bg-amber-500/10 text-amber-600',
  'Đã đặt': 'bg-amber-500/10 text-amber-600',
  'Đã cọc': 'bg-purple-500/10 text-purple-600',
  'Đã thanh toán': 'bg-blue-500/10 text-blue-600',
  'Đang sử dụng': 'bg-success/10 text-success',
  'Hoàn thành': 'bg-muted text-muted-foreground',
  'Đã hủy': 'bg-destructive/10 text-destructive',
}

const PAYMENT_PENDING_STATUSES = new Set(['Chờ thanh toán'])
const BOOKING_DETAIL_STATUSES = new Set(['Đã thanh toán', 'Đã cọc', 'Đã đặt', 'Đang sử dụng', 'Hoàn thành'])

function isPaymentPending(status?: string) {
  return PAYMENT_PENDING_STATUSES.has(String(status || ''))
}

function canOpenBookingDetail(status?: string) {
  return BOOKING_DETAIL_STATUSES.has(String(status || ''))
}

/**
 * MyBookingsPage Component
 *
 * Component hiển thị lịch sử đặt sân của người dùng với chức năng lọc
 * theo trạng thái và hủy đặt sân.
 *
 * State:
 * - statusFilter: trạng thái đang được lọc (chuỗi rỗng = tất cả).
 * - cancelId: ID của booking đang được yêu cầu hủy (null = không có).
 *
 * Luồng hoạt động:
 * 1. Fetch danh sách booking với filter trạng thái từ API.
 * 2. Hiển thị các tab lọc, người dùng click tab -> cập nhật statusFilter.
 * 3. Khi statusFilter thay đổi, queryKey thay đổi -> React Query tự động re-fetch.
 * 4. Người dùng click "Hủy" trên một booking -> mở modal xác nhận.
 * 5. Xác nhận hủy -> gọi mutation cancelBooking -> invalidate cache để refresh danh sách.
 *
 * @returns {JSX.Element} Giao diện lịch sử đặt sân với tabs lọc và danh sách booking.
 */
export default function MyBookingsPage() {
  /**
   * Trạng thái lọc hiện tại.
   * Giá trị rỗng '' nghĩa là hiển thị tất cả booking không phân biệt trạng thái.
   * Khi thay đổi -> queryKey thay đổi -> React Query tự động re-fetch.
   */
  const [statusFilter, setStatusFilter] = useState('')
  const [payingBookingId, setPayingBookingId] = useState<string | null>(null)

  /**
   * ID của booking đang được yêu cầu hủy.
   * Khi khác null -> modal xác nhận hủy sẽ mở ra.
   * Khi = null -> modal đóng.
   */
  const [cancelId, setCancelId] = useState<string | null>(null)

  /** QueryClient để invalidate cache sau khi hủy booking thành công */
  const queryClient = useQueryClient()

  /**
   * Fetch danh sách booking của người dùng hiện tại từ API.
   * - queryKey bao gồm statusFilter để tự động re-fetch khi đổi tab.
   * - staleTime = 0: luôn lấy dữ liệu mới (booking thay đổi thường xuyên).
   * - limit 50: lấy tối đa 50 booking gần nhất.
   * - Khi statusFilter là '', tham số status không được gửi -> API trả về tất cả.
   */
  const { data: bookingsData, isLoading } = useQuery({
    queryKey: ['bookings', 'my', statusFilter],
    queryFn: () => bookingService.getMyBookings({ status: statusFilter || undefined, limit: 50 })
      .then(r => r.data.data ?? r.data ?? []),
    staleTime: 0,
  })

  /**
   * Chuẩn hóa dữ liệu booking từ API response.
   * API có thể trả về mảng trực tiếp hoặc object chứa thuộc tính `bookings`.
   * Nếu không có dữ liệu, mặc định là mảng rỗng.
   */
  const bookings = Array.isArray(bookingsData) ? bookingsData : bookingsData?.bookings ?? []

  /**
   * Mutation hủy booking.
   *
   * Luồng xử lý:
   * 1. Gọi API bookingService.cancelBooking với ID của booking cần hủy.
   * 2. Khi thành công (onSuccess):
   *    - Hiển thị toast thành công.
   *    - Invalidate cache ['bookings', 'my'] để refresh danh sách.
   *    - Đóng modal bằng cách set cancelId = null.
   * 3. Khi thất bại (onError):
   *    - Hiển thị toast lỗi với message từ API response.
   *    - Ví dụ: hủy sau 3 tiếng trước giờ chơi sẽ bị từ chối.
   */
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

  const resumePaymentMutation = useMutation({
    mutationFn: (id: string) => bookingService.getPaymentUrl(id),
    onMutate: (id: string) => {
      setPayingBookingId(id)
    },
    onSuccess: (res: any) => {
      const paymentUrl = res.data?.data?.paymentUrl || res.data?.paymentUrl
      if (!paymentUrl) {
        toast.error('Không lấy được link thanh toán')
        return
      }
      window.location.href = paymentUrl
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Không thể mở lại trang thanh toán')
    },
    onSettled: () => {
      setPayingBookingId(null)
    },
  })

  const handleContinuePayment = (booking: any) => {
    if (!isPaymentPending(booking.trangThai)) return
    resumePaymentMutation.mutate(String(booking.id))
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold mb-6">Lịch sử đặt sân</h1>

        {/* ==================== TABS LỌC TRẠNG THÁI ==================== */}
        {/*
         * Thanh tabs nằm ngang, có thể scroll ngang trên mobile (overflow-x-auto).
         * Tab đang được chọn có màu primary, các tab khác có màu muted.
         * Khi click tab -> cập nhật statusFilter -> React Query re-fetch.
         */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6 scrollbar-thin">
          {statusTabs.map(tab => (
            <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
              className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === tab.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* ==================== DANH SÁCH BOOKING ==================== */}
        {/*
         * 3 trạng thái hiển thị:
         * 1. isLoading = true: hiển thị 3 skeleton cards.
         * 2. bookings.length === 0: hiển thị thông báo "Chưa có lịch sử đặt sân nào"
         *    kèm link "Đặt sân ngay" dẫn đến /courts.
         * 3. Có dữ liệu: hiển thị danh sách booking dưới dạng card.
         *
         * Mỗi card booking hiển thị:
         * - Tên sân (link đến /booking/:id - trang chi tiết booking).
         * - Ngày chơi và khung giờ (format date/time theo locale Việt Nam).
         * - Phương thức thanh toán (in hoa, chữ nhỏ).
         * - Tổng tiền (format VND).
         * - Badge trạng thái với màu tương ứng.
         * - Nút "Xem hóa đơn & QR check-in" cho các booking còn hiệu lực:
         *   + Đã thanh toán, Đã cọc, Đã đặt, Đang sử dụng, Hoàn thành.
         * - Nút "Hủy" cho các booking có thể hủy:
         *   + Chỉ Đã thanh toán, Đã cọc và Đã đặt (không hủy được Đang sử dụng hay Hoàn thành).
         * - Danh sách dịch vụ đi kèm (nếu có).
         */}
        {isLoading ? (
          // Trạng thái loading: 3 skeleton cards
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 w-full" />)}
          </div>
        ) : bookings.length === 0 ? (
          // Trạng thái rỗng: chưa có booking nào
          <div className="text-center py-16 text-muted-foreground">
            <ClipboardList className="size-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg">Chưa có lịch sử đặt sân nào</p>
            <Link to="/courts" className="mt-4 inline-block text-primary hover:underline">Đặt sân ngay</Link>
          </div>
        ) : (
          // Trạng thái có dữ liệu: danh sách booking
          <div className="space-y-4">
            {bookings.map((booking: any) => (
              <div key={booking.id}
                className="rounded-xl border border-border bg-card p-4 sm:p-6 hover:border-primary/20 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Thông tin chính của booking */}
                  <div>
                    {/* Tên sân: đơn chờ thanh toán mở lại QR thanh toán, các trạng thái còn lại mở chi tiết */}
                    {isPaymentPending(booking.trangThai) ? (
                      <button
                        type="button"
                        onClick={() => handleContinuePayment(booking)}
                        disabled={payingBookingId === String(booking.id)}
                        className="font-semibold text-left hover:text-primary transition-colors disabled:opacity-60"
                      >
                        {payingBookingId === String(booking.id) ? 'Đang mở thanh toán...' : (booking.tenSan || `Sân #${booking.sanId}`)}
                      </button>
                    ) : (
                      <Link to={`/booking/${booking.id}`} className="font-semibold hover:text-primary transition-colors">
                        {booking.tenSan || `Sân #${booking.sanId}`}
                      </Link>
                    )}
                    {/* Ngày chơi và khung giờ */}
                    <p className="text-sm text-muted-foreground mt-1">
                      {booking.ngayChoi ? formatDate(booking.ngayChoi) : ''} • {booking.gioBatDau ? formatTime(booking.gioBatDau) : ''} - {booking.gioKetThuc ? formatTime(booking.gioKetThuc) : ''}
                    </p>
                    {/* Phương thức thanh toán (in hoa, chữ nhỏ) */}
                    <p className="text-[10px] uppercase font-bold text-muted-foreground/60 mt-1">
                      {booking.loaiThanhToan || 'Chưa xác định'}
                    </p>
                    {/* Tổng tiền */}
                    <p className="text-sm font-medium mt-1">{formatPrice(Number(booking.tongTien || 0))}</p>
                  </div>
                    {/* Badge trạng thái và các nút hành động */}
                    <div className="flex flex-col items-end gap-2">
                      {/* Badge trạng thái với màu theo statusColors */}
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[booking.trangThai] || 'bg-muted text-muted-foreground'}`}>
                        {booking.trangThai}
                      </span>

                      <div className="flex flex-wrap justify-end gap-2">
                        {/* Nút "Hủy": nằm bên trái nút xem QR */}
                        {(booking.trangThai === 'Đã thanh toán' || booking.trangThai === 'Đã cọc' || booking.trangThai === 'Đã đặt') && (
                          <Button variant="outline" size="sm" onClick={() => setCancelId(booking.id)}>
                            <XCircle className="size-3 mr-1" /> Hủy
                          </Button>
                        )}

                        {/* Nút "Xem hóa đơn & QR check-in": hiển thị cho các booking còn hiệu lực */}
                        {canOpenBookingDetail(booking.trangThai) && (
                          <Link to={`/booking/${booking.id}`}>
                            <Button variant="outline" size="sm" className="text-[10px] h-8 px-3 border-primary/30 text-primary hover:bg-primary/5">
                              <QrCode className="size-3 mr-1" /> Xem hóa đơn & QR check-in
                            </Button>
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>

                {/* Danh sách dịch vụ đi kèm (nếu có) */}
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

      {/* ==================== MODAL XÁC NHẬN HỦY ==================== */}
      {/*
       * Modal hiển thị khi người dùng click nút "Hủy".
       * Nội dung:
       * - Cảnh báo chính sách hủy: chỉ được hủy trước 3 tiếng.
       * - Câu hỏi xác nhận: "Bạn có chắc chắn muốn hủy lịch đặt sân này?"
       * Nút:
       * - "Giữ lịch": đóng modal, không hủy.
       * - "Xác nhận hủy": gọi mutation cancelBooking, có loading spinner.
       */}
      <Modal isOpen={!!cancelId} onClose={() => setCancelId(null)} title="Xác nhận hủy sân">
        <div className="space-y-3 text-sm">
          {/* Cảnh báo chính sách hủy */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 text-destructive">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>Bạn có thể hủy trước 3 tiếng. Đơn đã thanh toán/cọc khi hủy sẽ không hoàn tiền.</span>
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
