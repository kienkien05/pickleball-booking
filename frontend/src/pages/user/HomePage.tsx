/**
 * Trang chủ (HomePage) - Trang chính dành cho người dùng của hệ thống đặt sân Pickleball.
 *
 * Trang này hiển thị:
 * - Phần Hero với tiêu đề và lời kêu gọi hành động (CTA) dẫn đến trang danh sách sân.
 * - Phần Tính năng nổi bật (Features) giới thiệu 4 ưu điểm chính của hệ thống:
 *   đặt sân nhanh, an toàn bảo mật, hỗ trợ đa thiết bị, và thông báo thời gian thực.
 * - Phần Sân nổi bật (Featured Courts) hiển thị tối đa 6 sân Pickleball tiêu biểu
 *   được lấy từ API, bao gồm ảnh, tên, mô tả, trạng thái, số khung giờ và đánh giá.
 *
 * Sử dụng React Query để fetch dữ liệu, Framer Motion để tạo hiệu ứng chuyển động,
 * và React Router để điều hướng.
 */

import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MapPin, Clock, Star, Search, Zap, Shield, Smartphone, Bell } from 'lucide-react'
import { courtService } from '@/services'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { formatPrice } from '@/lib/utils'

/**
 * HomePage Component
 *
 * Component trang chủ, hiển thị giao diện landing page chính của ứng dụng.
 * Component này không nhận props đầu vào và không có state nội bộ phức tạp.
 *
 * Luồng hoạt động:
 * 1. Gọi API `courtService.getCourts({ limit: 6 })` để lấy tối đa 6 sân nổi bật.
 * 2. Hiển thị skeleton loading khi đang fetch dữ liệu.
 * 3. Hiển thị danh sách sân dưới dạng grid card khi có dữ liệu.
 * 4. Hiển thị thông báo rỗng nếu không có sân nào.
 *
 * @returns {JSX.Element} Giao diện trang chủ với Hero, Features và Featured Courts.
 */
