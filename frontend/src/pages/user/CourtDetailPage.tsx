import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { MapPin, Clock, Star, ShoppingCart, AlertCircle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { courtService, bookingService, serviceService } from '@/services'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice, formatDate } from '@/lib/utils'

export default function CourtDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { isAuthenticated, user } = useAuthStore()
  const isVIP = user?.is_vip === true
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [selectedSlots, setSelectedSlots] = useState<string[]>([])
  const [selectedServices, setSelectedServices] = useState<Record<string, number>>({})
  const [paymentType, setPaymentType] = useState<'deposit' | 'full'>('deposit')
  const [autoBooking, setAutoBooking] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [bookingLoading, setBookingLoading] = useState(false)

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

  const timeSlots = Array.isArray(slotsData) ? slotsData : slotsData?.slots ?? []
  const services = Array.isArray(servicesData) ? servicesData : servicesData?.services ?? []

  const selectedSlotObjects = timeSlots.filter((s: any) => selectedSlots.includes(String(s.id)))
  const courtPrice = selectedSlotObjects.reduce((sum: number, s: any) => sum + Number(s.mucGia || 0), 0)
  const servicesPrice = Object.entries(selectedServices).reduce((sum, [svcId, qty]) => {
    const svc = services.find((s: any) => String(s.id) === svcId)
    return sum + (svc ? Number(svc.donGia) * qty : 0)
  }, 0)
  const totalPrice = courtPrice + servicesPrice
  const depositAmount = Math.round(totalPrice * 0.1)

  const handleSlotToggle = (slotId: string) => {
    setSelectedSlots(prev => prev.includes(slotId) ? prev.filter(s => s !== slotId) : [...prev, slotId])
  }

  const handleBooking = async () => {
    if (!isAuthenticated) { navigate('/login'); return }
    setBookingLoading(true)
    try {
      await bookingService.createBooking({
        sanId: id,
        ngayChoi: selectedDate,
        khungGioIds: selectedSlots,
        dichVu: Object.entries(selectedServices).map(([id, qty]) => ({ dichVuId: id, soLuong: qty })),
        loaiThanhToan: paymentType,
        isAutoBooking: autoBooking,
      })
      toast.success(autoBooking ? 'Đặt sân thành công! Hệ thống sẽ tự động đặt lịch cho tuần sau.' : 'Đặt sân thành công!')
      setConfirmOpen(false)
      navigate('/my-bookings')
    } catch (err: any) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'Đặt sân thất bại')
    } finally { setBookingLoading(false) }
  }

  if (courtLoading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-xl" />
        <Skeleton className="h-48 w-full rounded-xl" />
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
    <div className="max-w-4xl mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
        {/* Court Info */}
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          {court.hinhAnh && (
            <div className="aspect-video bg-muted">
              <img src={court.hinhAnh} alt={court.tenSan} className="w-full h-full object-cover" />
            </div>
          )}
          <div className="p-6">
            <h1 className="text-2xl font-bold">{court.tenSan}</h1>
            <p className="mt-2 text-muted-foreground">{court.moTa}</p>
            <div className={`inline-block mt-3 px-3 py-1 rounded-full text-sm font-medium ${court.trangThai === 'Sẵn sàng' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
              {court.trangThai || 'Sẵn sàng'}
            </div>
          </div>
        </div>

        {/* Date Picker */}
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold mb-4">Chọn ngày</h2>
          <input type="date" value={selectedDate} min={today}
            onChange={e => { setSelectedDate(e.target.value); setSelectedSlots([]) }}
            className="w-full sm:w-auto" />
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

        {/* Booking Summary */}
        {selectedSlots.length > 0 && (
          <div className="rounded-xl border border-border bg-card p-6 sticky bottom-20 sm:bottom-0">
            <h2 className="font-semibold mb-4">Tóm tắt đặt sân</h2>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span>Tiền sân</span><span>{formatPrice(courtPrice)}</span></div>
              {servicesPrice > 0 && <div className="flex justify-between"><span>Dịch vụ</span><span>{formatPrice(servicesPrice)}</span></div>}
              <div className="flex justify-between font-semibold text-base border-t border-border pt-2">
                <span>Tổng tiền</span><span>{formatPrice(totalPrice)}</span>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              {/* VIP Auto-Booking Toggle */}
              {isVIP && (
                <div className="flex items-center justify-between p-3 rounded-lg border border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="size-4 text-amber-500" />
                    <div>
                      <p className="text-sm font-medium">Tự động đặt lịch tuần sau</p>
                      <p className="text-xs text-muted-foreground">Tự động đặt lại khung giờ này cho cùng ngày trong tuần kế tiếp</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setAutoBooking(!autoBooking)}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 flex items-center px-0.5 ${
                      autoBooking ? 'bg-amber-500' : 'bg-muted-foreground/30'
                    }`}
                  >
                    <span className={`size-5 rounded-full bg-white shadow transition-transform duration-200 ${
                      autoBooking ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setPaymentType('deposit')}
                  className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-all ${paymentType === 'deposit' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'}`}>
                  Cọc 10%<br /><span className="text-xs text-muted-foreground">{formatPrice(depositAmount)}</span>
                </button>
                <button onClick={() => setPaymentType('full')}
                  className={`flex-1 p-3 rounded-lg border text-sm font-medium transition-all ${paymentType === 'full' ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:bg-accent'}`}>
                  Thanh toán 100%<br /><span className="text-xs text-muted-foreground">{formatPrice(totalPrice)}</span>
                </button>
              </div>
              <Button className="w-full" size="lg" onClick={() => setConfirmOpen(true)}>
                <ShoppingCart className="size-4 mr-2" /> Đặt sân
              </Button>
            </div>
          </div>
        )}
      </motion.div>

      {/* Confirm Modal */}
      <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title="Xác nhận đặt sân">
        <div className="space-y-3 text-sm">
          <p><strong>Sân:</strong> {court.tenSan}</p>
          <p><strong>Ngày:</strong> {formatDate(selectedDate)}</p>
          <p><strong>Khung giờ:</strong> {selectedSlotObjects.map((s: any) => `${s.gioBatDau?.substring(0, 5)}-${s.gioKetThuc?.substring(0, 5)}`).join(', ')}</p>
          <p><strong>Hình thức:</strong> {paymentType === 'deposit' ? `Cọc 10% (${formatPrice(depositAmount)})` : `Thanh toán 100% (${formatPrice(totalPrice)})`}</p>
          {paymentType === 'deposit' && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-warning/10 text-warning text-xs">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>Bạn có thể hủy trước 3 tiếng. Khoản cọc 10% sẽ không được hoàn lại nếu hủy.</span>
            </div>
          )}
          {autoBooking && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 text-amber-600 text-xs">
              <RefreshCw className="size-4 shrink-0 mt-0.5" />
              <span>Hệ thống sẽ tự động đặt lịch khung giờ này cho cùng ngày tuần sau. Nếu có người khác đặt trước khi hệ thống xử lý, bạn sẽ nhận được thông báo.</span>
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
