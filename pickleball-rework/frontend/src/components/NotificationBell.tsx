import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, CalendarCheck, Ban, CreditCard, Info } from 'lucide-react'
import { notificationService } from '@/services'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'

const typeIcons: Record<string, any> = {
  booking_confirmed: CalendarCheck,
  booking_cancelled: Ban,
  payment_received: CreditCard,
  system: Info,
}
const typeLabels: Record<string, string> = {
  booking_confirmed: 'Đặt sân',
  booking_cancelled: 'Hủy sân',
  payment_received: 'Thanh toán',
  system: 'Hệ thống',
}

function timeAgo(date: string) {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
  if (seconds < 60) return 'Vừa xong'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes} phút trước`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} giờ trước`
  const days = Math.floor(hours / 24)
  return `${days} ngày trước`
}

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { isAuthenticated } = useAuthStore()
  const queryClient = useQueryClient()

  const { data: countData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notificationService.getUnreadCount().then(r => r.data.data?.count ?? r.data.count ?? 0),
    enabled: isAuthenticated,
    refetchInterval: 30000,
  })

  const { data: notificationsData } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => notificationService.getNotifications({ limit: 20 }).then(r => r.data.data ?? r.data ?? []),
    enabled: isAuthenticated && open,
  })

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationService.markAsRead(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['notifications'] }) },
  })

  const markAllMutation = useMutation({
    mutationFn: () => notificationService.markAllAsRead(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['notifications'] }) },
  })

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!isAuthenticated) return null

  const unread = countData || 0
  const notifications = notificationsData || []

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(v => !v)} className="relative p-2 rounded-lg hover:bg-muted transition-colors" title="Thông báo">
        <Bell className="size-5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 size-5 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-sm">Thông báo</h3>
            {unread > 0 && (
              <button onClick={() => markAllMutation.mutate()} className="text-xs text-primary hover:underline flex items-center gap-1">
                <CheckCheck className="size-3" /> Đọc tất cả
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Bell className="size-8 mx-auto mb-2 opacity-30" /> Chưa có thông báo
              </div>
            ) : (
              notifications.map((n: any) => {
                const Icon = typeIcons[n.type] || Info
                return (
                  <div key={n.id} onClick={() => { if (!n.is_read) markReadMutation.mutate(n.id) }}
                    className={cn('flex gap-3 px-4 py-3 border-b border-border last:border-0 cursor-pointer hover:bg-muted/50 transition-colors',
                      !n.is_read && 'bg-primary/5')}>
                    <div className={cn('shrink-0 size-9 rounded-full flex items-center justify-center',
                      !n.is_read ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                      <Icon className="size-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={cn('text-sm', !n.is_read && 'font-medium')}>{n.title}</p>
                        {!n.is_read && <div className="size-2 bg-primary rounded-full shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{n.message}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
