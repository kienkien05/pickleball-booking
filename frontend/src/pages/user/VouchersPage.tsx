import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ticket, Copy, Check, Info, Search } from 'lucide-react'
import { toast } from 'sonner'
import { discountService } from '@/services'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice, formatDate } from '@/lib/utils'

export default function VouchersPage() {
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [inputCode, setInputCode] = useState('')
  const [checkingCode, setCheckingCode] = useState(false)
  const queryClient = useQueryClient()

  const { data: vouchers, isLoading } = useQuery({
    queryKey: ['my-vouchers'],
    queryFn: () => discountService.getMyDiscounts().then(r => r.data.data ?? r.data ?? []),
    staleTime: 0,
  })

  const list = Array.isArray(vouchers) ? vouchers : vouchers?.vouchers ?? []

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    toast.success('Đã sao chép mã giảm giá!')
    setTimeout(() => setCopiedCode(null), 2000)
  }

  const handleCheckCode = async () => {
    if (!inputCode.trim()) return
    setCheckingCode(true)
    try {
      const res = await discountService.validate(inputCode.trim(), 1000000, undefined, true)
      const data = res.data.data
      toast.success(`Mã "${data.code}" hợp lệ! Giảm ${data.loaiGiamGia === 'percentage' ? data.mucGiamGia + '%' : formatPrice(Number(data.mucGiamGia))}.`)
      setInputCode('')
      queryClient.invalidateQueries({ queryKey: ['my-vouchers'] })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Mã giảm giá không hợp lệ')
    } finally {
      setCheckingCode(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Kho Voucher</h1>
          <p className="text-sm text-muted-foreground">Danh sách các mã giảm giá dành riêng cho bạn</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input 
              type="text" 
              value={inputCode}
              onChange={(e) => setInputCode(e.target.value.toUpperCase())}
              placeholder="Nhập mã khuyến mãi..." 
              className="h-10 pl-9 pr-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-primary outline-none text-sm font-mono"
            />
          </div>
          <Button size="sm" onClick={handleCheckCode} loading={checkingCode} disabled={!inputCode.trim()}>
            Kiểm tra
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))
        ) : list.length > 0 ? (
          list.map((v: any) => (
            <div key={v.id} className="bg-card border border-border rounded-xl p-5 relative overflow-hidden group transition-all hover:border-primary/50">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-primary/10 rounded-lg text-primary">
                  <Ticket className="size-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="font-bold text-base truncate">{v.noiDung || 'Ưu đãi đặt sân'}</h3>
                    <span className="shrink-0 px-2 py-0.5 bg-muted rounded text-[10px] font-bold text-muted-foreground uppercase">
                      CÒN 1 LƯỢT
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-4">{v.moTa || 'Mã giảm giá tri ân khách hàng'}</p>
                  
                  <div className="flex items-center justify-between pt-4 border-t border-dashed border-border">
                    <div className="space-y-1">
                      <div className="text-sm text-muted-foreground flex items-center gap-1 uppercase font-bold tracking-tighter">
                        <Info className="size-3" /> Hạn dùng: {v.ngayKetThuc ? formatDate(v.ngayKetThuc) : 'Không giới hạn'}
                      </div>
                      <div className="text-sm font-bold text-primary italic">
                         Giảm {v.loaiGiamGia === 'percentage' ? `${v.mucGiamGia}%` : formatPrice(Number(v.mucGiamGia))}
                      </div>
                    </div>
                    <button 
                      onClick={() => handleCopy(v.code)}
                      className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted-foreground/10 rounded-lg transition-colors"
                    >
                      <span className="font-mono text-sm font-bold">{v.code}</span>
                      {copiedCode === v.code ? <Check className="size-4 text-success" /> : <Copy className="size-4 opacity-40" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="col-span-full py-20 text-center text-muted-foreground bg-muted/20 rounded-2xl border border-dashed border-border">
            <Ticket className="size-12 mx-auto mb-3 opacity-20" />
            <p className="text-lg font-medium">Chưa có mã giảm giá nào</p>
            <p className="text-sm">Hãy tích cực đặt sân để nhận được những ưu đãi nhé!</p>
          </div>
        )}
      </div>

      <div className="bg-muted/30 border border-border rounded-xl p-6 space-y-4 mt-8">
        <h2 className="text-lg font-bold">Làm sao để nhận thêm mã?</h2>
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <div className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
            <span><strong className="text-foreground">Tích cực đặt sân:</strong> Cứ mỗi 3 lần đặt sân thành công bạn sẽ nhận ngay 1 mã giảm giá 10%.</span>
          </li>
          <li className="flex items-start gap-2">
            <div className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
            <span><strong className="text-foreground">Theo dõi fanpage:</strong> Để săn các mã khuyến mãi theo mùa (Mùa hè, Tết...).</span>
          </li>
          <li className="flex items-start gap-2">
            <div className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
            <span><strong className="text-foreground">Nâng cấp lên tài khoản VIP:</strong> Để hưởng các đặc quyền giảm giá cố định.</span>
          </li>
        </ul>
      </div>
    </div>
  )
}
