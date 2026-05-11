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

const REVIEW_PAGE_SIZE = 5

export default function CourtDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuthStore()
  const queryClient = useQueryClient()
  const isVIP = user?.is_vip === true
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [selectedSlots, setSelectedSlots] = useState<string[]>([])
  const [selectedServices, setSelectedServices] = useState<Record<string, number>>({})
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'transfer' | 'momo' | 'visa'>('cash')
  const [autoBooking, setAutoBooking] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [bookingLoading, setBookingLoading] = useState(false)
  const [reviewPage, setReviewPage] = useState(1)
  const [reviewRating, setReviewRating] = useState(0)
  const [reviewComment, setReviewComment] = useState('')
  const [discountCode, setDiscountCode] = useState('')
  const [appliedDiscount, setAppliedDiscount] = useState<any>(null)
  const [validatingDiscount, setValidatingDiscount] = useState(false)
  const [showVoucherList, setShowVoucherList] = useState(false)
  const [hasAutoApplied, setHasAutoApplied] = useState<string | null>(null)

  const { data: court, isLoading: courtLoading } = useQuery({
    queryKey: ['courts', id],
    queryFn: () => courtService.getCourtById(id!).then(r => r.data.data ?? r.data),
    enabled: !!id,
  })

  const { data: slotsData } = useQuery({
    queryKey: ['timeslots', id, selectedDate],
    queryFn: () => courtService.getTimeSlots(id!, selectedDate).then(r => r.data.data ?? r.data ?? []),
    enabled: !!id,
  })

  const { data: servicesData } = useQuery({
    queryKey: ['services'],
    queryFn: () => serviceService.getAll().then(r => r.data.data ?? r.data ?? []),
  })

  const { data: reviewsData } = useQuery({
    queryKey: ['reviews', 'court', id],
    queryFn: () => reviewService.getByCourt(id!, { limit: 100 }).then(r => {
      const list = r.data.data ?? r.data ?? []
      return Array.isArray(list) ? list : list.reviews ?? []
    }),
    enabled: !!id,
  })

  const { data: myDiscounts } = useQuery({
    queryKey: ['my-vouchers'],
    queryFn: () => discountService.getMyDiscounts().then(r => r.data.data ?? []),
    enabled: isAuthenticated,
    staleTime: 0,
  })


  const reviews = reviewsData || []
  const totalPages = Math.max(1, Math.ceil(reviews.length / REVIEW_PAGE_SIZE))
  const pagedReviews = reviews.slice((reviewPage - 1) * REVIEW_PAGE_SIZE, reviewPage * REVIEW_PAGE_SIZE)

  const reviewMutation = useMutation({
    mutationFn: () => reviewService.create({ booking_id: '0', rating: reviewRating, comment: reviewComment || undefined, courtId: id }),
    onSuccess: () => {
      toast.success('Cảm ơn bạn đã đánh giá!')
      queryClient.invalidateQueries({ queryKey: ['reviews', 'court', id] })
      setReviewRating(0); setReviewComment('')
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gửi đánh giá thất bại'),
  })

  const timeSlots = Array.isArray(slotsData) ? slotsData : slotsData?.slots ?? []
  const services = Array.isArray(servicesData) ? servicesData : servicesData?.services ?? []

  const selectedSlotObjects = timeSlots.filter((s: any) => selectedSlots.includes(String(s.id)))
  const courtPrice = selectedSlotObjects.reduce((sum: number, s: any) => sum + (Number(s.mucGia) || 0), 0)
  const servicesPrice = Object.entries(selectedServices).reduce((sum, [svcId, qty]) => {
    const svc = services.find((s: any) => String(s.id) === svcId)
    return sum + (svc ? (Number(svc.donGia) || 0) * qty : 0)
  }, 0)
  const subTotal = courtPrice + servicesPrice
  
  // Calculate discount dynamically
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

  const totalPrice = subTotal - discountAmount

  const handleSlotToggle = (slotId: string) => {
    setSelectedSlots(prev => prev.includes(slotId) ? prev.filter(s => s !== slotId) : [...prev, slotId])
    setAppliedDiscount(null)
  }

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

  if (!court) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center text-muted-foreground">
        <MapPin className="size-16 mx-auto mb-4 opacity-20" />
        <p className="text-lg">Không tìm thấy sân</p>
      </div>
    )
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Court Info Header */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {court.hinhAnh && (
            <div className="aspect-video bg-muted">
              <img src={court.hinhAnh} alt={court.tenSan} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="p-6">
            <h1 className="text-2xl font-bold">{court.tenSan}</h1>
            <p className="mt-2 text-muted-foreground">{court.moTa}</p>
            <div className="flex items-center gap-3 mt-3">
              <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                court.trangThai === 'Sẵn sàng' ? 'bg-success/10 text-success' : 
                court.trangThai === 'Bảo trì' ? 'bg-orange-500/10 text-orange-600' : 
                'bg-muted text-muted-foreground'
              }`}>
                {court.trangThai || 'Sẵn sàng'}
              </div>
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

        {/* Two-column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* LEFT TAB: Reviews */}
          <div className="space-y-6">
            <div className="rounded-xl border border-border bg-card p-6">
              <h2 className="font-semibold mb-4 flex items-center gap-2">
                <MessageSquareText className="size-5" /> Đánh giá ({reviews.length})
              </h2>

              {/* Review Form */}
              {isAuthenticated ? (
                <div className="mb-6 p-4 rounded-lg border border-border bg-muted/30">
                  <p className="text-sm font-medium mb-3">Viết đánh giá của bạn</p>
                  <div className="flex items-center gap-1 mb-3">
                    {[1, 2, 3, 4, 5].map(s => (
                      <button key={s} onClick={() => setReviewRating(s)} className="p-0.5">
                        <Star className={`size-6 ${s <= reviewRating ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground'}`} />
                      </button>
                    ))}
                    {reviewRating > 0 && <span className="text-xs text-muted-foreground ml-2">{reviewRating}/5</span>}
                  </div>
                  <textarea value={reviewComment} onChange={e => setReviewComment(e.target.value)}
                    placeholder="Chia sẻ trải nghiệm của bạn về sân này..."
                    className="w-full h-20 px-4 py-3 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none resize-none text-sm mb-3" />
                  <Button onClick={() => reviewMutation.mutate()} disabled={reviewRating === 0} loading={reviewMutation.isPending} size="sm">
                    Gửi đánh giá
                  </Button>
                </div>
              ) : (
                <div className="mb-6 p-4 rounded-lg border border-border bg-muted/30 text-center">
                  <p className="text-sm text-muted-foreground">
                    <button onClick={() => navigate('/login')} className="text-primary hover:underline">Đăng nhập</button> để viết đánh giá
                  </p>
                </div>
              )}

              {/* Review List */}
              {pagedReviews.length > 0 ? (
                <div className="space-y-4">
                  {pagedReviews.map((r: any) => (
                    <div key={r.id} className="pb-4 border-b border-border last:border-0 last:pb-0">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm">{r.full_name || 'Khách hàng'}</span>
                        <span className="text-xs text-muted-foreground">{r.ngayTao ? new Date(r.ngayTao).toLocaleDateString('vi-VN') : ''}</span>
                      </div>
                      <div className="flex items-center gap-0.5 mt-1">
                        {[1, 2, 3, 4, 5].map(s => (
                          <Star key={s} className={`size-3.5 ${s <= (r.diemSao || 0) ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground/30'}`} />
                        ))}
                      </div>
                      {r.binhLuan && <p className="text-sm text-muted-foreground mt-1">{r.binhLuan}</p>}
                    </div>
                  ))}

                  {/* Pagination */}
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

          {/* RIGHT TAB: Booking */}
          <div className="space-y-6">
            {court.trangThai === 'Bảo trì' ? (
              <div className="rounded-xl border border-orange-500/50 bg-orange-500/5 p-8 text-center">
                <AlertCircle className="size-12 mx-auto mb-4 text-orange-500" />
                <h3 className="text-lg font-bold text-orange-600">Sân hiện đang được bảo trì</h3>
                <p className="text-muted-foreground mt-2 max-w-sm mx-auto">
                  Vui lòng quay lại sau! Chúng tôi đang nỗ lực để sân sớm hoạt động trở lại.
                </p>
              </div>
            ) : court.trangThai !== 'Sẵn sàng' ? (
              <div className="rounded-xl border border-warning/50 bg-warning/5 p-6 text-center">
                <AlertCircle className="size-10 mx-auto mb-3 text-warning" />
                <p className="font-semibold text-warning">Sân không khả dụng</p>
                <p className="text-sm text-muted-foreground mt-1">Sân này hiện không thể đặt lịch vào lúc này.</p>
              </div>
            ) : (<>
              {/* Date Picker */}
              <div className="rounded-xl border border-border bg-card p-6">
                <h2 className="font-semibold mb-4">Chọn ngày</h2>
                <input type="date" value={selectedDate} min={today}
                  onChange={e => { setSelectedDate(e.target.value); setSelectedSlots([]) }}
                  className="w-full sm:w-auto h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" />
              </div>

              {/* Time Slots Grid */}
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
                    return (
                      <button key={slot.id} disabled={isBooked} onClick={() => handleSlotToggle(String(slot.id))}
                        className={`p-3 rounded-lg border text-sm font-medium transition-all ${isBooked ? 'border-border bg-muted/50 text-muted-foreground cursor-not-allowed' :
                            isSelected ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/50 hover:bg-accent'}`}>
                        <div>{slot.gioBatDau?.substring(0, 5)} - {slot.gioKetThuc?.substring(0, 5)}</div>
                        <div className="text-xs text-muted-foreground mt-1">{formatPrice(Number(slot.mucGia || 0))}</div>
                        {isBooked && <div className="text-xs text-destructive mt-1">Đã đặt</div>}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Services */}
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

            {/* Payment Method */}
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

            {/* Booking Summary */}
            {selectedSlots.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-6 sticky bottom-20 sm:bottom-0 z-10">
                <h2 className="font-semibold mb-4 text-primary flex items-center gap-2">
                  <Ticket className="size-5" /> Mã giảm giá
                </h2>
                
                {isAuthenticated ? (
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

                    {/* Quick Voucher List */}
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
                              {/* Removed confusing quantity badge */}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mb-4 italic">Đăng nhập để xem kho voucher của bạn</p>
                )}

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
            </>)}
          </div>
        </div>
      </motion.div>

      {/* Confirm Modal */}
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
          <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 text-warning text-xs">
            <AlertCircle className="size-4 shrink-0 mt-0.5" />
            <span>Bạn có thể hủy trước 3 tiếng. Hủy sau thời gian này sẽ không được chấp nhận.</span>
          </div>
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
