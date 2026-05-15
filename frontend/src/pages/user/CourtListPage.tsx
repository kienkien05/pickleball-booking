/**
 * Trang Danh sách Sân (CourtListPage) - Hiển thị toàn bộ sân Pickleball có trong hệ thống.
 *
 * Trang này cung cấp:
 * - Ô tìm kiếm (search input) để người dùng lọc sân theo tên.
 * - Cơ chế debounce thủ công: chỉ tìm kiếm khi người dùng nhấn Enter hoặc click nút "Tìm".
 * - Danh sách sân hiển thị dưới dạng grid 3 cột (responsive), mỗi card hiển thị:
 *   + Ảnh sân (hoặc placeholder).
 *   + Badge trạng thái (Sẵn sàng / Bảo trì / Khác).
 *   + Tên sân, mô tả, số khung giờ, và đánh giá trung bình.
 * - Link dẫn đến trang chi tiết sân (/courts/:id).
 *
 * Sử dụng React Query để fetch danh sách sân với tham số tìm kiếm.
 * Khi tham số tìm kiếm thay đổi, queryKey thay đổi và tự động re-fetch dữ liệu.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MapPin, Search, Clock, Star } from 'lucide-react'
import { courtService } from '@/services'
import { CardSkeleton } from '@/components/ui/Skeleton'

/**
 * CourtListPage Component
 *
 * Component hiển thị danh sách tất cả các sân Pickleball với chức năng tìm kiếm.
 *
 * State:
 * - search: giá trị hiện tại của ô input tìm kiếm (cập nhật theo từng lần gõ phím).
 * - debouncedSearch: giá trị thực sự được dùng để gọi API (chỉ cập nhật khi nhấn Enter hoặc click Tìm).
 *
 * Luồng hoạt động:
 * 1. Người dùng nhập từ khóa vào ô tìm kiếm -> cập nhật `search`.
 * 2. Người dùng nhấn Enter hoặc click nút "Tìm" -> cập nhật `debouncedSearch`.
 * 3. Khi `debouncedSearch` thay đổi, queryKey thay đổi -> React Query tự động gọi API
 *    với tham số tìm kiếm mới và refresh danh sách sân.
 * 4. API trả về tối đa 20 sân phù hợp.
 *
 * @returns {JSX.Element} Giao diện danh sách sân với thanh tìm kiếm.
 */
