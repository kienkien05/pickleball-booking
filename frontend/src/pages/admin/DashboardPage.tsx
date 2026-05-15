/**
 * Trang Tổng Quan Admin (DashboardPage)
 * =====================================
 * @purpose Trang dashboard chính dành cho quản trị viên, hiển thị:
 *   - 4 thẻ thống kê (cards): Tổng số sân, Khách hàng, Đơn hôm nay, Doanh thu tháng
 *   - Biểu đồ cột doanh thu 7 ngày gần nhất (sử dụng Recharts)
 *
 * @route /admin/dashboard
 * @access Admin (yêu cầu quyền admin)
 *
 * @dataSource
 *   - API: adminService.getDashboard() trả về stats (tổng quan) và revenueByDay (dữ liệu biểu đồ)
 *   - Mỗi card có icon và màu riêng biệt để dễ phân biệt
 *
 * @ui
 *   - Grid 4 cột cho stats cards (responsive: 1 cột mobile, 2 tablet, 4 desktop)
 *   - BarChart từ Recharts hiển thị doanh thu theo ngày
 *   - Animation fade-in + slide-up tuần tự cho từng card (dùng framer-motion)
 */

import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { MapPin, Users, ClipboardList, DollarSign } from 'lucide-react'
import { adminService } from '@/services'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice } from '@/lib/utils'
// Recharts: thư viện biểu đồ cho React
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

/**
 * Trang tổng quan admin
 * @description Hiển thị các chỉ số thống kê quan trọng và biểu đồ doanh thu
 * @returns Giao diện dashboard với cards thống kê và biểu đồ cột
 */
export default function DashboardPage() {
  /**
   * Truy vấn dữ liệu dashboard từ API admin
   * @description Lấy đồng thời stats (số liệu tổng quan) và revenueByDay (dữ liệu 7 ngày)
   */
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => adminService.getDashboard().then(r => r.data.data ?? r.data),
  })

  // Dữ liệu thống kê tổng quan: { totalCourts, totalUsers, todayBookings, monthlyRevenue }
  const stats = data?.stats ?? {}
  // Dữ liệu doanh thu theo ngày cho biểu đồ: [{ date, revenue }, ...]
  const chartData = data?.revenueByDay ?? []

  /**
   * Định nghĩa 4 thẻ thống kê
   * @property label - Tên chỉ số hiển thị
   * @property value - Giá trị (formatPrice cho doanh thu)
   * @property icon - Icon Lucide tương ứng
   * @property color - Màu của icon (sử dụng tailwind text color)
   */
  const cards = [
    { label: 'Tổng sân', value: stats.totalCourts ?? 0, icon: MapPin, color: 'text-primary' },
    { label: 'Khách hàng', value: stats.totalUsers ?? 0, icon: Users, color: 'text-blue-500' },
    { label: 'Đơn hôm nay', value: stats.todayBookings ?? 0, icon: ClipboardList, color: 'text-amber-500' },
    // Doanh thu tháng được format sang VND
    { label: 'Doanh thu tháng', value: formatPrice(Number(stats.monthlyRevenue ?? 0)), icon: DollarSign, color: 'text-green-500' },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Grid 4 cột thẻ thống kê (responsive: 1 cột mobile, 2 tablet, 4 desktop) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          // Mỗi card có animation fade-in + slide-up, delay tăng dần theo index
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <card.icon className={`size-5 ${card.color}`} />
            </div>
            {/* Khi loading: skeleton; khi có dữ liệu: hiển thị giá trị */}
            {isLoading ? <Skeleton className="h-8 w-24 mt-2" /> : <p className="text-2xl font-bold mt-2">{card.value}</p>}
          </motion.div>
        ))}
      </div>

      {/* Biểu đồ doanh thu 7 ngày qua */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold mb-4">Doanh thu 7 ngày qua</h2>
        {isLoading ? (
          // Trạng thái loading: skeleton chiếm toàn bộ chiều cao biểu đồ
          <div className="h-[300px] flex items-center justify-center"><Skeleton className="h-full w-full" /></div>
        ) : chartData.length > 0 ? (
          // Biểu đồ cột (BarChart) từ Recharts, responsive theo kích thước container
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              {/* Lưới ngang (không có lưới dọc), nét đứt */}
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              {/* Trục X: ngày, font size 12 */}
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              {/* Trục Y: doanh thu, hiển thị dạng k (nghìn), vd: 500k */}
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v/1000}k`} />
              {/* Tooltip khi hover vào cột: hiển thị doanh thu đã format ra VND */}
              <Tooltip
                contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }}
                formatter={(val: any) => [formatPrice(val), 'Doanh thu']}
              />
              {/* Cột doanh thu: màu primary, góc trên bo tròn */}
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          // Trạng thái không có dữ liệu
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            <p>Chưa có dữ liệu doanh thu trong 7 ngày qua</p>
          </div>
        )}
      </div>
    </div>
  )
}
