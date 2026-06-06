/**
 * ScheduleBoardPage.tsx
 *
 * Trang bảng lịch sân (Schedule Board) dành cho admin.
 * Hiển thị toàn bộ lịch đặt sân trong một tuần dưới dạng bảng lưới (grid),
 * với các hàng là khung giờ và các cột là ngày trong tuần (Thứ 2 - Chủ nhật).
 *
 * Chức năng chính:
 * - Điều hướng tuần: xem tuần trước, tuần sau, quay về tuần hiện tại.
 * - Lọc theo sân: chọn một sân cụ thể hoặc xem tất cả.
 * - Hiển thị trạng thái đặt sân với màu sắc khác nhau:
 *   + Vàng (amber): Đã đặt (chưa thanh toán).
 *   + Xanh dương (blue): Đã thanh toán.
 *   + Xanh lá (green): Đang sử dụng (đã check-in).
 *   + Xám (slate): Hoàn thành.
 *   + Đỏ (red): Đã hủy.
 *   + Tím (purple): Đã cọc.
 * - Tooltip chi tiết khi hover vào mỗi block đặt sân: tên khách, sân, giờ,
 *   loại đặt (định kỳ/vãng lai), VIP/thường.
 * - Hỗ trợ hiển thị cả trường hợp chọn tất cả sân (gộp khung giờ từ mọi sân).
 *
 * Luồng dữ liệu:
 * 1. Lấy danh sách sân từ API.
 * 2. Lấy danh sách khung giờ: nếu chọn sân cụ thể -> lấy khung giờ sân đó;
 *    nếu chọn tất cả -> gộp khung giờ từ tất cả sân, loại bỏ trùng lặp.
 * 3. Lấy danh sách booking trong tuần từ API admin.
 * 4. Xây dựng bookingMap: Map<dateKey_timeKey, bookings[]> để tra cứu nhanh.
 * 5. Render bảng lưới: mỗi ô = giao của khung giờ và ngày, hiển thị các booking.
 *
 * Hàm helper `getMonday` và `formatDateStr` xử lý việc tính toán tuần
 * và định dạng ngày tháng an toàn với timezone.
 */

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Filter, User, Zap, Star, CheckCircle, XCircle, MapPin, Clock, CreditCard, Banknote } from 'lucide-react'
import { adminService, courtService, timeSlotService } from '@/services'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatTime, cn } from '@/lib/utils'

/**
 * Tính ngày thứ Hai của tuần chứa ngày `d`.
 * Cách tính:
 * - Nếu chủ nhật (getDay() === 0) -> lùi 6 ngày.
 * - Ngược lại -> lùi (getDay() - 1) ngày để về thứ Hai.
 *
 * @param d - Ngày bất kỳ trong tuần cần tìm thứ Hai
 * @returns Đối tượng Date của ngày thứ Hai, giờ đặt về 00:00:00
 */
function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

/**
 * Định dạng ngày thành chuỗi YYYY-MM-DD an toàn với timezone.
 * KHÔNG dùng toISOString() vì nó có thể bị lệch ngày do múi giờ.
 * Thay vào đó, trích xuất trực tiếp year/month/day từ local time.
 *
 * @param d - Đối tượng Date cần định dạng
 * @returns Chuỗi ngày dạng "YYYY-MM-DD"
 */
function formatDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** Nhãn tiếng Việt cho 7 ngày trong tuần, bắt đầu từ Thứ 2 */
const DAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']

/**
 * Component trang bảng lịch sân.
 * Hiển thị lịch đặt sân theo tuần dạng bảng lưới (khung giờ x ngày).
 *
 * @returns Giao diện bảng lịch sân với điều hướng tuần và bộ lọc sân.
 */
