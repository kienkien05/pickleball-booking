import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MapPin, Clock, Star, Search, Zap, Shield, Smartphone, Bell } from 'lucide-react'
import { courtService } from '@/services'
import { CardSkeleton } from '@/components/ui/Skeleton'
import { formatPrice } from '@/lib/utils'

export default function HomePage() {
  const { data: courtsData, isLoading } = useQuery({
    queryKey: ['courts', 'featured'],
    queryFn: () => courtService.getCourts({ limit: 6 }).then(r => r.data.data ?? r.data ?? []),
  })

  const courts = Array.isArray(courtsData) ? courtsData : courtsData?.courts ?? []

  return (
    <div className="min-h-screen">
      {/* Hero */}
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

      {/* Features */}
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

      {/* Featured Courts */}
      <section className="max-w-6xl mx-auto px-4 py-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold">Sân nổi bật</h2>
          <Link to="/courts" className="text-sm text-primary hover:underline">Xem tất cả</Link>
        </div>
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
          </div>
        ) : courts.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <MapPin className="size-12 mx-auto mb-3 opacity-30" />
            <p>Chưa có sân nào. Hãy quay lại sau.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {courts.map((court: any) => (
              <Link key={court.id} to={`/courts/${court.id}`}
                className="group rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 hover:shadow-lg transition-all duration-300">
                <div className="aspect-video bg-muted relative overflow-hidden">
                  {court.hinhAnh ? (
                    <img src={court.hinhAnh} alt={court.tenSan} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                      <MapPin className="size-12 opacity-30" />
                    </div>
                  )}
                  <div className={`absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-medium ${court.trangThai === 'Sẵn sàng' ? 'bg-success/20 text-success' : 'bg-warning/20 text-warning'}`}>
                    {court.trangThai || 'Sẵn sàng'}
                  </div>
                </div>
                <div className="p-4">
                  <h3 className="font-semibold group-hover:text-primary transition-colors">{court.tenSan}</h3>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{court.moTa || 'Sân Pickleball tiêu chuẩn'}</p>
                  <div className="flex items-center gap-3 mt-3 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="size-3" /> {court.slotCount ?? 0} khung giờ</span>
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
