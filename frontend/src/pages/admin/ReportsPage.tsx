import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { adminService } from '@/services'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice } from '@/lib/utils'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

const COLORS = ['hsl(var(--primary))', '#3b82f6', '#f59e0b', '#ef4444']

export default function ReportsPage() {
  const today = new Date().toISOString().slice(0, 10)
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(today)
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Báo cáo doanh thu</h1>
        <Button variant="outline" onClick={handleExport} loading={exporting}>
          <Download className="size-4 mr-2" />Xuất Excel
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div>
          <label className="text-sm block mb-1">Từ ngày</label>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="h-11 px-4 rounded-lg border border-input bg-background outline-none" />
        </div>
        <div>
          <label className="text-sm block mb-1">Đến ngày</label>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="h-11 px-4 rounded-lg border border-input bg-background outline-none" />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">Tổng doanh thu</p>
              <p className="text-2xl font-bold mt-1">{formatPrice(Number(stats.totalRevenue ?? 0))}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">Tổng đơn hàng</p>
              <p className="text-2xl font-bold mt-1">{stats.totalBookings ?? 0}</p>
            </div>
            <div className="rounded-xl border border-border bg-card p-5">
              <p className="text-sm text-muted-foreground">Doanh thu hủy cọc</p>
              <p className="text-2xl font-bold mt-1">{formatPrice(Number(stats.cancelRevenue ?? 0))}</p>
            </div>
          </div>

          {revenueByDay.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold mb-4">Doanh thu theo ngày</h2>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={revenueByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 12 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {revenueByCourt.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="font-semibold mb-4">Doanh thu theo sân</h2>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={revenueByCourt} dataKey="revenue" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                    {revenueByCourt.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-4 mt-4">
                {revenueByCourt.map((item: any, i: number) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <div className="size-3 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                    <span>{item.name}: {formatPrice(Number(item.revenue))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {revenueByDay.length === 0 && revenueByCourt.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <TrendingUp className="size-12 mx-auto mb-3 opacity-30" />
              <p>Không có dữ liệu trong khoảng thời gian này</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}
