/**
 * Skeleton.tsx - Component loading skeleton (khung xương) hiển thị khi dữ liệu đang tải.
 *
 * File này cung cấp 3 component skeleton để dùng trong trạng thái loading:
 *
 * 1. Skeleton - Component skeleton cơ bản:
 *    - Chỉ là 1 div có class 'skeleton' (định nghĩa trong index.css)
 *    - Class 'skeleton' thường là nền xám với animation pulse/shimmer
 *    - Có thể truyền className để tùy chỉnh kích thước
 *
 * 2. CardSkeleton - Skeleton cho card sân:
 *    - Mô phỏng layout của 1 card: ảnh (aspect-video) + tiêu đề + 2 dòng text
 *    - Dùng khi đang tải danh sách sân (CourtListPage, HomePage)
 *
 * 3. TableSkeleton - Skeleton cho bảng dữ liệu:
 *    - Mô phỏng layout bảng với rows x cols
 *    - Mặc định 5 dòng x 4 cột
 *    - Dùng khi đang tải dữ liệu bảng (admin pages)
 *
 * Cách dùng:
 * ```tsx
 * {isLoading ? <CardSkeleton /> : <CourtCard court={data} />}
 * {isLoading ? <TableSkeleton rows={10} cols={5} /> : <DataTable data={items} />}
 * ```
 */

import { cn } from '@/lib/utils'

/**
 * Skeleton - Component skeleton cơ bản với nền xám và animation.
 *
 * @param className - Class bổ sung để tùy chỉnh kích thước (w-*, h-*, rounded-*, etc.)
 *
 * Class 'skeleton' được định nghĩa trong index.css với animation shimmer.
 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />
}

/**
 * CardSkeleton - Skeleton mô phỏng 1 card sân (ảnh + text).
 *
 * Layout:
 * - Ảnh: full width, aspect-video
 * - Tiêu đề: 75% width
 * - Mô tả: 100% width
 * - Giá/thông tin phụ: 50% width
 *
 * Dùng trong: CourtListPage, HomePage khi đang fetch dữ liệu.
 */
export function CardSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      <Skeleton className="w-full aspect-video" />
      <div className="p-4 space-y-3">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  )
}

/**
 * TableSkeleton - Skeleton mô phỏng bảng dữ liệu với nhiều dòng và cột.
 *
 * @param rows - Số dòng (mặc định 5)
 * @param cols - Số cột (mặc định 4)
 *
 * Mỗi dòng là 1 flex row với các skeleton flex-1 bằng nhau.
 * Dùng trong: các trang admin có bảng dữ liệu.
 */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className="h-10 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}
