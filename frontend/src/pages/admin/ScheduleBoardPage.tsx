import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, AlertCircle, Calendar as CalendarIcon, Filter, MapPin, Clock, User, Zap, Star } from 'lucide-react'
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

function formatDateStr(d: Date): string {
  return d.toISOString().slice(0, 10)
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

  const { data: slotsData, isLoading: slotsLoading } = useQuery({
    queryKey: ['admin', 'timeslots', selectedCourtId || 'all'],
    queryFn: async () => {
      if (selectedCourtId) {
        const r = await timeSlotService.getByCourt(selectedCourtId)
        return r.data.data ?? r.data ?? []
      }
      const allCourts = courts.length ? courts : await courtService.getCourts().then(r => r.data.data ?? r.data ?? [])
      const results = await Promise.all(
        allCourts.map((c: any) => timeSlotService.getByCourt(String(c.id)).then(r => r.data.data ?? r.data ?? []))
      )
      const seen = new Map<string, boolean>()
      return results.flat().filter((s: any) => {
        const key = s.gioBatDau
        if (seen.has(key)) return false
        seen.set(key, true)
        return true
      }).sort((a: any, b: any) => (a.gioBatDau || '').localeCompare(b.gioBatDau || ''))
    },
    enabled: courts.length > 0 || !!selectedCourtId,
  })
  const slots = Array.isArray(slotsData) ? slotsData : []

  const { data: bookingsData, isLoading: bookingsLoading, isError, error } = useQuery({
    queryKey: ['admin', 'schedule-board', formatDateStr(weekStart), formatDateStr(weekEnd), selectedCourtId],
    queryFn: () => adminService.getScheduleBoard({
      start_date: formatDateStr(weekStart),
      end_date: formatDateStr(weekEnd),
      court_id: selectedCourtId || undefined,
    }).then(r => r.data.data ?? r.data ?? []),
  })
  const bookings = Array.isArray(bookingsData) ? bookingsData : []

  const bookingMap = useMemo(() => {
    const map = new Map<string, any[]>()
    bookings.forEach((b: any) => {
      const dateKey = b.booking_date.split('T')[0]
      const timeKey = b.start_time.slice(0, 5) // Use HH:mm as key
      const key = `${dateKey}_${timeKey}`
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(b)
    })
    return map
  }, [bookings])

  const displaySlots = useMemo(() => {
    if (slots.length > 0) return slots
    const uniqueSlots = new Map<number, { slot_id: number; start_time: string; end_time: string }>()
    bookings.forEach((b: any) => {
      if (!uniqueSlots.has(b.slot_id)) {
        uniqueSlots.set(b.slot_id, { slot_id: b.slot_id, start_time: b.start_time, end_time: b.end_time })
      }
    })
    return Array.from(uniqueSlots.values()).sort((a, b) => a.start_time.localeCompare(b.start_time))
  }, [slots, bookings])

  const isLoading = bookingsLoading || slotsLoading

  const goToWeek = (direction: 'prev' | 'next') => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + (direction === 'prev' ? -7 : 7))
    setWeekStart(d)
  }

  const goToToday = () => setWeekStart(getMonday(today))

  return (
    <div className="space-y-6 pb-32">
      {/* Compact Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-foreground">Thời khóa biểu</h1>
          <div className="flex items-center gap-4 mt-2">
            <div className="bg-card p-1 rounded-xl border border-border shadow-sm flex items-center">
              <div className="px-3 text-muted-foreground"><Filter className="size-3.5" /></div>
              <select value={selectedCourtId} onChange={e => setSelectedCourtId(e.target.value)} className="bg-transparent text-xs font-bold outline-none cursor-pointer pr-4">
                <option value="">Tất cả sân</option>
                {courts.map((c: any) => (<option key={c.id} value={String(c.id)}>{c.tenSan}</option>))}
              </select>
            </div>
            <div className="flex items-center gap-4 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-l border-border pl-4">
              <div className="flex items-center gap-1.5"><div className="size-2 rounded-full bg-indigo-500" /><span>Thường</span></div>
              <div className="flex items-center gap-1.5"><div className="size-2 rounded-full bg-amber-500" /><span>VIP</span></div>
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
            {weekDays[0]?.getDate()}/{weekDays[0]?.getMonth() + 1} — {weekDays[6]?.getDate()}/{weekDays[6]?.getMonth() + 1}/{weekDays[6]?.getFullYear()}
          </div>
        </div>
      </div>

      {/* Timetable Body - One single scrollable container */}
      <div className="bg-card rounded-[2.5rem] border border-border shadow-2xl overflow-x-auto overflow-y-visible">
        <div className="min-w-[1200px]">
          {/* Header Row - Fixed offset for AdminLayout header (64px) */}
          <div className="grid grid-cols-8 bg-muted/50 border-b border-border sticky top-[0px] z-30 backdrop-blur-xl">
            <div className="px-6 py-8 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 border-r border-border flex items-center justify-center">
              Khung giờ
            </div>
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

          {/* Grid rows */}
          <div className="divide-y divide-border">
            {displaySlots.map((slot: any, ri: number) => {
              const slotId = slot.slot_id ?? slot.id
              const startTime = slot.start_time ?? slot.gioBatDau
              const endTime = slot.end_time ?? slot.gioKetThuc

              return (
                <div key={ri} className="grid grid-cols-8 hover:bg-muted/10 transition-colors">
                  <div className="px-6 py-12 text-sm font-bold border-r border-border flex flex-col items-center justify-center bg-muted/5">
                    <span className="text-foreground text-xl font-black tracking-tighter">{formatTime(startTime)}</span>
                    <span className="text-muted-foreground text-xs font-bold opacity-60">{formatTime(endTime)}</span>
                  </div>

                  {weekDays.map((d, ci) => {
                    const dateStr = formatDateStr(d)
                    const timeKey = startTime.slice(0, 5)
                    const cellKey = `${dateStr}_${timeKey}`
                    const cellBookings = bookingMap.get(cellKey) || []

                    return (
                      <div key={ci} className={cn('p-2 border-r border-border last:border-r-0 min-h-[160px] relative',
                        formatDateStr(d) === formatDateStr(today) && 'bg-primary/[0.02]')}>
                        <div className="flex flex-col gap-3">
                          {cellBookings.map((b: any, bi: number) => (
                            <BookingBlock key={bi} booking={b} showCourt={!selectedCourtId} isFirstRow={ri === 0} />
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

function BookingBlock({ booking: b, showCourt, isFirstRow }: { booking: any; showCourt: boolean; isFirstRow: boolean }) {
  const isVip = b.is_vip

  return (
    <div className="group relative z-10 animate-in zoom-in-95 duration-300">
      <div className={cn(
        'px-3 py-2 rounded-xl text-[11px] font-bold transition-all border-2 shadow-sm group-hover:shadow-md cursor-pointer',
        isVip
          ? 'bg-amber-500/[0.03] text-amber-700 border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-400 dark:border-amber-500/50 hover:bg-amber-500/10'
          : 'bg-indigo-500/[0.03] text-indigo-700 border-indigo-500/40 dark:bg-indigo-500/10 dark:text-indigo-400 dark:border-indigo-500/50 hover:bg-indigo-500/10'
      )}>
        <div className="flex items-center justify-between gap-2 mb-0.5">
          <div className="flex items-center gap-1.5">
            <div className={cn('size-1.5 rounded-full', isVip ? 'bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.5)]' : 'bg-indigo-500 shadow-[0_0_5px_rgba(99,102,241,0.5)]')} />
            <span className="truncate max-w-[85px]">{b.user_name}</span>
          </div>
          {b.is_auto_booking && <Zap className={cn('size-2.5 fill-current', isVip ? 'text-amber-500' : 'text-indigo-500')} />}
        </div>
        {showCourt && <div className="text-[9px] opacity-60 font-semibold truncate pl-3">{b.court_name}</div>}
      </div>

      <div className={cn(
        "absolute z-50 w-64 p-5 rounded-3xl bg-popover/95 backdrop-blur-2xl border border-border shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-300 pointer-events-none",
        isFirstRow ? "top-full mt-3 left-1/2 -translate-x-1/2" : "bottom-full mb-3 left-1/2 -translate-x-1/2"
      )}>
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="font-black text-lg text-foreground truncate">{b.user_name}</div>
            <div className={cn('size-10 rounded-xl flex items-center justify-center', isVip ? 'bg-amber-500/20 text-amber-500' : 'bg-indigo-500/20 text-indigo-500')}>
              {isVip ? <Star className="size-5 fill-current" /> : <User className="size-5" />}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 text-xs font-bold">
            <div className="flex justify-between"><span className="text-muted-foreground uppercase text-[9px]">Sân:</span><span>{b.court_name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground uppercase text-[9px]">Giờ:</span><span>{formatTime(b.start_time)} - {formatTime(b.end_time)}</span></div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <div className={cn('flex-1 px-3 py-2 rounded-xl border flex items-center justify-center gap-1.5 text-[9px] font-black uppercase', b.is_auto_booking ? 'bg-primary/10 border-primary/20 text-primary' : 'bg-muted/50 border-border text-muted-foreground')}>
              <Zap className="size-3" />{b.is_auto_booking ? 'Định kỳ' : 'Vãng lai'}
            </div>
            <div className={cn('flex-1 px-3 py-2 rounded-xl border flex items-center justify-center gap-1.5 text-[9px] font-black uppercase', isVip ? 'bg-amber-500/10 border-amber-500/20 text-amber-500' : 'bg-blue-500/10 border-blue-500/20 text-blue-500')}>
              <span>★</span>{isVip ? 'VIP' : 'Thường'}
            </div>
          </div>
        </div>
        <div className={cn("absolute left-1/2 -translate-x-1/2 size-3 bg-popover/95 border-border rotate-45", isFirstRow ? "bottom-full -mb-1.5 border-t border-l" : "top-full -mt-1.5 border-b border-r")} />
      </div>
    </div>
  )
}
