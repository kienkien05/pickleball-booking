/**
 * Trang Từ Chối Truy Cập (ForbiddenPage)
 * ======================================
 * @purpose Trang hiển thị lỗi 403 - Từ chối truy cập, khi người dùng cố gắng
 *   truy cập vào một trang/resource mà họ không có quyền.
 *   Trang này được sử dụng bởi route guard hoặc middleware kiểm tra quyền.
 *
 * @route /forbidden hoặc hiển thị khi bị chặn bởi route guard
 * @access Tất cả người dùng (kể cả chưa đăng nhập)
 *
 * @ui
 *   - Icon ShieldOff (khiên chắn) màu đỏ
 *   - Tiêu đề "Truy cập bị từ chối"
 *   - Mô tả ngắn gọn
 *   - Link quay về trang chủ
 */

import { Link } from 'react-router-dom'
import { ShieldOff } from 'lucide-react'

/**
 * Trang báo lỗi 403 - Từ chối truy cập
 * @description Hiển thị giao diện thân thiện khi người dùng không có quyền
 *   truy cập vào một trang, kèm link điều hướng về trang chủ
 * @returns Giao diện lỗi 403 đơn giản, căn giữa màn hình
 */
export default function ForbiddenPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        {/* Icon khiên chắn trong vòng tròn nền đỏ nhạt */}
        <div className="size-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center mb-4">
          <ShieldOff className="size-8 text-destructive" />
        </div>
        {/* Tiêu đề lỗi */}
        <h1 className="text-2xl font-bold">Truy cập bị từ chối</h1>
        {/* Mô tả ngắn */}
        <p className="mt-2 text-muted-foreground">Bạn không có quyền truy cập trang này.</p>
        {/* Link quay về trang chủ */}
        <Link to="/" className="mt-6 inline-block text-primary hover:underline">Về trang chủ</Link>
      </div>
    </div>
  )
}
