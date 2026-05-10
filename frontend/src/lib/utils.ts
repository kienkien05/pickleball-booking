import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getImageUrl(url: string | undefined, options?: {
  width?: number; height?: number; quality?: number
}) {
  if (!url) return '/placeholder-court.jpg'
  if (!url.includes('cloudinary')) return url
  const { width, height, quality = 80 } = options || {}
  const transforms = ['f_auto', `q_${quality}`]
  if (width) transforms.push(`w_${width}`)
  if (height) transforms.push(`h_${height}`)
  transforms.push('c_fill')
  return url.replace('/upload/', `/upload/${transforms.join(',')}/`)
}

export function formatPrice(amount: number): string {
  const safeAmount = isNaN(amount) ? 0 : amount
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency', currency: 'VND', maximumFractionDigits: 0,
  }).format(safeAmount)
}

export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(date))
}

export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(date))
}

export function formatTime(time: string): string {
  return time.substring(0, 5)
}

export function debounce<T extends (...args: any[]) => any>(fn: T, delay: number): (...args: Parameters<T>) => void {
  let timer: ReturnType<typeof setTimeout>
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay) }
}
