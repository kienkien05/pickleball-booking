import { useQuery } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Ticket, Clock, Info, Copy, CheckCircle2 } from 'lucide-react'
import { discountService } from '@/services'
import { formatPrice, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { Skeleton } from '@/components/ui/Skeleton'

export default function VouchersPage() {
  const { data: vouchers, isLoading } = useQuery({
    queryKey: ['my-discounts-page'],
    queryFn: () => discountService.getMyDiscounts().then(r => r.data.data ?? []),
  })

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code)
    toast.success('Đã sao chép mã: ' + code)
  }

  if (isLoading) {
    return (
      <div className="container py-10">
        <h1 className="text-3xl font-bold mb-8">Kho Voucher của bạn</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-40 rounded-2xl" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="container py-10 min-h-[70vh]">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-10">
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">Kho Voucher</h1>
          <p className="text-muted-foreground mt-2">Danh sách các mã giảm giá dành riêng cho bạn</p>
        </div>
        <div className="bg-primary/10 px-4 py-2 rounded-full border border-primary/20 flex items-center gap-2 text-primary text-sm font-medium">
          <Ticket className="size-4" />
          {vouchers?.length || 0} Voucher khả dụng
        </div>
      </div>

      {!vouchers || vouchers.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-card rounded-3xl border border-dashed border-border">
          <div className="bg-muted p-6 rounded-full mb-4">
            <Ticket className="size-12 text-muted-foreground opacity-20" />
          </div>
          <h3 className="text-xl font-semibold">Chưa có mã giảm giá nào</h3>
          <p className="text-muted-foreground max-w-xs mt-2">
            Hãy tích cực đặt sân để nhận được những ưu đãi hấp dẫn từ hệ thống nhé!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vouchers.map((voucher: any, index: number) => (
            <motion.div
              key={voucher.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="group relative bg-card rounded-2xl border border-border overflow-hidden hover:shadow-xl hover:shadow-primary/5 transition-all duration-300"
            >
              {/* Left Side Decor */}
              <div className="absolute left-0 top-0 bottom-0 w-2 bg-primary/20 group-hover:bg-primary transition-colors" />
              
              <div className="p-6">
                <div className="flex justify-between items-start mb-4">
                  <div className="bg-primary/10 p-2.5 rounded-xl text-primary group-hover:scale-110 transition-transform">
                    <Ticket className="size-6" />
                  </div>
                  {voucher.soLuongBanDau > 0 && (
                    <span className="text-[10px] font-bold uppercase tracking-wider bg-secondary text-secondary-foreground px-2 py-1 rounded-md">
                      Còn {voucher.soLuongBanDau - voucher.soLuongDaDung} lượt
                    </span>
                  )}
                </div>

                <h3 className="text-lg font-bold line-clamp-1">{voucher.noiDung}</h3>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2 min-h-[40px]">
                  {voucher.moTa}
                </p>

                <div className="mt-6 flex items-center justify-between gap-4">
                  <div className="flex-1">
                    <div className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest mb-1 flex items-center gap-1">
                      <Clock className="size-3" /> Hạn dùng: {voucher.ngayKetThuc ? formatDate(voucher.ngayKetThuc) : 'Vô thời hạn'}
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="bg-muted px-3 py-1.5 rounded-lg font-mono font-bold text-primary text-sm flex-1 text-center border border-border">
                        {voucher.code}
                      </code>
                      <button 
                        onClick={() => handleCopy(voucher.code)}
                        className="p-2 hover:bg-primary hover:text-primary-foreground rounded-lg transition-colors border border-border"
                        title="Sao chép mã"
                      >
                        <Copy className="size-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Applied Badge if applicable */}
                <div className="mt-4 pt-4 border-t border-dashed border-border flex items-center gap-2 text-xs text-muted-foreground">
                  <Info className="size-3.5" />
                  <span>Giảm {voucher.loaiGiamGia === 'percentage' ? `${voucher.mucGiamGia}%` : formatPrice(voucher.mucGiamGia)}</span>
                </div>
              </div>

              {/* Ticket Cut-outs */}
              <div className="absolute left-[-8px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-background border border-border" />
              <div className="absolute right-[-8px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-background border border-border" />
            </motion.div>
          ))}
        </div>
      )}

      {/* Promotion Banner */}
      <div className="mt-16 bg-gradient-to-br from-primary/10 to-transparent p-8 rounded-3xl border border-primary/20 flex flex-col md:flex-row items-center gap-8">
        <div className="size-20 bg-primary/20 rounded-2xl flex items-center justify-center">
          <CheckCircle2 className="size-10 text-primary" />
        </div>
        <div>
          <h2 className="text-2xl font-bold mb-2">Làm sao để nhận thêm mã?</h2>
          <ul className="space-y-2 text-muted-foreground">
            <li className="flex items-center gap-2">
              <div className="size-1.5 rounded-full bg-primary" />
              Tích cực đặt sân: Cứ mỗi 3 lần đặt sân thành công bạn sẽ nhận ngay 1 mã giảm giá 10%.
            </li>
            <li className="flex items-center gap-2">
              <div className="size-1.5 rounded-full bg-primary" />
              Theo dõi fanpage để săn các mã khuyến mãi theo mùa (Mùa hè, Tết...).
            </li>
            <li className="flex items-center gap-2">
              <div className="size-1.5 rounded-full bg-primary" />
              Nâng cấp lên tài khoản VIP để hưởng các đặc quyền giảm giá cố định.
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
