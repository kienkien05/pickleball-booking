/**
 * Trang Chi tiết Sân (CourtDetailPage) - Trang hiển thị thông tin chi tiết của một sân
 * Pickleball và cho phép người dùng đặt sân.
 *
 * Trang này là trang phức tạp nhất trong phần user, bao gồm:
 *
 * --- CỘT TRÁI: Đánh giá ---
 * - Danh sách đánh giá của sân với phân trang (5 đánh giá/trang).
 * - Form gửi đánh giá mới (yêu cầu đăng nhập): chọn số sao (1-5) và nhập bình luận.
 * - Nếu chưa đăng nhập, hiển thị link dẫn đến trang login.
 *
 * --- CỘT PHẢI: Đặt sân ---
 * - Date picker để chọn ngày chơi (chỉ chọn từ hôm nay trở đi).
 * - Grid các khung giờ trống, mỗi ô hiển thị giờ bắt đầu - giờ kết thúc và giá.
 * - Logic khóa khung giờ (lock): khung giờ bị khóa nếu:
 *   + Đã có người đặt (isBooked).
 *   + Là ngày trong quá khứ.
 *   + Là ngày hôm nay nhưng đã quá giờ kết thúc hoặc quá ngưỡng khóa (BOOKING_LOCK_THRESHOLD_MINS) tính từ giờ bắt đầu.
 * - Danh sách dịch vụ đi kèm (đồ uống, dụng cụ...) với nút +/- để chọn số lượng.
 * - Chọn phương thức thanh toán: tiền mặt, chuyển khoản, MoMo, Visa/Mastercard.
 * - Phần mã giảm giá (voucher):
 *   + Người dùng có thể nhập mã hoặc chọn từ danh sách voucher có sẵn.
 *   + Tự động áp dụng voucher đầu tiên khi vào trang (chỉ 1 lần).
 *   + Hỗ trợ 2 loại giảm giá: phần trăm (percentage) và số tiền cố định (fixed).
 *   + Hiển thị số tiền được giảm và tổng tiền sau giảm giá.
 * - Tính năng tự động đặt lịch (auto-booking) dành cho người dùng VIP:
 *   + Hệ thống sẽ tự động đặt lại khung giờ tương tự cho tuần kế tiếp.
 * - Modal xác nhận đặt sân hiển thị tóm tắt thông tin trước khi gửi.
 * - Nếu sân đang bảo trì: hiển thị thông báo không thể đặt.
 *
 * Sử dụng nhiều React Query hooks để fetch: thông tin sân, khung giờ, dịch vụ,
 * đánh giá, và voucher của người dùng.
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { MapPin, Clock, Star, ShoppingCart, AlertCircle, RefreshCw, ChevronLeft, ChevronRight, MessageSquareText, Ticket } from 'lucide-react'
import { toast } from 'sonner'
import { courtService, bookingService, serviceService, reviewService, discountService } from '@/services'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice, formatDate } from '@/lib/utils'
import { BOOKING_LOCK_THRESHOLD_MINS } from '@/lib/constants'

/**
 * Số lượng đánh giá hiển thị trên mỗi trang.
 * Khi có nhiều hơn REVIEW_PAGE_SIZE đánh giá, phân trang sẽ xuất hiện.
 */
const REVIEW_PAGE_SIZE = 5

/**
 * CourtDetailPage Component
 *
 * Component trang chi tiết sân, nơi người dùng có thể xem thông tin sân,
 * đọc/viết đánh giá, và thực hiện đặt sân với đầy đủ các tùy chọn.
 *
 * @returns {JSX.Element} Giao diện chi tiết sân với booking panel và review panel.
 */
