/**
 * Modal.tsx - Component Modal (hộp thoại) với animation và hỗ trợ kéo để đóng.
 *
 * Component này cung cấp:
 *
 * 1. Modal - Hộp thoại overlay với các tính năng:
 *    - Overlay nền đen mờ (bg-black/60 + backdrop-blur)
 *    - Animation mở/đóng bằng Framer Motion (trượt từ dưới lên)
 *    - Kéo xuống để đóng (drag="y" với ngưỡng 100px hoặc vận tốc > 500)
 *    - Đóng bằng phím Escape
 *    - Ngăn scroll body khi modal đang mở
 *    - Responsive: full-width trên mobile, có max-width trên desktop
 *    - Các kích thước: sm, md (mặc định), lg, xl, full
 *    - Header với tiêu đề + nút đóng (X)
 *    - Thanh kéo chỉ thị trên mobile (thanh ngang nhỏ ở đỉnh modal)
 *
 * 2. ModalFooter - Component footer cho modal:
 *    - Căn phải các nút hành động
 *    - Có border-top phân cách với nội dung
 *    - safe-bottom để tránh notch trên mobile
 */

import { useEffect, useCallback } from 'react'
import { motion, AnimatePresence, type PanInfo } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * ModalSize - Các kích thước có sẵn cho Modal.
 */
type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

/**
 * ModalProps - Props của component Modal.
 */
interface ModalProps {
  /** Modal có đang mở không */
  isOpen: boolean
  /** Hàm gọi khi đóng modal */
  onClose: () => void
  /** Tiêu đề modal (hiển thị trong header) */
  title?: string
  /** Kích thước modal, mặc định 'md' */
  size?: ModalSize
  /** Nội dung bên trong modal */
  children: React.ReactNode
  /** Class bổ sung cho modal container */
  className?: string
  /** Có hiển thị nút đóng (X) không, mặc định true */
  showCloseButton?: boolean
}

/**
 * sizeClasses - Map kích thước -> class Tailwind max-width.
 */
const sizeClasses: Record<ModalSize, string> = {
  sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl', full: 'sm:max-w-6xl',
}

/**
 * Modal - Component hộp thoại overlay toàn màn hình.
 *
 * @param isOpen - Trạng thái mở/đóng
 * @param onClose - Callback khi đóng modal
 * @param title - Tiêu đề hiển thị trên header
 * @param size - Kích thước modal ('sm' | 'md' | 'lg' | 'xl' | 'full')
 * @param showCloseButton - Hiển thị nút X để đóng (mặc định true)
 *
 * Animation:
 * - Overlay: fade in/out (opacity)
 * - Modal: trượt từ dưới lên (spring animation)
 * - Kéo xuống: nếu kéo > 100px hoặc vận tốc > 500 -> đóng
 *
 * Accessibility:
 * - Đóng bằng phím Escape
 * - Ngăn scroll trang bên dưới khi modal mở
 */
export function Modal({ isOpen, onClose, title, size = 'md', children, className, showCloseButton = true }: ModalProps) {
  // Xử lý phím Escape để đóng modal
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (isOpen) {
      document.addEventListener('keydown', handleEscape)
      document.body.style.overflow = 'hidden' // Ngăn scroll body
    }
    return () => {
      document.removeEventListener('keydown', handleEscape)
      document.body.style.overflow = '' // Khôi phục scroll
    }
  }, [isOpen, onClose])

  /**
   * handleDragEnd - Xử lý sự kiện kết thúc kéo modal.
   * Nếu kéo xuống quá 100px hoặc vận tốc > 500 -> đóng modal.
   */
  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    if (info.offset.y > 100 || info.velocity.y > 500) onClose()
  }, [onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Overlay nền đen mờ - click để đóng */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

          {/* Modal container */}
          <motion.div
            initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            // Cho phép kéo xuống để đóng
            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.5 }} onDragEnd={handleDragEnd}
            className={cn('relative z-10 w-full bg-card border border-border shadow-2xl flex flex-col',
              'rounded-t-2xl sm:rounded-2xl', 'max-h-[85vh] sm:max-h-[90vh]', sizeClasses[size], className)}>
            {/* Thanh kéo chỉ thị trên mobile */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1.5 rounded-full bg-muted-foreground/30" />
            </div>

            {/* Header: tiêu đề + nút đóng */}
            {(title || showCloseButton) && (
              <div className="flex items-center justify-between px-5 py-3 border-b border-border shrink-0">
                {title && <h2 className="text-lg font-semibold text-foreground truncate pr-4">{title}</h2>}
                {showCloseButton && (
                  <button onClick={onClose} className="touch-target flex items-center justify-center rounded-lg hover:bg-muted transition-colors">
                    <X className="size-5 text-muted-foreground" />
                  </button>
                )}
              </div>
            )}

            {/* Nội dung modal */}
            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/**
 * ModalFooter - Component footer cho Modal.
 *
 * Hiển thị các nút hành động (vd: Hủy, Xác nhận) ở cuối modal.
 * Có border-top phân cách và safe-bottom cho mobile.
 *
 * @param children - Các nút hoặc nội dung trong footer
 * @param className - Class bổ sung
 */
export function ModalFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-end gap-3 px-5 py-3 border-t border-border shrink-0 safe-bottom', className)}>
      {children}
    </div>
  )
}
