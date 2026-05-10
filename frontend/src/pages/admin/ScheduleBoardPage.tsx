import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react'
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
      const key = `${b.booking_date}_${b.slot_id}`
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
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Thời khóa biểu</h1>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <div className="flex items-center gap-2">
          <button onClick={() => goToWeek('prev')}
            className="size-9 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors">
            <ChevronLeft className="size-4" />
          </button>
          <button onClick={goToToday}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-muted transition-colors">
            Hôm nay
          </button>
          <button onClick={() => goToWeek('next')}
            className="size-9 flex items-center justify-center rounded-lg border border-border hover:bg-muted transition-colors">
            <ChevronRight className="size-4" />
          </button>
          <span className="ml-2 text-sm font-medium text-foreground">
            {weekDays[0]?.getDate()}/{weekDays[0]?.getMonth() + 1} — {weekDays[6]?.getDate()}/{weekDays[6]?.getMonth() + 1}/{weekDays[6]?.getFullYear()}
          </span>
        </div>

        <select value={selectedCourtId} onChange={e => setSelectedCourtId(e.target.value)}
          className="h-9 px-3 rounded-lg border border-input bg-background text-sm focus:ring-2 focus:ring-ring outline-none">
          <option value="">Tất cả sân</option>
          {courts.map((c: any) => (
            <option key={c.id} value={String(c.id)}>{c.tenSan}</option>
          ))}
        </select>
      </div>

      {/* Error */}
      {isError && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive">
          <AlertCircle className="size-5 shrink-0" />
          <p className="text-sm">{(error as any)?.response?.data?.error || (error as any)?.message || 'Không thể tải dữ liệu'}</p>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="grid grid-cols-8">
            <div className="bg-muted/50 p-3" />
            {weekDays.map((_, i) => (
              <div key={i} className="bg-muted/50 p-3">
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
          {Array.from({ length: 5 }).map((_, ri) => (
            <div key={ri} className="grid grid-cols-8 border-t border-border">
              <div className="p-3"><Skeleton className="h-4 w-20" /></div>
              {weekDays.map((_, ci) => (
                <div key={ci} className="p-3"><Skeleton className="h-12 w-full" /></div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Timetable */}
      {!isLoading && !isError && (
        <div className="rounded-xl border border-border overflow-x-auto">
          <div className="min-w-[800px]">
            {/* Header row */}
            <div className="grid grid-cols-8 bg-muted/50">
              <div className="px-3 py-3 text-sm font-semibold text-muted-foreground border-r border-border">
                Khung giờ
              </div>
              {weekDays.map((d, i) => {
                const isToday = formatDateStr(d) === formatDateStr(today)
                return (
                  <div key={i} className={cn('px-2 py-3 text-center border-r border-border last:border-r-0',
                    isToday && 'bg-primary/5')}>
                    <div className="text-sm font-semibold">{DAY_LABELS[i]}</div>
                    <div className={cn('text-xs text-muted-foreground mt-0.5',
                      isToday && 'text-primary font-semibold')}>
                      {d.getDate()}/{d.getMonth() + 1}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Slot rows */}
            {displaySlots.length === 0 && (
              <div className="p-8 text-center text-muted-foreground text-sm">
                Không có dữ liệu đặt sân trong tuần này
              </div>
            )}
            {displaySlots.map((slot: any, ri: number) => {
              const slotId = slot.slot_id ?? slot.id
              const startTime = slot.start_time ?? slot.gioBatDau
              const endTime = slot.end_time ?? slot.gioKetThuc
              return (
                <div key={ri} className={cn('grid grid-cols-8 border-t border-border',
                  ri % 2 === 0 && 'bg-muted/10')}>
                  <div className="px-3 py-2 text-sm font-medium border-r border-border flex items-center">
                    <span>{formatTime(startTime)} - {formatTime(endTime)}</span>
                  </div>
                  {weekDays.map((d, ci) => {
                    const dateStr = formatDateStr(d)
                    const cellKey = `${dateStr}_${slotId}`
                    const cellBookings = bookingMap.get(cellKey) || []

                    return (
                      <div key={ci} className={cn('px-1 py-1 border-r border-border last:border-r-0',
                        formatDateStr(d) === formatDateStr(today) && 'bg-primary/[0.03]')}>
                        <div className="flex flex-col gap-0.5 min-h-[2.5rem]">
                          {cellBookings.map((b: any, bi: number) => (
                            <BookingBlock key={bi} booking={b} showCourt={!selectedCourtId} />
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
      )}
    </div>
  )
}

function BookingBlock({ booking: b, showCourt }: { booking: any; showCourt: boolean }) {
  return (
    <div className="group relative">
      <div className={cn(
        'px-2 py-1 rounded text-xs font-medium leading-tight transition-shadow hover:shadow-md cursor-default',
        b.is_vip
          ? 'bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700'
          : 'bg-sky-100 text-sky-800 border border-sky-300 dark:bg-sky-900/30 dark:text-sky-300 dark:border-sky-700'
      )}>
        {showCourt && <span className="block text-[10px] opacity-70">{b.court_name}</span>}
        <span className="truncate block">{b.user_name}</span>
        {b.is_vip && <span className="text-[10px] opacity-80">VIP</span>}
      </div>

      {/* Tooltip */}
      <div className="absolute left-0 bottom-full mb-1 z-50 w-56 p-3 rounded-lg bg-popover border border-border shadow-xl
        opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-150 pointer-events-none">
        <div className="text-xs space-y-1">
          <div className="font-semibold text-sm text-foreground mb-1">{b.user_name}</div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Sân:</span>
            <span className="font-medium">{b.court_name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Khung giờ:</span>
            <span className="font-medium">{formatTime(b.start_time)} - {formatTime(b.end_time)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Ngày:</span>
            <span className="font-medium">{b.booking_date}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Loại đơn:</span>
            <span className={cn('font-medium', b.is_auto_booking && 'text-amber-600')}>
              {b.is_auto_booking ? 'Tự động' : 'Thủ công'}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Khách:</span>
            <span className={cn('font-medium', b.is_vip && 'text-amber-600')}>
              {b.is_vip ? 'VIP' : 'Thường'}
            </span>
          </div>
        </div>
        <div className="absolute left-4 top-full -mt-1 size-2 bg-popover border-b border-r border-border rotate-45" />
      </div>
    </div>
  )
}
