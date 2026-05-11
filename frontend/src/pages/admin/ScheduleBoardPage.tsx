import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Filter, User, Zap, Star, CheckCircle, XCircle, MapPin, Clock } from 'lucide-react'
import { adminService, courtService, timeSlotService } from '@/services'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatTime, cn } from '@/lib/utils'

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

// Fixed: Robust local date string to prevent timezone shift
function formatDateStr(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const DAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']

export default function ScheduleBoardPage() {
  const today = new Date()
  const [weekStart, setWeekStart] = useState(() => getMonday(today))
  const [selectedCourtId, setSelectedCourtId] = useState<string>('')

  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)

  const weekDays = useMemo(() => {
    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart)
      d.setDate(weekStart.getDate() + i)
      days.push(d)
    }
    return days
  }, [weekStart])

  const { data: courtsData } = useQuery({
    queryKey: ['courts'],
    queryFn: () => courtService.getCourts().then(r => r.data.data ?? r.data ?? []),
  })
  const courts = Array.isArray(courtsData) ? courtsData : []

  const { data: bookingsData, isLoading: bookingsLoading } = useQuery({
    queryKey: ['admin', 'schedule-board', formatDateStr(weekStart), formatDateStr(weekEnd), selectedCourtId],
    queryFn: () => adminService.getScheduleBoard({
      start_date: formatDateStr(weekStart),
      end_date: formatDateStr(weekEnd),
      court_id: selectedCourtId || undefined,
    }).then(r => r.data.data ?? r.data ?? []),
  })
  const bookings = Array.isArray(bookingsData) ? bookingsData : []

  const { data: slotsData, isLoading: slotsLoading } = useQuery({
    queryKey: ['admin', 'timeslots', 'all-base'],
    queryFn: async () => {
      const allCourts = courts.length ? courts : await courtService.getCourts().then(r => r.data.data ?? r.data ?? [])
      const results = await Promise.all(
        allCourts.map((c: any) => timeSlotService.getByCourt(String(c.id)).then(r => r.data.data ?? r.data ?? []))
      )
      const uniqueTimes = new Map<string, { start_time: string; end_time: string }>()

      results.flat().forEach((s: any) => {
        const start = s.gioBatDau || s.start_time
        const end = s.gioKetThuc || s.end_time
        if (start && !uniqueTimes.has(start)) {
          uniqueTimes.set(start, { start_time: start, end_time: end })
        }
      })

      // Include booking times even if slot is deleted
      bookings.forEach((b: any) => {
        if (b.start_time && !uniqueTimes.has(b.start_time)) {
          uniqueTimes.set(b.start_time, { start_time: b.start_time, end_time: b.end_time })
        }
      })

      return Array.from(uniqueTimes.values()).sort((a, b) => a.start_time.localeCompare(b.start_time))
    },
    enabled: courts.length > 0 && !!bookingsData,
  })
  const timeRows = Array.isArray(slotsData) ? slotsData : []

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

  const goToWeek = (direction: 'prev' | 'next') => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + (direction === 'prev' ? -7 : 7))
    setWeekStart(d)
  }

  const goToToday = () => setWeekStart(getMonday(today))

  return (
    <div className="space-y-6 pb-32 animate-in fade-in duration-500">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground uppercase tracking-tighter">Thời khóa biểu</h1>
          <div className="flex items-center gap-4 mt-2">
            <div className="bg-card p-1 rounded-xl border border-border shadow-sm flex items-center">
              <div className="px-3 text-muted-foreground"><Filter className="size-3.5" /></div>
              <select value={selectedCourtId} onChange={e => setSelectedCourtId(e.target.value)} className="bg-transparent text-xs font-bold outline-none cursor-pointer pr-4">
                <option value="">Tất cả sân</option>
                {courts.map((c: any) => (<option key={c.id} value={String(c.id)}>{c.tenSan}</option>))}
              </select>
            </div>
            <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider border-l border-border pl-4">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border-2 border-indigo-500/80 bg-indigo-500/5 text-indigo-700 dark:text-indigo-400">
                <div className="size-1.5 rounded-full bg-indigo-500" /><span>Thường</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border-2 border-amber-500/80 bg-amber-500/5 text-amber-700 dark:text-amber-400">
                <div className="size-1.5 rounded-full bg-amber-500" /><span>VIP</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border-2 border-slate-300 bg-muted/20 text-muted-foreground">
                <CheckCircle className="size-3" /><span>Đã xong</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border-2 border-red-500/50 bg-red-500/5 text-red-600">
                <XCircle className="size-3" /><span>Hủy</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-card p-1 rounded-xl border border-border shadow-sm">
            <button onClick={() => goToWeek('prev')} className="p-2 rounded-lg hover:bg-muted transition-all"><ChevronLeft className="size-4" /></button>
            <button onClick={goToToday} className="px-4 py-1.5 text-xs font-bold rounded-lg bg-primary text-primary-foreground transition-all">Hôm nay</button>
            <button onClick={() => goToWeek('next')} className="p-2 rounded-lg hover:bg-muted transition-all"><ChevronRight className="size-4" /></button>
          </div>
          <div className="px-4 py-2 bg-card rounded-xl border border-border shadow-sm text-xs font-black tabular-nums">
            {weekDays[0]?.getDate()}/{weekDays[0]?.getMonth() + 1} — {weekDays[6]?.getDate()}/{weekDays[6]?.getMonth() + 1}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-[2.5rem] border border-border shadow-2xl overflow-x-auto overflow-y-visible relative">
        <div className="min-w-[1200px]">
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

          <div className="divide-y divide-border">
            {(bookingsLoading || slotsLoading) ? (
              <div className="p-20 text-center"><Skeleton className="h-40 w-full rounded-3xl" /></div>
            ) : (
              timeRows.map((slot: any, ri: number) => {
                const startTime = slot.start_time
                const endTime = slot.end_time
                return (
                  <div key={ri} className="grid grid-cols-8 group/row hover:bg-muted/10 transition-colors">
                    <div className="px-6 py-12 text-sm font-bold border-r border-border flex flex-col items-center justify-center bg-muted/5 group-hover/row:bg-muted/10 transition-colors">
                      <div className="flex flex-col items-center gap-1.5">
                        <span className="text-foreground text-xl font-black tracking-tighter leading-none">{formatTime(startTime)}</span>
                        <div className="w-6 h-[2px] bg-border rounded-full" />
                        <span className="text-muted-foreground text-xs font-bold opacity-60">{formatTime(endTime)}</span>
                      </div>
                    </div>
                    {weekDays.map((d, ci) => {
                      const dateStr = formatDateStr(d)
                      const timeKey = (startTime || '').substring(0, 5)
                      const cellKey = `${dateStr}_${timeKey}`
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

function BookingBlock({ booking: b, showCourt, isFirstRow }: { booking: any; showCourt: boolean; isFirstRow: boolean }) {
  const isVip = b.is_vip
  // Bắt mọi tên trường trạng thái mà Backend có thể trả về
  const statusRaw = String(b.booking_status || b.status || b.status_name || '').toLowerCase().trim();
  
  // Bắt cả tiếng Anh và tiếng Việt (không dấu và có dấu)
  const isCompleted = statusRaw === 'hoàn thành' || statusRaw === 'completed' || statusRaw === 'hoan thanh';
  const isCancelled = statusRaw === 'đã hủy' || statusRaw === 'cancelled' || statusRaw === 'da huy';
  const isUsing = statusRaw === 'đang sử dụng' || statusRaw === 'đang dùng' || statusRaw === 'in_progress';
  const isPastState = isCompleted || isCancelled;

  const statusColors = {
    cancelled: 'bg-red-500/5 text-red-600 border-red-500/50 dark:text-red-400 dark:bg-red-500/10',
    completed: 'bg-muted/20 text-muted-foreground border-slate-300 dark:border-slate-700',
    vip: 'bg-amber-500/[0.04] text-amber-700 border-amber-500/80 dark:text-amber-400 dark:border-amber-500',
    regular: 'bg-indigo-500/[0.04] text-indigo-700 border-indigo-500/80 dark:text-indigo-400 dark:border-indigo-500'
  };

  const currentStyle = isCancelled ? statusColors.cancelled
    : isCompleted ? statusColors.completed
      : isVip ? statusColors.vip
        : statusColors.regular;
  return (
    <div className={cn("group relative z-10 hover:z-[100] animate-in zoom-in-95 duration-300")}>
      <div className={cn('px-2.5 py-2 rounded-xl text-[10px] font-black transition-all border-2 shadow-sm group-hover:shadow-md cursor-pointer', currentStyle, isPastState && "opacity-70")}>
        <div className="flex items-center justify-between gap-1.5 mb-1">
          <div className="flex items-center gap-1.5 truncate">
            {isCompleted ? <CheckCircle className="size-2.5 text-muted-foreground" /> :
              isCancelled ? <XCircle className="size-2.5 text-red-500" /> :
                <div className={cn('size-1.5 rounded-full', isUsing ? 'bg-green-500 animate-pulse' : isVip ? 'bg-amber-500' : 'bg-indigo-500')} />}
            <span className={cn("truncate max-w-[80px] tracking-tight", isCancelled && "line-through", isPastState && "opacity-70")}>
              {b.user_name}
            </span>
          </div>
          {b.is_auto_booking && !isPastState && <Zap className={cn('size-2.5 fill-current', isVip ? 'text-amber-500' : 'text-indigo-500')} />}
        </div>
        <div className="flex items-center justify-between">
          {showCourt && <div className="text-[8px] opacity-60 font-black truncate">{b.court_name}</div>}
          <div className={cn("text-[7px] font-black uppercase tracking-tighter ml-auto", isUsing ? "text-green-600" : "opacity-40")}>
            {isCompleted ? 'Xong' : isCancelled ? 'Hủy' : isUsing ? 'Dùng' : ''}
          </div>
        </div>
      </div>

      <div className={cn(
        "absolute z-[200] w-64 p-5 rounded-3xl bg-popover/98 backdrop-blur-2xl border border-border shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 pointer-events-none",
        isFirstRow ? "top-full mt-3 left-1/2 -translate-x-1/2" : "bottom-full mb-3 left-1/2 -translate-x-1/2"
      )}>
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="space-y-1">
              <div className="font-black text-lg text-foreground truncate">{b.user_name}</div>
              <div className={cn("text-[10px] font-black uppercase tracking-widest",
                isCancelled ? "text-red-500" : isCompleted ? "text-muted-foreground" : isUsing ? "text-green-500" : "text-primary")}>
                {b.booking_status || 'Đã thanh toán'}
              </div>
            </div>
            <div className={cn('size-10 rounded-xl flex items-center justify-center', isVip ? 'bg-amber-500/20 text-amber-500' : 'bg-indigo-500/20 text-indigo-500')}>
              {isVip ? <Star className="size-5 fill-current" /> : <User className="size-5" />}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 text-xs font-bold">
            <div className="flex items-center gap-2 text-muted-foreground uppercase text-[9px]"><MapPin className="size-3" /><span>Sân:</span> <span className="text-foreground ml-auto">{b.court_name}</span></div>
            <div className="flex items-center gap-2 text-muted-foreground uppercase text-[9px]"><Clock className="size-3" /><span>Giờ:</span> <span className="text-foreground ml-auto">{formatTime(b.start_time)} - {formatTime(b.end_time)}</span></div>
          </div>
          <div className="flex items-center gap-2 pt-1 border-t border-border mt-2 pt-3">
            <div className={cn('flex-1 px-3 py-2 rounded-xl border flex items-center justify-center gap-1.5 text-[9px] font-black uppercase', b.is_auto_booking ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-muted/50 border-border text-muted-foreground')}>
              <Zap className="size-3" />{b.is_auto_booking ? 'Định kỳ' : 'Vãng lai'}
            </div>
            <div className={cn('flex-1 px-3 py-2 rounded-xl border flex items-center justify-center gap-1.5 text-[9px] font-black uppercase', isVip ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-blue-500/10 border-blue-500/20 text-blue-500')}>
              <span>★</span>{isVip ? 'VIP' : 'Thường'}
            </div>
          </div>
        </div>
        <div className={cn("absolute left-1/2 -translate-x-1/2 size-3 bg-popover border-border rotate-45", isFirstRow ? "bottom-full -mb-1.5 border-t border-l" : "top-full -mt-1.5 border-b border-r")} />
      </div>
    </div>
  )
}
