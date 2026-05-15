/**
 * NotificationBell.tsx - Component chuông thông báo hiển thị trên header.
 *
 * Component này hiển thị:
 * - Icon chuông (Bell) với badge số thông báo chưa đọc (màu đỏ)
 * - Dropdown danh sách thông báo khi click vào chuông
 * - Mỗi thông báo hiển thị: icon loại, tiêu đề, nội dung, thời gian (timeAgo)
 * - Nút "Đọc tất cả" khi có thông báo chưa đọc
 * - Click vào thông báo chưa đọc -> tự động đánh dấu đã đọc
 *
 * Logic:
 * - Tự động poll số thông báo chưa đọc mỗi 30 giây (refetchInterval)
 * - Chỉ tải danh sách thông báo khi dropdown đang mở (enabled: isAuthenticated && open)
 * - Đóng dropdown khi click ra ngoài (dùng useRef + mousedown event listener)
 * - Nếu chưa đăng nhập -> không hiển thị gì (return null)
 */

import { useState, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Bell, CheckCheck, CalendarCheck, Ban, CreditCard, Info } from 'lucide-react'
import { notificationService } from '@/services'
import { useAuthStore } from '@/stores/authStore'
import { cn } from '@/lib/utils'

/**
 * typeIcons - Map ánh xạ loại thông báo -> Icon component tương ứng.
 * Mỗi loại thông báo có 1 icon riêng để user dễ nhận biết.
 */
const typeIcons: Record<string, any> = {
  booking_confirmed: CalendarCheck, // Đặt sân thành công
  booking_cancelled: Ban,           // Hủy sân
  payment_received: CreditCard,     // Thanh toán
  system: Info,                     // Hệ thống
}

/**
 * typeLabels - Map ánh xạ loại thông báo -> Nhãn tiếng Việt.
 */
const typeLabels: Record<string, string> = {
  booking_confirmed: 'Đặt sân',
  booking_cancelled: 'Hủy sân',
  payment_received: 'Thanh toán',
  system: 'Hệ thống',
}

/**
 * timeAgo - Hiển thị thời gian tương đối (vd: "3 phút trước", "2 giờ trước").
 *
 * @param date - Thời gian tạo thông báo (ISO string)
 * @returns Chuỗi thời gian tương đối bằng tiếng Việt
 *
 * Logic:
 * - Dưới 60 giây -> "Vừa xong"
 * - Dưới 60 phút -> "X phút trước"
 * - Dưới 24 giờ -> "X giờ trước"
 * - Trên 24 giờ -> "X ngày trước"
 */
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

/**
 * NotificationBell - Component hiển thị chuông thông báo và dropdown danh sách.
 *
 * State:
 * - open: boolean điều khiển đóng/mở dropdown
 * - ref: dùng để phát hiện click ra ngoài dropdown
 */
export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const { isAuthenticated } = useAuthStore()
  const queryClient = useQueryClient()

  // Poll số thông báo chưa đọc mỗi 30 giây
  const { data: countData } = useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => notificationService.getUnreadCount().then(r => r.data.data?.count ?? r.data.count ?? 0),
    enabled: isAuthenticated,
    refetchInterval: 30000, // Tự động cập nhật mỗi 30 giây
  })

  // Chỉ tải danh sách thông báo khi dropdown mở (tiết kiệm request)
  const { data: notificationsData } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => notificationService.getNotifications({ limit: 20 }).then(r => r.data.data ?? r.data ?? []),
    enabled: isAuthenticated && open,
  })

  // Mutation đánh dấu 1 thông báo đã đọc
  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationService.markAsRead(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['notifications'] }) },
  })

  // Mutation đánh dấu tất cả đã đọc
  const markAllMutation = useMutation({
    mutationFn: () => notificationService.markAllAsRead(),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['notifications'] }) },
  })

  // Đóng dropdown khi click ra ngoài component
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Không hiển thị gì nếu chưa đăng nhập
  if (!isAuthenticated) return null

  const unread = countData || 0
  const notifications = notificationsData || []

  return (
    <div className="relative" ref={ref}>
      {/* Nút chuông thông báo */}
      <button onClick={() => setOpen(v => !v)} className="relative p-2 rounded-lg hover:bg-muted transition-colors" title="Thông báo">
        <Bell className="size-5" />
        {/* Badge số thông báo chưa đọc - chỉ hiện khi unread > 0 */}
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 size-5 flex items-center justify-center bg-red-500 text-white text-[10px] font-bold rounded-full">
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </button>

      {/* Dropdown danh sách thông báo */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-card border border-border rounded-xl shadow-xl z-50 overflow-hidden">
          {/* Header dropdown: tiêu đề + nút đọc tất cả */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h3 className="font-semibold text-sm">Thông báo</h3>
            {unread > 0 && (
              <button onClick={() => markAllMutation.mutate()} className="text-xs text-primary hover:underline flex items-center gap-1">
                <CheckCheck className="size-3" /> Đọc tất cả
              </button>
            )}
          </div>

          {/* Danh sách thông báo */}
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              // Trạng thái rỗng
              <div className="py-8 text-center text-sm text-muted-foreground">
                <Bell className="size-8 mx-auto mb-2 opacity-30" /> Chưa có thông báo
              </div>
            ) : (
              // Mỗi thông báo: icon + tiêu đề + nội dung + thời gian
              notifications.map((n: any) => {
                const Icon = typeIcons[n.loaiThongBao || n.type] || Info
                return (
                  <div key={n.id} onClick={() => { if (!(n.daDoc !== undefined ? n.daDoc : n.is_read)) markReadMutation.mutate(n.id) }}
                    className={cn('flex gap-3 px-4 py-3 border-b border-border last:border-0 cursor-pointer hover:bg-muted/50 transition-colors',
                      !(n.daDoc !== undefined ? n.daDoc : n.is_read) && 'bg-primary/5')}>
                    {/* Icon loại thông báo */}
                    <div className={cn('shrink-0 size-9 rounded-full flex items-center justify-center',
                      !(n.daDoc !== undefined ? n.daDoc : n.is_read) ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                      <Icon className="size-4" />
                    </div>
                    {/* Nội dung thông báo */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={cn('text-sm', !(n.daDoc !== undefined ? n.daDoc : n.is_read) && 'font-medium')}>{(n.tieuDe || n.title)}</p>
                        {/* Chấm xanh cho thông báo chưa đọc */}
                        {!(n.daDoc !== undefined ? n.daDoc : n.is_read) && <div className="size-2 bg-primary rounded-full shrink-0" />}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{(n.noiDung || n.message)}</p>
                      <p className="text-[10px] text-muted-foreground mt-1">{timeAgo((n.thoiGianTao || n.created_at))}</p>
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
