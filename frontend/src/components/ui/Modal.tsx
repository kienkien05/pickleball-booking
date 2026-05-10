import { useEffect, useCallback } from 'react'
import { motion, AnimatePresence, type PanInfo } from 'framer-motion'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl' | 'full'

interface ModalProps {
  isOpen: boolean; onClose: () => void; title?: string
  size?: ModalSize; children: React.ReactNode; className?: string; showCloseButton?: boolean
}

const sizeClasses: Record<ModalSize, string> = {
  sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl', full: 'sm:max-w-6xl',
}

export function Modal({ isOpen, onClose, title, size = 'md', children, className, showCloseButton = true }: ModalProps) {
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    if (isOpen) { document.addEventListener('keydown', handleEscape); document.body.style.overflow = 'hidden' }
    return () => { document.removeEventListener('keydown', handleEscape); document.body.style.overflow = '' }
  }, [isOpen, onClose])

  const handleDragEnd = useCallback((_: any, info: PanInfo) => {
    if (info.offset.y > 100 || info.velocity.y > 500) onClose()
  }, [onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            initial={{ y: '100%', opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            drag="y" dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.5 }} onDragEnd={handleDragEnd}
            className={cn('relative z-10 w-full bg-card border border-border shadow-2xl flex flex-col',
              'rounded-t-2xl sm:rounded-2xl', 'max-h-[85vh] sm:max-h-[90vh]', sizeClasses[size], className)}>
            <div className="flex justify-center pt-3 pb-1 sm:hidden">
              <div className="w-10 h-1.5 rounded-full bg-muted-foreground/30" />
            </div>
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
            <div className="flex-1 overflow-y-auto scrollbar-thin px-5 py-4">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

export function ModalFooter({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('flex items-center justify-end gap-3 px-5 py-3 border-t border-border shrink-0 safe-bottom', className)}>
      {children}
    </div>
  )
}
