import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, TrendingUp, DollarSign, ClipboardList, Calendar, MapPin, PieChart as PieIcon, ArrowUpRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { toast } from 'sonner'
import { adminService } from '@/services'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice, cn } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899']

export default function ReportsPage() {
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  
  const [startDate, setStartDate] = useState(todayStr)
  const [endDate, setEndDate] = useState(todayStr)
  const [exporting, setExporting] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'reports', startDate, endDate],
    queryFn: () => adminService.getReports({ startDate, endDate }).then(r => r.data.data ?? r.data),
  })

  const stats = data?.summary ?? {}
  const revenueByDay = data?.revenueByDay ?? []
  const revenueByCourt = data?.revenueByCourt ?? []

  const handleExport = async () => {
    setExporting(true)
    try {
      const response = await adminService.exportReports({ startDate, endDate })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `bao-cao-doanh-thu-${startDate}-${endDate}.xlsx`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.URL.revokeObjectURL(url)
      toast.success('Xuất báo cáo thành công!')
    } catch (err) {
      toast.error('Xuất báo cáo thất bại')
    } finally { setExporting(false) }
  }

  const statCards = [
    { label: 'Tổng doanh thu', value: formatPrice(Number(stats.totalRevenue ?? 0)), icon: DollarSign, color: 'bg-emerald-500', text: 'text-emerald-500' },
    { label: 'Tổng đơn hàng', value: stats.totalBookings ?? 0, icon: ClipboardList, color: 'bg-blue-500', text: 'text-blue-500' },
    { label: 'Doanh thu hủy cọc', value: formatPrice(Number(stats.cancelRevenue ?? 0)), icon: ArrowUpRight, color: 'bg-red-500', text: 'text-red-500' },
  ]

  return (
    <div className="space-y-8 pb-12 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">Báo cáo doanh thu</h1>
          <p className="text-muted-foreground text-sm font-medium mt-1">Phân tích chi tiết hiệu quả kinh doanh của hệ thống.</p>
        </div>
        <Button onClick={handleExport} loading={exporting} className="rounded-2xl h-12 px-6 shadow-lg shadow-primary/20 gap-2 font-bold uppercase text-xs tracking-widest">
          <Download className="size-4" />Xuất Excel
        </Button>
      </div>

      <div className="bg-card p-6 rounded-[2rem] border border-border shadow-sm flex flex-wrap items-end gap-6">
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Từ ngày</label>
          <div className="relative">
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="h-12 pl-12 pr-6 rounded-2xl border border-border bg-muted/30 outline-none focus:border-primary transition-all font-bold text-sm" />
          </div>
        </div>
        <div className="space-y-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground ml-1">Đến ngày</label>
          <div className="relative">
            <Calendar className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="h-12 pl-12 pr-6 rounded-2xl border border-border bg-muted/30 outline-none focus:border-primary transition-all font-bold text-sm" />
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-32 rounded-[2rem]" />
          <Skeleton className="h-32 rounded-[2rem]" />
          <Skeleton className="h-32 rounded-[2rem]" />
          <Skeleton className="h-[400px] md:col-span-2 rounded-[2rem]" />
          <Skeleton className="h-[400px] rounded-[2rem]" />
        </div>
      ) : (
        <div className="space-y-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {statCards.map((card, i) => (
              <motion.div key={i} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.1 }}
                className="group relative overflow-hidden rounded-[2rem] border border-border bg-card p-6 shadow-sm hover:shadow-xl transition-all duration-300">
                <div className={cn("absolute top-0 right-0 size-24 -mr-6 -mt-6 rounded-full opacity-[0.05] transition-transform duration-500 group-hover:scale-150", card.color)} />
                <div className="flex items-center gap-4 relative z-10">
                  <div className={cn("p-4 rounded-2xl bg-opacity-10", card.color.replace('bg-', 'bg-opacity-10 bg-'))}>
                    <card.icon className={cn("size-6", card.text)} />
                  </div>
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">{card.label}</p>
                    <p className="text-2xl font-black mt-1 tracking-tight">{card.value}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 rounded-[2.5rem] border border-border bg-card p-8 shadow-sm">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-3 rounded-2xl bg-primary/10 text-primary">
                  <TrendingUp className="size-6" />
                </div>
                <div>
                  <h2 className="font-black text-xl uppercase tracking-tight">Doanh thu theo ngày</h2>
                  <p className="text-xs text-muted-foreground font-medium">Chi tiết biến động doanh thu</p>
                </div>
              </div>
              
              <div className="h-[350px] w-full">
                {revenueByDay.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={revenueByDay} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700 }} stroke="hsl(var(--muted-foreground))" dy={10} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700 }} stroke="hsl(var(--muted-foreground))" tickFormatter={(v) => `${v/1000}k`} />
                      <Tooltip 
                        cursor={{ fill: 'hsl(var(--muted))', opacity: 0.4 }}
                        contentStyle={{ 
                          background: 'hsl(var(--card))', 
                          border: '1px solid hsl(var(--border))', 
                          borderRadius: '16px',
                          boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)',
                          padding: '12px'
                        }} 
                        itemStyle={{ fontWeight: 800, fontSize: '14px' }}
                        labelStyle={{ fontWeight: 800, marginBottom: '4px', color: 'hsl(var(--foreground))' }}
                        formatter={(val: any) => [formatPrice(val), 'Doanh thu']}
                      />
                      {revenueByCourt.map((court: any, i: number) => (
                        <Bar 
                          key={court.name} 
                          dataKey={court.name} 
                          name={court.name}
                          stackId="a" 
                          fill={COLORS[i % COLORS.length]} 
                          radius={i === revenueByCourt.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]}
                          barSize={40}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
                    <TrendingUp className="size-12 opacity-20" />
                    <p className="font-bold">Chưa có dữ liệu thời gian này</p>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-[2.5rem] border border-border bg-card p-8 shadow-sm flex flex-col">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-500">
                  <PieIcon className="size-6" />
                </div>
                <div>
                  <h2 className="font-black text-xl uppercase tracking-tight">Tỉ trọng sân</h2>
                  <p className="text-xs text-muted-foreground font-medium">Doanh thu theo từng sân</p>
                </div>
              </div>

              <div className="flex-1 h-[250px] relative">
                {revenueByCourt.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={revenueByCourt} dataKey="revenue" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} cornerRadius={8}>
                        {revenueByCourt.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />)}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '16px' }}
                        formatter={(val: any) => [formatPrice(val), 'Doanh thu']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex items-center justify-center h-full text-muted-foreground font-bold">Không có dữ liệu</div>
                )}
              </div>

              <div className="space-y-3 mt-6">
                {revenueByCourt.map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-2xl bg-muted/20 border border-border/50 group hover:bg-muted/40 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="size-3 rounded-full shadow-sm" style={{ background: COLORS[i % COLORS.length] }} />
                      <span className="text-xs font-black truncate max-w-[120px]">{item.name}</span>
                    </div>
                    <span className="text-xs font-bold tabular-nums">{formatPrice(Number(item.revenue))}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
