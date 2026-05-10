import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { MapPin, Users, ClipboardList, DollarSign, TrendingUp } from 'lucide-react'
import { adminService } from '@/services'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'dashboard'],
    queryFn: () => adminService.getDashboard().then(r => r.data.data ?? r.data),
  })

  const stats = data?.stats ?? {}
  const chartData = data?.revenueByDay ?? []

  const cards = [
    { label: 'Tổng sân', value: stats.totalCourts ?? 0, icon: MapPin, color: 'text-primary' },
    { label: 'Khách hàng', value: stats.totalUsers ?? 0, icon: Users, color: 'text-blue-500' },
    { label: 'Đơn hôm nay', value: stats.todayBookings ?? 0, icon: ClipboardList, color: 'text-amber-500' },
    { label: 'Doanh thu tháng', value: formatPrice(Number(stats.monthlyRevenue ?? 0)), icon: DollarSign, color: 'text-success' },
  ]

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
            className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <card.icon className={`size-5 ${card.color}`} />
            </div>
            {isLoading ? <Skeleton className="h-8 w-24 mt-2" /> : <p className="text-2xl font-bold mt-2">{card.value}</p>}
          </motion.div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="font-semibold mb-4">Doanh thu 7 ngày qua</h2>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
              <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
              <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[300px] text-muted-foreground">
            <p>Chưa có dữ liệu doanh thu trong 7 ngày qua</p>
          </div>
        )}
      </div>
    </div>
  )
}