export default function CourtDetailPage() {
  // ==================== ROUTER & AUTH ====================

  /** Lấy ID sân từ URL params (ví dụ: /courts/5 -> id = "5") */
  const { id } = useParams<{ id: string }>()
  /** Hook điều hướng của React Router, dùng để chuyển trang sau khi đặt sân thành công */
  const navigate = useNavigate()
  /** Kiểm tra trạng thái đăng nhập và lấy thông tin người dùng từ auth store (Zustand) */
  const { isAuthenticated, user } = useAuthStore()
  /** QueryClient để invalidate cache sau khi đặt sân hoặc gửi đánh giá */
  const queryClient = useQueryClient()
  /** Kiểm tra người dùng có phải là VIP không (VIP có quyền tự động đặt lịch tuần sau) */
  const isVIP = user?.is_vip === true

  // ==================== STATE: ĐẶT SÂN ====================

  /**
   * Ngày được chọn để đặt sân, mặc định là hôm nay.
   * Định dạng: YYYY-MM-DD (chuỗi ISO date).
   */
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  /**
   * Danh sách ID các khung giờ đã chọn.
   * Mỗi phần tử là một chuỗi ID của timeslot.
   * Người dùng có thể chọn nhiều khung giờ cho cùng một ngày.
   */
  const [selectedSlots, setSelectedSlots] = useState<string[]>([])
  /**
   * Danh sách dịch vụ đi kèm đã chọn, dạng object { [serviceId]: quantity }.
   * Ví dụ: { "1": 2, "3": 1 } nghĩa là chọn 2 đơn vị dịch vụ ID=1 và 1 đơn vị dịch vụ ID=3.
   */
  const [selectedServices, setSelectedServices] = useState<Record<string, number>>({})
  /**
   * Phương thức thanh toán được chọn.
   * Hỗ trợ: 'cash' (tiền mặt), 'transfer' (chuyển khoản), 'momo' (ví MoMo), 'visa' (thẻ Visa/Mastercard).
   */
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'momo' | 'visa'>('cash')
  /**
   * Cờ tự động đặt lịch. Chỉ khả dụng cho người dùng VIP.
   * Khi bật: hệ thống sẽ tự động đặt lại khung giờ tương tự cho tuần sau.
   */
  const [autoBooking, setAutoBooking] = useState(false)
  /** Trạng thái mở/đóng modal xác nhận đặt sân */
  const [confirmOpen, setConfirmOpen] = useState(false)
  /** Trạng thái loading của nút đặt sân (ngăn click nhiều lần) */
  const [bookingLoading, setBookingLoading] = useState(false)

  // ==================== STATE: ĐÁNH GIÁ ====================

  /** Trang hiện tại trong phân trang đánh giá (bắt đầu từ 1) */
  const [reviewPage, setReviewPage] = useState(1)
  /** Số sao người dùng chọn khi viết đánh giá (0 = chưa chọn, 1-5) */
  const [reviewRating, setReviewRating] = useState(0)
  /** Nội dung bình luận đánh giá */
  const [reviewComment, setReviewComment] = useState('')

  // ==================== STATE: MÃ GIẢM GIÁ ====================

  /** Mã giảm giá người dùng nhập vào ô input */
  const [discountCode, setDiscountCode] = useState('')
  /** Mã giảm giá đã được áp dụng thành công (chứa object thông tin giảm giá từ API) */
  const [appliedDiscount, setAppliedDiscount] = useState<any>(null)
  /** Trạng thái đang kiểm tra mã giảm giá với API (hiển thị loading spinner) */
  const [validatingDiscount, setValidatingDiscount] = useState(false)
  /** Cờ hiển thị danh sách voucher có sẵn (hiện không dùng đến UI toggle) */
  const [showVoucherList, setShowVoucherList] = useState(false)
  /**
   * Lưu mã giảm giá đã được tự động áp dụng (chỉ áp dụng 1 lần khi vào trang).
   * Ngăn việc tự động áp dụng lại khi component re-render.
   */
  const [hasAutoApplied, setHasAutoApplied] = useState<string | null>(null)

  // ==================== STATE: ĐỒNG HỒ THỜI GIAN THỰC ====================

  /**
   * Trạng thái "bây giờ" được cập nhật mỗi 30 giây.
   * Dùng để xác định khung giờ nào đã hết hạn đặt trong ngày hôm nay.
   */
  const [now, setNow] = useState(new Date())

  /**
   * Effect cập nhật đồng hồ thời gian thực mỗi 30 giây.
   * Khi `now` thay đổi, các khung giờ trong ngày hôm nay sẽ được đánh giá lại
   * xem có vượt quá ngưỡng khóa hay không.
   */
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000)
    return () => clearInterval(timer)
  }, [])

  // ==================== API QUERIES ====================

  /**
   * Fetch thông tin chi tiết của sân theo ID.
   * Chỉ fetch khi `id` có giá trị (enabled: !!id).
   * Dữ liệu bao gồm: tên sân, mô tả, ảnh, trạng thái, đánh giá trung bình, v.v.
   */
  const { data: court, isLoading: courtLoading } = useQuery({
    queryKey: ['courts', id],
    queryFn: () => courtService.getCourtById(id!).then(r => r.data.data ?? r.data),
    enabled: !!id,
  })

  /**
   * Fetch danh sách khung giờ (timeslots) của sân cho ngày `selectedDate`.
   * Khi `selectedDate` thay đổi, queryKey thay đổi -> tự động re-fetch.
   * Mỗi khung giờ chứa: id, giờ bắt đầu, giờ kết thúc, giá, trạng thái đã đặt.
   */
  const { data: slotsData } = useQuery({
    queryKey: ['timeslots', id, selectedDate],
    queryFn: () => courtService.getTimeSlots(id!, selectedDate).then(r => r.data.data ?? r.data ?? []),
    enabled: !!id,
  })

  /**
   * Fetch danh sách tất cả dịch vụ đi kèm (đồ uống, thuê vợt, ...).
   * Chỉ fetch một lần vì danh sách dịch vụ ít thay đổi.
   */
  const { data: servicesData } = useQuery({
    queryKey: ['services'],
    queryFn: () => serviceService.getAll().then(r => r.data.data ?? r.data ?? []),
    enabled: isAuthenticated,
  })

  /**
   * Fetch danh sách đánh giá của sân, tối đa 100 đánh giá gần nhất.
   * Phân trang được xử lý ở phía client.
   */
  const { data: reviewsData } = useQuery({
    queryKey: ['reviews', 'court', id],
    queryFn: () => reviewService.getByCourt(id!, { limit: 100 }).then(r => {
      const list = r.data.data ?? r.data ?? []
      return Array.isArray(list) ? list : list.reviews ?? []
    }),
    enabled: !!id,
  })

  /**
   * Fetch danh sách voucher/ưu đãi của người dùng hiện tại.
   * Chỉ fetch khi đã đăng nhập (enabled: isAuthenticated).
   * staleTime = 0 để luôn lấy dữ liệu mới nhất (voucher có thể thay đổi sau mỗi lần đặt sân).
   */
  const { data: myDiscounts } = useQuery({
    queryKey: ['my-vouchers'],
    queryFn: () => discountService.getMyDiscounts().then(r => r.data.data ?? []),
    enabled: isAuthenticated,
    staleTime: 0,
  })

  /** Danh sách đánh giá sau khi chuẩn hóa */
  const reviews = reviewsData || []
  /** Tổng số trang đánh giá (mỗi trang REVIEW_PAGE_SIZE đánh giá, tối thiểu 1 trang) */
  const totalPages = Math.max(1, Math.ceil(reviews.length / REVIEW_PAGE_SIZE))
  /** Danh sách đánh giá của trang hiện tại (đã cắt theo phân trang) */
  const pagedReviews = reviews.slice((reviewPage - 1) * REVIEW_PAGE_SIZE, reviewPage * REVIEW_PAGE_SIZE)

  // ==================== MUTATION: GỬI ĐÁNH GIÁ ====================

  /**
   * Mutation gửi đánh giá mới cho sân.
   * - Gọi API reviewService.create với rating, comment, và courtId.
   * - Khi thành công: hiển thị toast, invalidate cache đánh giá để load lại danh sách,
   *   và reset form đánh giá.
   * - Khi thất bại: hiển thị toast lỗi từ API response.
   */
  const reviewMutation = useMutation({
    mutationFn: () => reviewService.create({ booking_id: '0', rating: reviewRating, comment: reviewComment || undefined, courtId: id }),
    onSuccess: () => {
      toast.success('Cảm ơn bạn đã đánh giá!')
      queryClient.invalidateQueries({ queryKey: ['reviews', 'court', id] })
      setReviewRating(0); setReviewComment('')
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gửi đánh giá thất bại'),
  })

  // ==================== CHUẨN HÓA DỮ LIỆU ====================

  /** Danh sách khung giờ sau khi chuẩn hóa từ API response */
  const timeSlots = Array.isArray(slotsData) ? slotsData : slotsData?.slots ?? []
  /** Danh sách dịch vụ sau khi chuẩn hóa từ API response */
  const services = Array.isArray(servicesData) ? servicesData : servicesData?.services ?? []

  // ==================== TÍNH TOÁN GIÁ ====================

  /**
   * Danh sách object khung giờ đã chọn (đầy đủ thông tin, không chỉ ID).
   * Dùng để hiển thị trong modal xác nhận đặt sân.
   */
  const selectedSlotObjects = timeSlots.filter((s: any) => selectedSlots.includes(String(s.id)))

  /**
   * Tổng tiền sân = tổng giá của tất cả khung giờ đã chọn.
   * Mỗi khung giờ có trường `mucGia` (mức giá).
   */
  const courtPrice = selectedSlotObjects.reduce((sum: number, s: any) => sum + (Number(s.mucGia) || 0), 0)

  /**
   * Tổng tiền dịch vụ = tổng (đơn giá * số lượng) của các dịch vụ đã chọn.
   * Duyệt qua object selectedServices { [serviceId]: quantity } để tính.
   */
  const servicesPrice = Object.entries(selectedServices).reduce((sum, [svcId, qty]) => {
    const svc = services.find((s: any) => String(s.id) === svcId)
    return sum + (svc ? (Number(svc.donGia) || 0) * qty : 0)
  }, 0)

  /** Tổng tiền trước khi áp dụng mã giảm giá = tiền sân + tiền dịch vụ */
  const subTotal = courtPrice + servicesPrice

  /**
   * Tính số tiền được giảm giá dựa trên mã giảm giá đã áp dụng.
   * Hỗ trợ 2 loại giảm giá:
   * - 'percentage': giảm theo phần trăm trên tổng tiền, có giới hạn tối đa (giamToiDa).
   * - 'fixed' (mặc định): giảm số tiền cố định, không vượt quá tổng tiền.
   */
  let discountAmount = 0
  if (appliedDiscount) {
    const muc = Number(appliedDiscount.mucGiamGia || appliedDiscount.mucgiamgia || 0)
    const loai = appliedDiscount.loaiGiamGia || appliedDiscount.loaigiamgia
    const maxGiam = Number(appliedDiscount.giamToiDa || appliedDiscount.giamtoida || 0)

    if (loai === 'percentage') {
      discountAmount = Math.round(subTotal * muc / 100)
      if (maxGiam > 0) discountAmount = Math.min(discountAmount, maxGiam)
    } else {
      discountAmount = Math.min(muc, subTotal)
    }
  }

  /** Tổng tiền cuối cùng sau khi trừ giảm giá */
  const totalPrice = subTotal - discountAmount

  // ==================== HANDLER: CHỌN/BỎ CHỌN KHUNG GIỜ ====================

  /**
   * Xử lý khi người dùng click chọn/bỏ chọn một khung giờ.
   * - Nếu khung giờ đã có trong danh sách: loại bỏ (bỏ chọn).
   * - Nếu khung giờ chưa có: thêm vào danh sách.
   * - Sau khi thay đổi khung giờ, reset mã giảm giá đã áp dụng
   *   vì tổng tiền thay đổi có thể ảnh hưởng đến điều kiện áp dụng voucher.
   *
   * @param {string} slotId - ID của khung giờ được click
   */
  const handleSlotToggle = (slotId: string) => {
    setSelectedSlots(prev => prev.includes(slotId) ? prev.filter(s => s !== slotId) : [...prev, slotId])
    setAppliedDiscount(null)
  }

  // ==================== HANDLER: ÁP DỤNG MÃ GIẢM GIÁ ====================

  /**
   * Xử lý áp dụng mã giảm giá.
   *
   * @param {string} [overrideCode] - Mã giảm giá cụ thể (dùng khi chọn từ danh sách voucher có sẵn).
   *   Nếu không truyền, sẽ dùng giá trị từ ô input `discountCode`.
   *
   * Luồng xử lý:
   * 1. Xác định mã cần kiểm tra (từ tham số hoặc từ state).
   * 2. Gọi API discountService.validate để kiểm tra mã với tổng tiền hiện tại và sân.
   * 3. Nếu hợp lệ: lưu kết quả vào `appliedDiscount` và hiển thị toast thành công.
   * 4. Nếu không hợp lệ: hiển thị toast lỗi và reset `appliedDiscount`.
   *
   * Được bọc trong useCallback để tránh re-create khi dùng trong useEffect.
   */
  const handleApplyDiscount = useCallback(async (overrideCode?: string) => {
    const codeToUse = overrideCode || discountCode
    if (!codeToUse || !codeToUse.trim() || validatingDiscount) return

    setValidatingDiscount(true)
    try {
      const res = await discountService.validate(codeToUse, subTotal, id)
      setAppliedDiscount(res.data.data)
      if (!overrideCode) toast.success('Áp dụng mã giảm giá thành công!')
    } catch (err: any) {
      if (!overrideCode) toast.error(err.response?.data?.error || 'Mã giảm giá không hợp lệ')
      setAppliedDiscount(null)
    } finally {
      setValidatingDiscount(false)
    }
  }, [discountCode, subTotal, validatingDiscount, id])

  /**
   * Effect tự động áp dụng voucher đầu tiên khi người dùng vào trang.
   *
   * Điều kiện kích hoạt:
   * - Người dùng đã đăng nhập.
   * - Tổng tiền > 0 (đã chọn ít nhất 1 khung giờ).
   * - Có voucher trong tài khoản.
   * - Chưa có mã giảm giá nào được áp dụng.
   * - Chưa từng tự động áp dụng trước đó (kiểm tra qua `hasAutoApplied`).
   *
   * Đây là cơ chế "auto-apply voucher" - tự động chọn voucher đầu tiên
   * để tối ưu trải nghiệm người dùng.
   */
  useEffect(() => {
    // Only auto-select the first voucher ONCE when the user enters the page and has no discount selected
    if (isAuthenticated && subTotal > 0 && myDiscounts && myDiscounts.length > 0 && !appliedDiscount && !hasAutoApplied) {
      const codeToApply = myDiscounts[0].code
      if (codeToApply) {
        setDiscountCode(codeToApply)
        setHasAutoApplied(codeToApply) // Store the code that was auto-applied
        handleApplyDiscount(codeToApply)
      }
    }
  }, [isAuthenticated, subTotal, myDiscounts, appliedDiscount, hasAutoApplied, handleApplyDiscount])

  // ==================== HANDLER: ĐẶT SÂN ====================

  /**
   * Xử lý đặt sân khi người dùng xác nhận trong modal.
   *
   * Luồng xử lý:
   * 1. Kiểm tra đăng nhập: nếu chưa đăng nhập, chuyển hướng sang trang /login.
   * 2. Gọi API bookingService.createBooking với đầy đủ tham số:
   *    - sanId: ID sân.
   *    - ngayChoi: ngày đã chọn.
   *    - khungGioIds: danh sách ID khung giờ đã chọn.
   *    - dichVu: danh sách dịch vụ kèm theo (id + số lượng).
   *    - phuongThuc: phương thức thanh toán.
   *    - isAutoBooking: có tự động đặt lịch tuần sau không.
   *    - maGiamGia: mã giảm giá (nếu có).
   * 3. Khi thành công:
   *    - Hiển thị toast thành công.
   *    - Invalidate cache notifications, vouchers, và bookings.
   *    - Đóng modal và chuyển hướng sang /my-bookings.
   * 4. Khi thất bại: hiển thị toast lỗi.
   */
  const handleBooking = async () => {
    if (!isAuthenticated) { navigate('/login'); return }
    setBookingLoading(true)
    try {
      await bookingService.createBooking({
        sanId: id,
        ngayChoi: selectedDate,
        khungGioIds: selectedSlots,
        dichVu: Object.entries(selectedServices).map(([id, qty]) => ({ dichVuId: id, soLuong: qty })),
        phuongThuc: paymentMethod,
        isAutoBooking: autoBooking,
        maGiamGia: appliedDiscount?.code
      })
      toast.success(autoBooking ? 'Đặt sân thành công! Hệ thống sẽ tự động đặt lịch cho tuần sau.' : 'Đặt sân thành công!')
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      queryClient.invalidateQueries({ queryKey: ['my-vouchers'] })
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      setConfirmOpen(false)
      navigate('/my-bookings')
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Đặt sân thất bại')
    } finally { setBookingLoading(false) }
  }

  // ==================== TRẠNG THÁI LOADING ====================
  if (courtLoading) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Skeleton className="h-96 w-full rounded-xl" />
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    )
  }

  // ==================== TRẠNG THÁI KHÔNG TÌM THẤY SÂN ====================
  if (!court) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-muted-foreground">
        <MapPin className="size-16 mx-auto mb-4 opacity-20" />
        <p className="text-lg">Không tìm thấy sân</p>
      </div>
    )
  }

  /** Ngày hôm nay dạng YYYY-MM-DD, dùng làm giá trị min cho date picker */
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* ==================== HEADER: THÔNG TIN SÂN ==================== */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {/* Ảnh sân (nếu có) */}
          {court.hinhAnh && (
            <div className="aspect-video bg-muted">
              <img src={court.hinhAnh} alt={court.tenSan} className="w-full h-full object-cover" />
            </div>
          )}
          {/* Tên sân, mô tả, trạng thái, đánh giá */}
          <div className="p-6">
            <h1 className="text-2xl font-bold">{court.tenSan}</h1>
            <p className="mt-2 text-muted-foreground">{court.moTa}</p>
            <div className="flex items-center gap-3 mt-3">
              {/* Badge trạng thái sân */}
              <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                court.trangThai === 'Sẵn sàng' ? 'bg-success/10 text-success' :
                court.trangThai === 'Bảo trì' ? 'bg-orange-500/10 text-orange-600' :
                'bg-muted text-muted-foreground'
              }`}>
                {court.trangThai || 'Sẵn sàng'}
              </div>
              {/* Đánh giá trung bình (sao) và số lượt đánh giá */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-amber-500">
                  <Star className="size-5 fill-current" />
                  <span className="text-lg font-bold">{court.avgRating != null && Number(court.avgRating) > 0 ? Number(court.avgRating).toFixed(1) : '--'}</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  ({court.reviewCount ?? 0} lượt đánh giá)
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ==================== LAYOUT 2 CỘT ==================== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ==================== CỘT TRÁI: ĐÁNH GIÁ ==================== */}
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <MessageSquareText className="size-5" /> Đánh giá ({reviews.length})
              </h2>

              {/* ---- Form gửi đánh giá ---- */}
              {isAuthenticated ? (
                <div className="mb-6 p-4 rounded-lg border border-border bg-muted/30">
                  <p className="text-sm font-medium mb-3">Viết đánh giá của bạn</p>
                  {/* Chọn số sao (1-5) */}
                  <div className="flex items-center gap-1 mb-3">
                    {[1, 2, 3, 4, 5].map(s => (
                      <button key={s} onClick={() => setReviewRating(s)} className="p-0.5">
                        <Star className={`size-6 ${s <= reviewRating ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground'}`} />
                      </button>
                    ))}
                    {reviewRating > 0 && <span className="text-xs text-muted-foreground ml-2">{reviewRating}/5</span>}
                  </div>
                  {/* Ô nhập bình luận */}
                  <textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)}
                    placeholder="Chia sẻ trải nghiệm của bạn về sân này..."
                    className="w-full h-20 px-4 py-3 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none resize-none text-sm mb-3" />
                  {/* Nút gửi đánh giá (disabled nếu chưa chọn sao) */}
                  <Button onClick={() => reviewMutation.mutate()} disabled={reviewRating === 0} loading={reviewMutation.isPending} size="sm">
                    Gửi đánh giá
                  </Button>
                </div>
              ) : (
                // Thông báo yêu cầu đăng nhập để viết đánh giá
                <div className="mb-6 p-4 rounded-lg border border-border bg-muted/30 text-center">
                  <p className="text-sm text-muted-foreground">
                    <button onClick={() => navigate('/login')} className="text-primary hover:underline">Đăng nhập</button> để viết đánh giá
                  </p>
                </div>
              )}

              {/* ---- Danh sách đánh giá ---- */}
              {pagedReviews.length > 0 ? (
                <div className="space-y-4">
                  {pagedReviews.map((r: any) => (
                    <div key={r.id} className="pb-4 border-b border-border last:border-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{r.full_name || 'Khách hàng'}</span>
                        <span className="text-xs text-muted-foreground">{r.ngayTao ? new Date(r.ngayTao).toLocaleDateString('vi-VN') : ''}</span>
                      </div>
                      {/* Hiển thị số sao của đánh giá */}
                      <div className="flex items-center gap-0.5 mt-1">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star key={s} className={`size-3.5 ${s <= (r.diemSao || 0) ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/30'}`} />
                        ))}
                      </div>
                      {r.binhLuan && <p className="text-sm text-muted-foreground mt-1">{r.binhLuan}</p>}
                    </div>
                  ))}

                  {/* ---- Phân trang đánh giá ---- */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 pt-2">
                      <Button variant="outline" size="sm" disabled={reviewPage <= 1}
                        onClick={() => setReviewPage(p => p - 1)}>
                        <ChevronLeft className="size-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground">{reviewPage} / {totalPages}</span>
                      <Button variant="outline" size="sm" disabled={reviewPage >= totalPages}
                        onClick={() => setReviewPage(p => p + 1)}>
                        <ChevronRight className="size-4" />
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">Chưa có đánh giá nào cho sân này</p>
              )}
            </div>
          </div>

          {/* ==================== CỘT PHẢI: ĐẶT SÂN ==================== */}
          <div className="space-y-6">
            {/* ---- TRƯỜNG HỢP SÂN BẢO TRÌ ---- */}
            {court.trangThai === 'Bảo trì' ? (
              <div className="rounded-xl border border-orange-500/50 bg-orange-500/5 p-8 text-center">
                <AlertCircle className="size-12 mx-auto mb-4 text-orange-500" />
                <h3 className="text-lg font-bold text-orange-600">Sân hiện đang được bảo trì</h3>
                <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
                  Vui lòng quay lại sau! Chúng tôi đang nỗ lực để sân sớm hoạt động trở lại.
                </p>
              </div>
            ) : court.trangThai !== 'Sẵn sàng' ? (
              // ---- TRƯỜNG HỢP SÂN KHÔNG KHẢ DỤNG (trạng thái khác) ----
              <div className="rounded-xl border border-warning/50 bg-warning/5 p-6 text-center">
                <AlertCircle className="size-10 mx-auto mb-3 text-warning" />
                <p className="font-semibold text-warning">Sân không khả dụng</p>
                <p className="text-sm text-muted-foreground mt-1">Sân này hiện không thể đặt lịch vào lúc này.</p>
              </div>
            ) : (<>
              {/* ---- CHỌN NGÀY ---- */}
              {/*
               * Date picker cho phép chọn ngày chơi.
               * - min = today: không cho chọn ngày trong quá khứ.
               * - Khi thay đổi ngày: reset danh sách khung giờ đã chọn vì
               *   các khung giờ thuộc về ngày cũ không còn liên quan.
               */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="font-semibold mb-4">Chọn ngày</h2>
                <input type="date" value={selectedDate} min={today}
                  onChange={e => { setSelectedDate(e.target.value); setSelectedSlots([]) }}
                  className="w-full sm:w-auto h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" />
              </div>

              {/* ---- KHUNG GIỜ TRỐNG ---- */}
              {/*
               * Grid hiển thị các khung giờ khả dụng cho ngày đã chọn.
               * Mỗi ô là một khung giờ với:
               * - Giờ bắt đầu - giờ kết thúc.
               * - Giá tiền.
               * - Trạng thái: có thể chọn / đã đặt / đã khóa.
               *
               * Logic khóa (lock) khung giờ:
               * 1. isBooked = true -> khung giờ đã có người đặt.
               * 2. selectedDate < today -> ngày trong quá khứ.
               * 3. selectedDate === today && đã qua giờ kết thúc -> hết giờ.
               * 4. selectedDate === today && thời gian hiện tại >= giờ bắt đầu + BOOKING_LOCK_THRESHOLD_MINS
               *    -> quá ngưỡng cho phép đặt (không thể đặt sát giờ).
               */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="font-semibold mb-4">Khung giờ trống</h2>
                {timeSlots.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Clock className="size-10 mx-auto mb-2 opacity-30" />
                  <p>Chưa có khung giờ nào cho ngày này</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {timeSlots.map((slot: any) => {
                    const isSelected = selectedSlots.includes(String(slot.id))
                    const isBooked = slot.isBooked
                    const isExpired = slot.isExpired

                    // Real-time locking logic cho ngày hôm nay
                    const todayStr = new Date().toISOString().slice(0, 10)
                    const currentTimeStr = now.toTimeString().slice(0, 5)

                    let isRealTimeLocked = false
                    if (selectedDate === todayStr) {
                      const isPastEnd = (slot.gioKetThuc || '').substring(0, 5) <= currentTimeStr
                      const [h, m] = (slot.gioBatDau || '00:00').split(':').map(Number)
                      const startTotal = h * 60 + m
                      const nowTotal = now.getHours() * 60 + now.getMinutes()
                      const isPastThreshold = nowTotal >= startTotal + BOOKING_LOCK_THRESHOLD_MINS
                      isRealTimeLocked = isPastEnd || isPastThreshold
                    }

                    const isPastDate = selectedDate < todayStr
                    const isLocked = isBooked || isExpired || isRealTimeLocked || isPastDate

                    return (
                      <button key={slot.id} disabled={isLocked || !isAuthenticated} onClick={() => { if (!isAuthenticated) { navigate(`/login?redirect=/courts/${id}`); return } handleSlotToggle(String(slot.id)) }}
                        className={`p-3 rounded-lg border text-sm font-medium transition-all ${isLocked || !isAuthenticated ? 'border-border bg-muted/50 text-muted-foreground cursor-not-allowed' :
                            isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50 hover:bg-accent'}`}>
                        <div>{(slot.gioBatDau || '').substring(0, 5)} - {(slot.gioKetThuc || '').substring(0, 5)}</div>
                        <div className="text-xs text-muted-foreground mt-1">{formatPrice(Number(slot.mucGia || 0))}</div>
                        {isLocked && <div className="text-xs text-destructive mt-1">{isBooked ? 'Đã đặt' : 'Đã quá giờ'}</div>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {isAuthenticated ? (<>
              {/* ---- DỊCH VỤ ĐI KÈM ---- */}
              {services.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-6">
                  <h2 className="font-semibold mb-4">Dịch vụ đi kèm</h2>
                  <div className="space-y-3">
                    {services.filter((s: any) => s.trangThai === 'Còn hàng').map((svc: any) => (
                      <div key={svc.id} className="flex items-center justify-between p-3 rounded-lg border border-border">
                        <div>
                          <p className="font-medium text-sm">{svc.tenDichVu}</p>
                          <p className="text-xs text-muted-foreground">{formatPrice(Number(svc.donGia))}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setSelectedServices(prev => {
                            const cur = prev[String(svc.id)] || 0
                            if (cur <= 1) { const { [String(svc.id)]: _, ...rest } = prev; return rest }
                            return { ...prev, [String(svc.id)]: cur - 1 }
                          })} className="size-8 rounded-md border border-input flex items-center justify-center hover:bg-muted">-</button>
                          <span className="w-8 text-center text-sm">{selectedServices[String(svc.id)] || 0}</span>
                          <button onClick={() => setSelectedServices(prev => ({
                            ...prev, [String(svc.id)]: (prev[String(svc.id)] || 0) + 1
                          }))} className="size-8 rounded-md border border-input flex items-center justify-center hover:bg-muted">+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ---- PHƯƠNG THỨC THANH TOÁN ---- */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="font-semibold mb-4">Phương thức thanh toán</h2>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'cash' as const, label: 'Tiền mặt tại sân', desc: 'Thanh toán khi đến chơi', icon: '💵' },
                    { key: 'transfer' as const, label: 'Chuyển khoản NH', desc: 'MB Bank, Vietcombank...', icon: '🏦' },
                    { key: 'momo' as const, label: 'Ví MoMo', desc: 'Quét mã QR qua MoMo', icon: '📱' },
                    { key: 'visa' as const, label: 'Visa/Mastercard', desc: 'Thẻ tín dụng quốc tế', icon: '💳' },
                  ].map(pm => (
                    <button key={pm.key} onClick={() => setPaymentMethod(pm.key)}
                      className={`p-3 rounded-lg border text-sm text-left transition-all ${paymentMethod === pm.key ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'}`}>
                      <span className="text-lg">{pm.icon}</span>
                      <p className="font-medium mt-1">{pm.label}</p>
                      <p className="text-xs text-muted-foreground">{pm.desc}</p>
                    </button>
                  ))}
                </div>
              </div>

              {/* ---- TÓM TẮT ĐẶT SÂN ---- */}
              {selectedSlots.length > 0 && (
                <div className="rounded-xl border border-border bg-card p-6 sticky bottom-20 sm:bottom-0 z-10">
                  <h2 className="font-semibold mb-4 text-primary flex items-center gap-2">
                    <Ticket className="size-5" /> Mã giảm giá
                  </h2>

                  <div className="space-y-3 mb-6">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={discountCode}
                        onChange={e => setDiscountCode(e.target.value)}
                        placeholder="Nhập mã hoặc chọn bên dưới..."
                        className="flex-1 h-10 px-3 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-ring outline-none uppercase"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={handleApplyDiscount}
                        loading={validatingDiscount}
                        disabled={!discountCode}
                      >
                        Áp dụng
                      </Button>
                    </div>

                    {myDiscounts && myDiscounts.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">Voucher của bạn</p>
                        <div className="flex flex-wrap gap-2">
                          {myDiscounts.filter((d: any) => d.soLuongBanDau === 0 || d.soLuongDaDung < d.soLuongBanDau).map((disc: any) => (
                            <button
                              key={disc.id}
                              onClick={() => {
                                setDiscountCode(disc.code)
                                handleApplyDiscount(disc.code)
                              }}
                              className={`text-left p-2 rounded-lg border transition-all flex items-center gap-2 max-w-[200px] relative ${
                                appliedDiscount?.code === disc.code
                                ? 'border-primary bg-primary/5 ring-1 ring-primary'
                                : 'border-dashed border-muted-foreground/30 hover:border-primary/50'
                              }`}
                            >
                              <div className="bg-primary/10 p-1.5 rounded-md">
                                <Ticket className="size-3.5 text-primary" />
                              </div>
                              <div className="min-w-0 pr-6">
                                <p className="text-xs font-bold truncate">{disc.code}</p>
                                <p className="text-[10px] text-muted-foreground truncate">{disc.noiDung}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {appliedDiscount && (
                    <div className="mb-4 p-3 rounded-lg bg-success/5 border border-success/20 text-xs text-success flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="size-2 rounded-full bg-success animate-pulse" />
                        <span>Đã giảm <strong>{appliedDiscount.loaiGiamGia === 'percentage' ? `${appliedDiscount.mucGiamGia}%` : formatPrice(appliedDiscount.mucGiamGia)}</strong> từ mã <strong>{appliedDiscount.code}</strong></span>
                      </div>
                      <button onClick={() => { setAppliedDiscount(null); setDiscountCode('') }} className="font-bold hover:underline">Gỡ</button>
                    </div>
                  )}

                  <h2 className="font-semibold mb-4">Tóm tắt đặt sân</h2>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between"><span>Tiền sân</span><span>{formatPrice(courtPrice)}</span></div>
                    {servicesPrice > 0 && <div className="flex justify-between"><span>Dịch vụ</span><span>{formatPrice(servicesPrice)}</span></div>}
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-success">
                        <span>Giảm giá</span>
                        <span>-{formatPrice(discountAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-semibold text-base border-t border-border pt-2">
                      <span>Tổng tiền</span><span>{formatPrice(totalPrice)}</span>
                    </div>
                  </div>
                  <div className="mt-4 space-y-3">
                    {isVIP && (
                      <div className="flex items-center justify-between p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                        <div className="flex items-center gap-2">
                          <RefreshCw className="size-4 text-amber-500" />
                          <div>
                            <p className="text-sm font-medium">Tự động đặt lịch tuần sau</p>
                            <p className="text-xs text-muted-foreground">Tự động đặt lại khung giờ này cho tuần kế tiếp</p>
                          </div>
                        </div>
                        <button onClick={() => setAutoBooking(!autoBooking)}
                          className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex items-center px-0.5 ${autoBooking ? 'bg-amber-500' : 'bg-muted-foreground/30'}`}>
                          <span className={`size-5 rounded-full bg-white shadow transition-transform duration-200 ${autoBooking ? 'translate-x-5' : 'translate-x-0'}`} />
                        </button>
                      </div>
                    )}
                    <Button className="w-full" size="lg" onClick={() => setConfirmOpen(true)}>
                      <ShoppingCart className="size-4 mr-2" /> Đặt sân
                    </Button>
                  </div>
                </div>
              )}
            </>) : (
              /* ---- ĐĂNG NHẬP ĐỂ ĐẶT SÂN ---- */
              <div className="rounded-xl border border-primary/30 bg-primary/5 p-8 text-center space-y-4">
                <ShoppingCart className="size-12 mx-auto text-primary/60" />
                <div>
                  <h3 className="text-lg font-bold">Đăng nhập để đặt sân</h3>
                  <p className="text-sm text-muted-foreground mt-2 max-w-sm mx-auto">
                    Vui lòng đăng nhập để đặt sân, chọn dịch vụ đi kèm và nhận ưu đãi từ voucher.
                  </p>
                </div>
                <Button className="mx-auto" size="lg" onClick={() => navigate(`/login?redirect=/courts/${id}`)}>
                  Đăng nhập ngay
                </Button>
              </div>
            )}
            </>)}
          </div>
        </div>
      </motion.div>

      {/* ==================== MODAL XÁC NHẬN ĐẶT SÂN ==================== */}
      {/*
       * Modal hiển thị tóm tắt thông tin đặt sân trước khi gửi.
       * Nội dung:
       * - Tên sân, ngày chơi, khung giờ.
       * - Mã giảm giá (nếu có) và số tiền được giảm.
       * - Tổng tiền cuối cùng.
       * - Phương thức thanh toán.
       * - Cảnh báo: có thể hủy trước 3 tiếng.
       * - Nếu bật auto-booking: thông báo hệ thống sẽ tự động đặt lịch tuần sau.
       * Nút: Hủy (đóng modal) | Xác nhận đặt sân (gọi handleBooking).
       */}
      <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title="Xác nhận đặt sân">
        <div className="space-y-3 text-sm">
          <p><strong>Sân:</strong> {court.tenSan}</p>
          <p><strong>Ngày:</strong> {formatDate(selectedDate)}</p>
          <p><strong>Khung giờ:</strong> {selectedSlotObjects.map((s: any) => `${s.gioBatDau?.substring(0, 5)}-${s.gioKetThuc?.substring(0, 5)}`).join(', ')}</p>
          {appliedDiscount && (
            <div className="flex justify-between text-success">
              <span><strong>Mã giảm giá:</strong> {appliedDiscount.code}</span>
              <span>-{formatPrice(discountAmount)}</span>
            </div>
          )}
          <p><strong>Tổng tiền:</strong> <span className="text-lg font-bold text-primary">{formatPrice(totalPrice)}</span></p>
          <p><strong>Thanh toán:</strong> {paymentMethod === 'cash' ? 'Tiền mặt tại sân' : paymentMethod === 'transfer' ? 'Chuyển khoản ngân hàng' : paymentMethod === 'momo' ? 'Ví MoMo' : 'Visa/Mastercard'}</p>
          {/* Cảnh báo chính sách hủy */}
          <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 text-warning text-xs">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>Bạn có thể hủy trước 3 tiếng. Hủy sau thời gian này sẽ không được chấp nhận.</span>
          </div>
          {/* Thông báo auto-booking nếu được bật */}
          {autoBooking && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-600 text-xs">
              <RefreshCw className="size-4 shrink-0 mt-0.5" />
              <span>Hệ thống sẽ tự động đặt lịch khung giờ này cho cùng ngày tuần sau.</span>
            </div>
          )}
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={() => setConfirmOpen(false)}>Hủy</Button>
          <Button onClick={handleBooking} loading={bookingLoading}>Xác nhận đặt sân</Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