export default function ScheduleBoardPage() {
  const today = new Date()
  /** Ngày thứ Hai của tuần hiện tại đang xem */
  const [weekStart, setWeekStart] = useState(() => getMonday(today))
  /** ID sân được chọn để lọc (rỗng = tất cả sân) */
  const [selectedCourtId, setSelectedCourtId] = useState<string>('')

  /** Ngày Chủ nhật của tuần hiện tại (thứ Hai + 6 ngày) */
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)

  /**
   * Mảng 7 ngày trong tuần (Date objects).
   * Dùng useMemo để chỉ tính lại khi weekStart thay đổi.
   */
  const weekDays = useMemo(() => {
    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + i)
      days.push(d)
    }
    return days
  }, [weekStart])

  /**
   * Lấy danh sách tất cả sân để hiển thị trong dropdown lọc.
   */
  const { data: courtsData } = useQuery({
    queryKey: ['courts'],
    queryFn: () => courtService.getCourts().then(r => r.data.data ?? r.data ?? []),
  })
  const courts = Array.isArray(courtsData) ? courtsData : []

  /**
   * Lấy danh sách booking trong khoảng tuần đang xem từ API admin.
   * Query key bao gồm weekStart, weekEnd, và selectedCourtId để tự động
   * gọi lại khi thay đổi tuần hoặc sân lọc.
   */
  const { data: bookingsData, isLoading: bookingsLoading } = useQuery({
    queryKey: ['admin', 'schedule-board', formatDateStr(weekStart), formatDateStr(weekEnd), selectedCourtId],
    queryFn: () => adminService.getScheduleBoard({
      start_date: formatDateStr(weekStart),
      end_date: formatDateStr(weekEnd),
      court_id: selectedCourtId || undefined, // undefined -> lấy tất cả sân
    }).then(r => r.data.data ?? r.data ?? []),
  })
  const bookings = Array.isArray(bookingsData) ? bookingsData : []

  /**
   * Lấy danh sách khung giờ để hiển thị các hàng trong bảng.
   *
   * Logic:
   * - Nếu chọn sân cụ thể: lấy khung giờ của sân đó.
   * - Nếu chọn tất cả sân: gộp khung giờ từ mọi sân, loại bỏ trùng lặp
   *   (dựa trên giờ bắt đầu), sắp xếp theo thời gian.
   *
   * Hỗ trợ cả key tiếng Việt (gioBatDau/gioKetThuc) và tiếng Anh (start_time/end_time).
   */
  const { data: slotsData, isLoading: slotsLoading } = useQuery({
    queryKey: ['schedule-board-timeslots', selectedCourtId || 'all'],
    queryFn: async () => {
      if (selectedCourtId) {
        // Trường hợp chọn sân cụ thể: lấy khung giờ từ API timeSlotService
        const rawData = await timeSlotService.getByCourt(selectedCourtId).then(r => r.data.data ?? r.data ?? []);

        // Chuẩn hóa dữ liệu: hỗ trợ cả key tiếng Việt và tiếng Anh
        const slots = Array.isArray(rawData) ? rawData : rawData?.slots ?? [];

        return slots.map((s: any) => ({
          // Cắt chuỗi giờ thành HH:mm (5 ký tự đầu) - đồng bộ với giao diện
          start_time: s.gioBatDau?.substring(0, 5) || s.start_time?.substring(0, 5),
          end_time: s.gioKetThuc?.substring(0, 5) || s.end_time?.substring(0, 5),
        })).sort((a: any, b: any) => a.start_time.localeCompare(b.start_time));
      }

      // Trường hợp tất cả sân: gộp khung giờ từ mọi sân
      const allCourts = courts.length ? courts : await courtService.getCourts().then(r => r.data.data ?? r.data ?? []);
      const results = await Promise.all(
        // Gọi API lấy khung giờ cho từng sân (chạy song song)
        allCourts.map((c: any) => timeSlotService.getByCourt(String(c.id)).then(r => r.data.data ?? r.data ?? []))
      );

      const seen = new Set<string>(); // Set để loại bỏ trùng lặp giờ bắt đầu
      const merged: { start_time: string; end_time: string }[] = [];

      results.forEach((rawData: any) => {
        const slots = Array.isArray(rawData) ? rawData : rawData?.slots ?? [];

        slots.forEach((s: any) => {
          const start = s.gioBatDau?.substring(0, 5) || s.start_time?.substring(0, 5);
          const end = s.gioKetThuc?.substring(0, 5) || s.end_time?.substring(0, 5);

          // Chỉ thêm khung giờ nếu chưa có giờ bắt đầu trùng
          if (start && !seen.has(start)) {
            seen.add(start);
            merged.push({ start_time: start, end_time: end });
          }
        });
      });

      // Sắp xếp khung giờ theo thứ tự thời gian tăng dần
      return merged.sort((a, b) => a.start_time.localeCompare(b.start_time));
    },
  });
  /** Danh sách khung giờ đã chuẩn hóa */
  const timeRows = Array.isArray(slotsData) ? slotsData : []
  console.log(timeRows)

  /**
   * Xây dựng Map để tra cứu nhanh booking theo ô (ngày + khung giờ).
   * Key: `${dateKey}_${timeKey}` (VD: "2024-05-15_06:00").
   * Value: mảng các booking trong ô đó.
   *
   * Mỗi booking lấy booking_date làm ngày và start_time làm giờ.
   */
  const bookingMap = useMemo(() => {
    const map = new Map<string, any[]>()
    bookings.forEach((b: any) => {
      const d = new Date(b.booking_date)
      const dateKey = formatDateStr(d)
      const timeKey = (b.start_time || '').substring(0, 5)
      const key = `${dateKey}_${timeKey}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(b)
    })
    return map
  }, [bookings])

  /**
   * Điều hướng tuần: lùi 7 ngày (prev) hoặc tiến 7 ngày (next).
   *
   * @param direction - 'prev' (tuần trước) hoặc 'next' (tuần sau)
   */
  const goToWeek = (direction: 'prev' | 'next') => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + (direction === 'prev' ? -7 : 7))
    setWeekStart(d)
  }

  /** Quay về tuần hiện tại (chứa ngày hôm nay) */
  const goToToday = () => setWeekStart(getMonday(today))

  return (
    <div className="space-y-6 pb-32 animate-in fade-in duration-500">
      {/* Thanh tiêu đề: tiêu đề, bộ lọc sân, legend màu sắc, điều hướng tuần */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground uppercase tracking-tighter">Lịch sân</h1>
          <div className="flex items-center gap-4 mt-2">
            {/* Dropdown chọn sân để lọc */}
            <div className="bg-card p-1 rounded-xl border border-border shadow-sm flex items-center">
              <div className="px-3 text-muted-foreground"><Filter className="size-3.5" /></div>
              <select value={selectedCourtId} onChange={e => setSelectedCourtId(e.target.value)} className="bg-transparent text-xs font-bold outline-none cursor-pointer pr-4">
                <option value="">Tất cả sân</option>
                {courts.map((c: any) => (<option key={c.id} value={String(c.id)}>{c.tenSan}</option>))}
              </select>
            </div>
            {/* Legend (chú thích) màu sắc cho các trạng thái booking */}
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider border-l border-border pl-4 flex-wrap">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border-2 border-blue-500/80 bg-blue-500/5 text-blue-700 dark:text-blue-400">
                <CreditCard className="size-3" /><span>Đã thanh toán</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border-2 border-green-500/80 bg-green-500/5 text-green-700 dark:text-green-400">
                <div className="size-1.5 rounded-full bg-green-500 animate-pulse" /><span>Đang dùng</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border-2 border-slate-300 bg-muted/20 text-muted-foreground">
                <CheckCircle className="size-3" /><span>Hoàn thành</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border-2 border-red-500/50 bg-red-500/5 text-red-600">
                <XCircle className="size-3" /><span>Đã hủy</span>
              </div>
            </div>
          </div>
        </div>

        {/* Điều hướng tuần: nút lùi, nút "Hôm nay", nút tiến, hiển thị khoảng ngày */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-card p-1 rounded-xl border border-border shadow-sm">
            <button onClick={() => goToWeek('prev')} className="p-2 rounded-lg hover:bg-muted transition-all"><ChevronLeft className="size-4" /></button>
            <button onClick={goToToday} className="px-4 py-1.5 text-xs font-bold rounded-lg bg-primary text-primary-foreground transition-all">Hôm nay</button>
            <button onClick={() => goToWeek('next')} className="p-2 rounded-lg hover:bg-muted transition-all"><ChevronRight className="size-4" /></button>
          </div>
          {/* Hiển thị phạm vi ngày của tuần đang xem */}
          <div className="px-4 py-2 bg-card rounded-xl border border-border shadow-sm text-xs font-black tabular-nums">
            {weekDays[0]?.getDate()}/{(weekDays[0]?.getMonth() ?? 0) + 1} — {weekDays[6]?.getDate()}/{(weekDays[6]?.getMonth() ?? 0) + 1}
          </div>
        </div>
      </div>

      {/* Bảng lịch sân chính */}
      <div className="bg-card rounded-[2.5rem] border border-border shadow-2xl overflow-x-auto overflow-y-visible relative">
        <div className="min-w-[1200px]"> {/* Chiều rộng tối thiểu để tránh bị co hẹp trên mobile */}
          {/* Header: cột "Khung giờ" + 7 cột ngày trong tuần */}
          <div className="grid grid-cols-8 bg-muted/50 border-b border-border sticky top-0 z-30 backdrop-blur-xl">
            <div className="px-6 py-8 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 border-r border-border flex items-center justify-center">Khung giờ</div>
            {weekDays.map((d, i) => {
              const isToday = formatDateStr(d) === formatDateStr(today)
              return (
                <div key={i} className={cn('px-2 py-8 text-center border-r border-border last:border-r-0', isToday && 'bg-primary/5')}>
                  <div className={cn('text-[11px] font-black uppercase tracking-widest mb-1', isToday ? 'text-primary' : 'text-muted-foreground')}>{DAY_LABELS[i]}</div>
                  <div className={cn('text-2xl font-black tabular-nums tracking-tight', isToday ? 'text-primary' : 'text-foreground')}>{d.getDate()}/{d.getMonth() + 1}</div>
                </div>
              )
            })}
          </div>

          {/* Body: các hàng khung giờ */}
          <div className="divide-y divide-border">
            {(bookingsLoading || slotsLoading) ? (
              <div className="p-20 text-center"><Skeleton className="h-40 w-full rounded-3xl" /></div>
            ) : (
              timeRows.map((slot: any, ri: number) => {
                const startTime = slot.start_time
                const endTime = slot.end_time
                return (
                  <div key={ri} className="grid grid-cols-8 group/row hover:bg-muted/10 transition-colors">
                    {/* Cột khung giờ: hiển thị giờ bắt đầu - giờ kết thúc */}
                    <div className="px-6 py-12 text-sm font-bold border-r border-border flex flex-col items-center justify-center bg-muted/5 group-hover/row:bg-muted/10 transition-colors">
                      <div className="flex flex-col items-center gap-1.5">
                        <span className="text-foreground text-xl font-black tracking-tighter leading-none">{formatTime(startTime)}</span>
                        <div className="w-6 h-[2px] bg-border rounded-full" />
                        <span className="text-muted-foreground text-xs font-bold opacity-60">{formatTime(endTime)}</span>
                      </div>
                    </div>
                    {/* 7 ô tương ứng với 7 ngày trong tuần */}
                    {weekDays.map((d, ci) => {
                      const dateStr = formatDateStr(d)
                      const timeKey = (startTime || '').substring(0, 5)
                      const cellKey = `${dateStr}_${timeKey}`
                      // Lấy danh sách booking trong ô này từ bookingMap
                      const cellBookings = bookingMap.get(cellKey) || []
                      return (
                        <div key={ci} className={cn('p-2 border-r border-border last:border-r-0 min-h-[160px] relative', formatDateStr(d) === formatDateStr(today) && 'bg-primary/[0.02]')}>
                          <div className="flex flex-col gap-2 h-full">
                            {cellBookings.map((b: any, bi: number) => (
                              <BookingBlock key={bi} booking={b} showCourt={!selectedCourtId} isFirstRow={ri === 0} />
                            ))}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Component hiển thị một block đặt sân (booking) trong ô lịch.
 * Bao gồm:
 * - Hiển thị tóm tắt: tên khách, trạng thái, loại đặt (định kỳ/vãng lai).
 * - Tooltip hover hiển thị chi tiết: tên khách, sân, giờ, loại đặt, VIP/thường.
 * - Màu sắc và style thay đổi theo trạng thái booking và loại khách (VIP).
 *
 * @param booking - Dữ liệu booking (chứa user_name, court_name, start_time, end_time, status, is_vip, is_auto_booking).
 * @param showCourt - Có hiển thị tên sân trong block hay không (true khi xem tất cả sân).
 * @param isFirstRow - Có phải hàng đầu tiên không (để xác định hướng tooltip: xuống dưới hay lên trên).
 */
function BookingBlock({ booking: b, showCourt, isFirstRow }: { booking: any; showCourt: boolean; isFirstRow: boolean }) {
  /** Khách có phải VIP không */
  const isVip = b.is_vip
  /** Trạng thái booking - hỗ trợ nhiều key khác nhau từ API */
  const status = b.booking_status || b.status || b.status_name || ''

  /**
   * Bảng màu cho từng trạng thái booking:
   * - Đã đặt: vàng (amber) - chưa thanh toán.
   * - Đã thanh toán: xanh dương (blue).
   * - Đang sử dụng: xanh lá (green) - đã check-in.
   * - Hoàn thành: xám (slate).
   * - Đã hủy: đỏ (red).
   * - Đã cọc: tím (purple) - mới đặt cọc một phần.
   */
  const statusColors: Record<string, string> = {
    'Đã đặt': 'bg-amber-500/[0.04] text-amber-700 border-amber-500/80 dark:text-amber-400 dark:border-amber-500',
    'Đã thanh toán': 'bg-blue-500/[0.04] text-blue-700 border-blue-500/80 dark:text-blue-400 dark:border-blue-500',
    'Đang sử dụng': 'bg-green-500/[0.04] text-green-700 border-green-500/80 dark:text-green-400 dark:border-green-500',
    'Hoàn thành': 'bg-muted/20 text-muted-foreground border-slate-300 dark:border-slate-700',
    'Đã hủy': 'bg-red-500/5 text-red-600 border-red-500/50 dark:text-red-400 dark:bg-red-500/10',
    'Đã cọc': 'bg-purple-500/[0.04] text-purple-700 border-purple-500/80 dark:text-purple-400 dark:border-purple-500',
  }

  /** Màu mặc định: VIP -> vàng, thường -> tím indigo */
  const defaultStyle = isVip
    ? 'bg-amber-500/[0.04] text-amber-700 border-amber-500/80 dark:text-amber-400 dark:border-amber-500'
    : 'bg-indigo-500/[0.04] text-indigo-700 border-indigo-500/80 dark:text-indigo-400 dark:border-indigo-500'

  /** Style của block dựa trên trạng thái hoặc VIP */
  const currentStyle = statusColors[status] || defaultStyle

  /** Các cờ trạng thái đặc biệt */
  const isCancelled = status === 'Đã hủy'
  const isCompleted = status === 'Hoàn thành'
  const isUsing = status === 'Đang sử dụng'
  const isPastState = isCompleted || isCancelled // Trạng thái quá khứ -> giảm opacity

  /** Màu chấm tròn trạng thái (dot) trên block */
  const statusDotColor =
    isCancelled ? 'bg-red-500' :
    isCompleted ? 'bg-slate-400' :
    isUsing ? 'bg-green-500 animate-pulse' : // Đang sử dụng -> chấm nhấp nháy
    status === 'Đã đặt' ? 'bg-amber-500' :
    status === 'Đã thanh toán' ? 'bg-blue-500' :
    status === 'Đã cọc' ? 'bg-purple-500' :
    isVip ? 'bg-amber-500' : 'bg-indigo-500'

  /** Icon cho trạng thái đặc biệt: Hoàn thành -> CheckCircle, Đã hủy -> XCircle */
  const StatusIcon = isCompleted ? CheckCircle
    : isCancelled ? XCircle
      : null

  /** Nhãn trạng thái viết tắt hiển thị trong block */
  const statusLabel =
    isCancelled ? 'Hủy' :
    isCompleted ? 'Xong' :
    isUsing ? 'Dùng' :
    status === 'Đã đặt' ? 'Đã đặt' :
    status === 'Đã thanh toán' ? 'Đã TT' :
    status === 'Đã cọc' ? 'Đã cọc' : ''

  /** Màu chữ của nhãn trạng thái */
  const statusLabelColor =
    isUsing ? 'text-green-600' :
    status === 'Đã đặt' ? 'text-amber-600' :
    status === 'Đã thanh toán' ? 'text-blue-600' :
    status === 'Đã cọc' ? 'text-purple-600' :
    'opacity-40'

  /** Màu chữ trạng thái trong tooltip hover */
  const hoverStatusColor =
    isCancelled ? 'text-red-500' :
    isCompleted ? 'text-muted-foreground' :
    isUsing ? 'text-green-500' :
    status === 'Đã đặt' ? 'text-amber-500' :
    status === 'Đã thanh toán' ? 'text-blue-500' :
    status === 'Đã cọc' ? 'text-purple-500' :
    'text-primary'

  /** Màu nền icon trong tooltip hover */
  const hoverIconBg =
    isVip ? 'bg-amber-500/20 text-amber-500'
      : status === 'Đã thanh toán' ? 'bg-blue-500/20 text-blue-500'
      : status === 'Đã đặt' ? 'bg-amber-500/20 text-amber-500'
      : status === 'Đã cọc' ? 'bg-purple-500/20 text-purple-500'
      : 'bg-indigo-500/20 text-indigo-500'

  return (
    <div className={cn("group relative z-10 hover:z-[100] animate-in zoom-in-95 duration-300")}>
      {/* Block đặt sân chính */}
      <div className={cn('px-2.5 py-2 rounded-xl text-[10px] font-black transition-all border-2 shadow-sm group-hover:shadow-md cursor-pointer', currentStyle, isPastState && "opacity-70")}>
        <div className="flex items-center justify-between gap-1.5 mb-1">
          <div className="flex items-center gap-1.5 truncate">
            {/* Icon trạng thái hoặc chấm tròn */}
            {StatusIcon ? <StatusIcon className="size-2.5 text-muted-foreground" /> :
              <div className={cn('size-1.5 rounded-full', statusDotColor)} />}
            {/* Tên khách hàng - gạch ngang nếu đã hủy */}
            <span className={cn("truncate max-w-[80px] tracking-tight", isCancelled && "line-through", isPastState && "opacity-70")}>
              {b.user_name}
            </span>
          </div>
          {/* Icon tia sét cho đơn đặt định kỳ (auto booking) */}
          {b.is_auto_booking && !isPastState && <Zap className={cn('size-2.5 fill-current', isVip ? 'text-amber-500' : 'text-indigo-500')} />}
        </div>
        <div className="flex items-center justify-between">
          {/* Tên sân - chỉ hiển thị khi đang xem tất cả sân (showCourt = true) */}
          {showCourt && <div className="text-[8px] opacity-60 font-black truncate">{b.court_name}</div>}
          {/* Nhãn trạng thái viết tắt */}
          <div className={cn("text-[7px] font-black uppercase tracking-tighter ml-auto", statusLabelColor)}>
            {statusLabel}
          </div>
        </div>
      </div>

      {/* Tooltip chi tiết - hiển thị khi hover */}
      <div className={cn(
        "absolute z-[200] w-64 p-5 rounded-3xl bg-popover/98 backdrop-blur-2xl border border-border shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 pointer-events-none",
        // Tooltip xuống dưới cho hàng đầu tiên, lên trên cho các hàng còn lại
        isFirstRow ? "top-full mt-3 left-1/2 -translate-x-1/2" : "bottom-full mb-3 left-1/2 -translate-x-1/2"
      )}>
        <div className="space-y-4">
          {/* Header tooltip: tên khách + trạng thái + icon VIP/user */}
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="space-y-1">
              <div className="font-black text-lg text-foreground truncate">{b.user_name}</div>
              <div className={cn("text-[10px] font-black uppercase tracking-widest", hoverStatusColor)}>
                {status || 'Chưa xác định'}
              </div>
            </div>
            <div className={cn('size-10 rounded-xl flex items-center justify-center', hoverIconBg)}>
              {isVip ? <Star className="size-5 fill-current" /> : <User className="size-5" />}
            </div>
          </div>
          {/* Thông tin sân và giờ chơi */}
          <div className="grid grid-cols-1 gap-2 text-xs font-bold">
            <div className="flex items-center gap-2 text-muted-foreground uppercase text-[9px]"><MapPin className="size-3" /><span>Sân:</span> <span className="text-foreground ml-auto">{b.court_name}</span></div>
            <div className="flex items-center gap-2 text-muted-foreground uppercase text-[9px]"><Clock className="size-3" /><span>Giờ:</span> <span className="text-foreground ml-auto">{formatTime(b.start_time)} - {formatTime(b.end_time)}</span></div>
          </div>
          {/* Badge loại đặt và VIP/thường */}
          <div className="flex items-center gap-2 pt-1 border-t border-border mt-2 pt-3">
            {/* Loại đơn: Định kỳ (auto) hoặc Vãng lai */}
            <div className={cn('flex-1 px-3 py-2 rounded-xl border flex items-center justify-center gap-1.5 text-[9px] font-black uppercase', b.is_auto_booking ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-muted/50 border-border text-muted-foreground')}>
              <Zap className="size-3" />{b.is_auto_booking ? 'Định kỳ' : 'Vãng lai'}
            </div>
            {/* VIP hoặc Thường */}
            <div className={cn('flex-1 px-3 py-2 rounded-xl border flex items-center justify-center gap-1.5 text-[9px] font-black uppercase', isVip ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-blue-500/10 border-blue-500/20 text-blue-500')}>
              <span>★</span>{isVip ? 'VIP' : 'Thường'}
            </div>
          </div>
        </div>
        {/* Mũi tên của tooltip - hướng lên hoặc xuống tùy vị trí */}
        <div className={cn("absolute left-1/2 -translate-x-1/2 size-3 bg-popover border-border rotate-45", isFirstRow ? "bottom-full -mb-1.5 border-t border-l" : "top-full -mt-1.5 border-b border-r")} />
      </div>
    </div>
  )
}