export default function HomePage() {
  /**
   * Fetch danh sách sân nổi bật từ API.
   * - queryKey: ['courts', 'featured'] - định danh cache cho React Query.
   * - queryFn: gọi courtService.getCourts với limit = 6, trả về tối đa 6 sân.
   * - Kết quả được chuẩn hóa để lấy mảng sân từ response (hỗ trợ nhiều định dạng response API).
   */
  const { data: courtsData, isLoading } = useQuery({
    queryKey: ['courts', 'featured'],
    queryFn: () => courtService.getCourts({ limit: 6 }).then(r => r.data.data ?? r.data ?? []),
  })

  /**
   * Chuẩn hóa dữ liệu sân từ API response.
   * API có thể trả về mảng trực tiếp hoặc object chứa thuộc tính `courts`.
   * Nếu không có dữ liệu, mặc định là mảng rỗng.
   */
  const courts = Array.isArray(courtsData) ? courtsData : courtsData?.courts ?? []

  return (
    <div className="min-h-screen">
      {/* ==================== PHẦN HERO ==================== */}
      {/*
       * Phần Hero là khu vực đầu tiên người dùng nhìn thấy.
       * Sử dụng gradient background kết hợp màu primary và green.
       * Framer Motion được dùng để tạo hiệu ứng fade-in từ dưới lên.
       * Chứa CTA button "Tìm sân ngay" dẫn đến /courts.
       */}
      <section className="relative bg-gradient-to-br from-primary/10 via-background to-green-500/10 border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-16 sm:py-24 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="text-3xl sm:text-5xl font-bold leading-tight">
              Đặt sân <span className="bg-gradient-to-r from-primary to-green-400 bg-clip-text text-transparent">Pickleball</span>
              <br />nhanh chóng, dễ dàng
            </h1>
            <p className="mt-4 text-muted-foreground text-base sm:text-lg max-w-2xl mx-auto leading-relaxed">
              Hệ thống đặt sân Pickleball trực tuyến. Xem lịch trống theo thời gian thực, đặt sân và thanh toán chỉ trong vài phút.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link to="/courts">
                <div className="inline-flex items-center gap-2 px-8 py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors shadow-lg">
                  <Search className="size-5" /> Tìm sân ngay
                </div>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ==================== PHẦN TÍNH NĂNG ==================== */}
      {/*
       * Phần Features hiển thị 4 tính năng nổi bật của hệ thống.
       * Mỗi tính năng gồm: icon, tiêu đề, và mô tả ngắn.
       * Layout: 1 cột trên mobile, 2 cột trên tablet (sm), 4 cột trên desktop (lg).
       * Sử dụng Framer Motion whileInView để animate khi scroll đến.
       */}
      <section className="bg-muted/30 border-b border-border">
        <div className="max-w-5xl mx-auto px-4 py-12">
          <motion.div initial={{ opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true }} className="text-center">
            <h2 className="text-xl sm:text-2xl font-bold">Tại sao chọn PickleBall?</h2>
          </motion.div>
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 text-center">
            {[
              { Icon: Zap, title: 'Đặt sân nhanh', desc: 'Chỉ vài bước đơn giản' },
              { Icon: Shield, title: 'An toàn', desc: 'Bảo mật thông tin tuyệt đối' },
              { Icon: Smartphone, title: 'Mọi thiết bị', desc: 'Trải nghiệm mượt mà trên mobile & desktop' },
              { Icon: Bell, title: 'Thông báo', desc: 'Cập nhật lịch sân theo thời gian thực' },
            ].map((item, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 15 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
                transition={{ delay: i * 0.1 }} className="p-4">
                <div className="size-10 mx-auto mb-2 rounded-lg bg-primary/10 flex items-center justify-center">
                  <item.Icon className="size-5 text-primary" />
                </div>
                <h3 className="font-semibold mt-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground mt-1">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== PHẦN SÂN NỔI BẬT ==================== */}
      {/*
       * Phần Featured Courts hiển thị danh sách các sân Pickleball nổi bật.
       *
       * 3 trạng thái hiển thị:
       * 1. isLoading = true: hiển thị 6 CardSkeleton để tạo hiệu ứng loading.
       * 2. courts.length === 0: hiển thị thông báo "Chưa có sân nào" với icon MapPin.
       * 3. Có dữ liệu: hiển thị grid 3 cột các card sân.
       *
       * Mỗi card sân hiển thị:
       * - Ảnh sân (hoặc placeholder nếu không có ảnh).
       * - Badge trạng thái (Sẵn sàng / Bảo trì) ở góc trên phải.
       * - Tên sân, mô tả (giới hạn 2 dòng với line-clamp-2).
       * - Số khung giờ và đánh giá trung bình (dạng sao).
       * - Link dẫn đến trang chi tiết sân (/courts/:id).
       */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Sân nổi bật</h2>
          <Link to="/courts" className="text-sm text-primary hover:underline">Xem tất cả</Link>
        </div>
        {isLoading ? (
          // Trạng thái loading: hiển thị 6 skeleton cards
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : courts.length === 0 ? (
          // Trạng thái rỗng: không có sân nào để hiển thị
          <div className="text-center py-12 text-muted-foreground">
            <MapPin className="size-12 mx-auto mb-3 opacity-30" />
            <p>Chưa có sân nào. Hãy quay lại sau.</p>
          </div>
        ) : (
          // Trạng thái có dữ liệu: hiển thị grid sân
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {courts.map((court: any) => (
              <Link key={court.id} to={`/courts/${court.id}`}
                className="group rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 hover:shadow-lg transition-all duration-300">
                {/* Ảnh sân hoặc placeholder */}
                <div className="aspect-video bg-muted relative overflow-hidden">
                  {court.hinhAnh ? (
                    <img src={court.hinhAnh} alt={court.tenSan} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <MapPin className="size-12 opacity-30" />
                    </div>
                  )}
                  {/* Badge trạng thái sân: hiển thị ở góc trên bên phải */}
                  <div className={`absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-medium ${court.trangThai === 'Sẵn sàng' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
                    {court.trangThai || 'Sẵn sàng'}
                  </div>
                </div>
                {/* Thông tin sân */}
                <div className="p-4">
                  <h3 className="font-semibold group-hover:text-primary transition-colors">{court.tenSan}</h3>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{court.moTa || 'Sân Pickleball tiêu chuẩn'}</p>
                  <div className="flex items-center gap-3 mt-3 text-sm text-muted-foreground">
                    {/* Số lượng khung giờ có sẵn */}
                    <span className="flex items-center gap-1"><Clock className="size-3" /> {court.slotCount ?? 0} khung giờ</span>
                    {/* Đánh giá trung bình và số lượt đánh giá */}
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
      </section>
    </div>
  )
}