export default function CourtListPage() {
  /**
   * Giá trị hiển thị trong ô input tìm kiếm.
   * Cập nhật liên tục khi người dùng gõ phím (chưa gọi API).
   */
  const [search, setSearch] = useState('')

  /**
   * Giá trị thực tế được dùng để gọi API tìm kiếm.
   * Chỉ cập nhật khi người dùng nhấn Enter hoặc click nút "Tìm".
   * Cách làm này giúp tránh gọi API quá nhiều (debounce thủ công).
   */
  const [debouncedSearch, setDebouncedSearch] = useState('')

  /**
   * Fetch danh sách sân từ API.
   * - queryKey bao gồm `debouncedSearch` để khi từ khóa thay đổi, React Query sẽ re-fetch.
   * - limit mặc định là 20 sân.
   * - Kết quả được chuẩn hóa để hỗ trợ nhiều định dạng response khác nhau.
   */
  const { data: courtsData, isLoading } = useQuery({
    queryKey: ['courts', 'list', debouncedSearch],
    queryFn: () => courtService.getCourts({ search: debouncedSearch, limit: 20 }).then(r => r.data.data ?? r.data ?? []),
  })

  /**
   * Chuẩn hóa dữ liệu sân từ API response.
   * API có thể trả về mảng trực tiếp hoặc object chứa thuộc tính `courts`.
   * Nếu không có dữ liệu, mặc định là mảng rỗng.
   */
  const courts = Array.isArray(courtsData) ? courtsData : courtsData?.courts ?? []

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold mb-6">Danh sách sân Pickleball</h1>

        {/* ==================== THANH TÌM KIẾM ==================== */}
        {/*
         * Thanh tìm kiếm gồm:
         * - Ô input có icon Search bên trái, xử lý sự kiện Enter để kích hoạt tìm kiếm.
         * - Nút "Tìm" bên phải để kích hoạt tìm kiếm bằng cách click.
         * Người dùng nhập từ khóa -> nhấn Enter hoặc click Tìm -> cập nhật `debouncedSearch`.
         */}
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') setDebouncedSearch(search) }}
              placeholder="Tìm kiếm sân..." className="w-full h-11 pl-10 pr-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" />
          </div>
          <button onClick={() => setDebouncedSearch(search)} className="h-11 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">Tìm</button>
        </div>
      </motion.div>

      {/* ==================== DANH SÁCH SÂN ==================== */}
      {/*
       * 3 trạng thái hiển thị:
       * 1. isLoading = true: hiển thị 6 skeleton cards.
       * 2. courts.length === 0: hiển thị thông báo "Không tìm thấy sân nào".
       * 3. Có dữ liệu: hiển thị grid 3 cột các card sân.
       *
       * Mỗi card sân:
       * - Hiển thị ảnh sân với hiệu ứng hover phóng to (scale-105).
       * - Badge trạng thái có 3 màu: success (Sẵn sàng), orange (Bảo trì), muted (khác).
       * - Dòng mô tả bị giới hạn 2 dòng (line-clamp-2).
       * - Icon đồng hồ hiển thị số khung giờ, icon sao hiển thị đánh giá trung bình.
       */}
      {isLoading ? (
        // Trạng thái loading
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : courts.length === 0 ? (
        // Trạng thái không tìm thấy sân
        <div className="text-center py-16 text-muted-foreground">
          <MapPin className="size-16 mx-auto mb-4 opacity-20" />
          <p className="text-lg">Không tìm thấy sân nào</p>
        </div>
      ) : (
        // Trạng thái hiển thị danh sách sân
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {courts.map((court: any) => (
            <Link key={court.id} to={`/courts/${court.id}`}
              className="group rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 hover:shadow-lg transition-all duration-300">
              {/* Ảnh sân hoặc placeholder */}
              <div className="aspect-video bg-muted relative overflow-hidden">
                {court.hinhAnh ? (
                  <img src={court.hinhAnh} alt={court.tenSan} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><MapPin className="size-12 text-muted-foreground/30" /></div>
                )}
                {/* Badge trạng thái sân với màu sắc theo trạng thái */}
                <div className={`absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-medium backdrop-blur-md ${
                  court.trangThai === 'Sẵn sàng' ? 'bg-success/20 text-success' :
                  court.trangThai === 'Bảo trì' ? 'bg-orange-500/20 text-orange-600' :
                  'bg-muted/50 text-muted-foreground'
                }`}>
                  {court.trangThai || 'Sẵn sàng'}
                </div>
              </div>
              {/* Thông tin sân: tên, mô tả, khung giờ, đánh giá */}
              <div className="p-4">
                <h3 className="font-semibold group-hover:text-primary transition-colors">{court.tenSan}</h3>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{court.moTa || 'Sân Pickleball tiêu chuẩn'}</p>
                <div className="flex items-center gap-3 mt-3 text-sm text-muted-foreground">
                  {/* Số khung giờ khả dụng */}
                  <span className="flex items-center gap-1"><Clock className="size-3" /> {court.slotCount ?? 0} khung giờ</span>
                  {/* Đánh giá trung bình (sao) và số lượt đánh giá */}
                  <div className="flex items-center gap-1.5 ml-auto">
                    <div className="flex items-center gap-1 text-amber-500">
                      <Star className="size-3.5 fill-current" />
                      <span className="font-bold">{court.avgRating != null && Number(court.avgRating) > 0 ? Number(court.avgRating).toFixed(1) : '--'}</span>
                    </div>
                    <span className="text-[10px] opacity-60">({court.reviewCount ?? 0} đánh giá)</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
