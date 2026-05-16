/**
 * Trang Kho Voucher (VouchersPage)
 * ===============================
 * @purpose Trang hiển thị danh sách mã giảm giá (voucher/khuyến mãi) của người dùng,
 *   cho phép sao chép mã và kiểm tra mã khuyến mãi mới bằng cách nhập tay.
 *
 * @route /vouchers
 * @access Người dùng đã đăng nhập
 *
 * @businessLogic
 *   - Danh sách voucher lấy từ API discountService.getMyDiscounts()
 *   - Mỗi voucher hiển thị: tên, mô tả, hạn sử dụng, mức giảm (percent/fixed), mã code
 *   - Người dùng có thể sao chép mã code vào clipboard
 *   - Có ô tìm kiếm để kiểm tra mã khuyến mãi mới nhập từ nguồn ngoài
 *   - Phần hướng dẫn cách nhận thêm voucher (đặt sân, fanpage, VIP)
 */

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ticket, Copy, Check, Info, Search } from 'lucide-react'
import { toast } from 'sonner'
import { discountService } from '@/services'
import { Button } from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice, formatDate } from '@/lib/utils'

/**
 * Trang kho voucher người dùng
 * @description Hiển thị tất cả voucher của người dùng, cho phép sao chép mã
 *   và kiểm tra tính hợp lệ của mã khuyến mãi mới
 * @returns Giao diện danh sách voucher dạng lưới 2 cột
 */
export default function VouchersPage() {
  // state lưu mã code đã sao chép (để hiển thị icon check thay cho icon copy)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  // state lưu mã khuyến mãi người dùng nhập vào ô kiểm tra
  const [inputCode, setInputCode] = useState('')
  // state kiểm soát trạng thái loading khi đang kiểm tra mã
  const [checkingCode, setCheckingCode] = useState(false)
  const queryClient = useQueryClient()

  /**
   * Truy vấn lấy danh sách voucher của người dùng hiện tại
   * @description Gọi API getMyDiscounts, xử lý response để lấy danh sách
   * @staleTime 0 - luôn lấy dữ liệu mới khi component mount hoặc khi invalidate
   */
  const { data: vouchers, isLoading } = useQuery({
    queryKey: ['my-vouchers'],
    queryFn: () => discountService.getMyDiscounts().then(r => r.data.data ?? r.data ?? []),
    staleTime: 0,
  })

  // Chuẩn hóa dữ liệu: có thể là array trực tiếp hoặc nằm trong object { vouchers: [...] }
  const list = Array.isArray(vouchers) ? vouchers : vouchers?.vouchers ?? []

  /**
   * Sao chép mã giảm giá vào clipboard
   * @description Sử dụng Clipboard API để sao chép mã code, hiển thị toast thành công
   * @param code - Mã voucher cần sao chép
   * @logic
   *   1. Ghi mã vào clipboard
   *   2. Đánh dấu mã đã sao chép để đổi icon (Check thay Copy)
   *   3. Sau 2 giây, reset trạng thái sao chép
   */
  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    toast.success('Đã sao chép mã giảm giá!')
    setTimeout(() => setCopiedCode(null), 2000)
  }

  /**
   * Kiểm tra tính hợp lệ của mã khuyến mãi do người dùng nhập
   * @description Gọi API validate với mã code, giá trị đơn hàng giả định (1,000,000 VND)
   *   để kiểm tra mã có tồn tại và hợp lệ không
   * @logic
   *   1. Không làm gì nếu ô input trống
   *   2. Gọi discountService.validate với mã và số tiền giả định 1 triệu
   *   3. Nếu hợp lệ: hiển thị toast thông báo chi tiết mức giảm, làm mới danh sách voucher
   *   4. Nếu không hợp lệ: hiển thị toast lỗi từ server
   */
  const handleCheckCode = async () => {
    if (!inputCode.trim()) return
    setCheckingCode(true)
    try {
      // Gọi API validate với mã code, amount giả định 1 triệu, checkOnly = true
      const res = await discountService.validate(inputCode.trim(), 1000000, undefined, true)
      const data = res.data.data
      // Hiển thị thông tin mã: tên code, loại giảm (% hoặc số tiền), mức giảm
      toast.success(`Mã "${data.code}" hợp lệ! Giảm ${data.loaiGiamGia === 'percentage' ? data.mucGiamGia + '%' : formatPrice(Number(data.mucGiamGia))}.`)
      setInputCode('')
      // Làm mới danh sách voucher và notifications
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
      {/* Header: tiêu đề + ô kiểm tra mã */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Kho Voucher</h1>
          <p className="text-sm text-muted-foreground">Danh sách các mã giảm giá dành riêng cho bạn</p>
        </div>
        {/* Ô nhập mã khuyến mãi + nút Kiểm tra */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              type="text"
              value={inputCode}
              // Tự động chuyển thành chữ hoa vì mã voucher thường là uppercase
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

      {/* Danh sách voucher hiển thị dạng lưới 2 cột (1 cột trên mobile) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading ? (
          // Trạng thái loading: 4 skeleton placeholder
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-xl" />
          ))
        ) : list.length > 0 ? (
          // Render từng voucher
          list.map((v: any) => (
            <div key={v.id} className="bg-card border border-border rounded-xl p-5 relative overflow-hidden group transition-all hover:border-primary/50">
              <div className="flex items-start gap-4">
                {/* Icon Ticket */}
                <div className="p-3 bg-primary/10 rounded-lg text-primary">
                  <Ticket className="size-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    {/* Tên voucher / nội dung ưu đãi */}
                    <h3 className="font-bold text-base truncate">{v.noiDung || 'Ưu đãi đặt sân'}</h3>
                    {/* Tag "CÒN 1 LƯỢT" - mỗi voucher chỉ dùng 1 lần */}
                    <span className="shrink-0 px-2 py-0.5 bg-muted rounded text-[10px] font-bold text-muted-foreground uppercase">
                      CÒN 1 LƯỢT
                    </span>
                  </div>
                  {/* Mô tả voucher, giới hạn 2 dòng */}
                  <p className="text-xs text-muted-foreground line-clamp-2 mb-4">{v.moTa || 'Mã giảm giá tri ân khách hàng'}</p>

                  {/* Phần footer: hạn sử dụng + mức giảm + nút copy mã */}
                  <div className="flex items-center justify-between pt-4 border-t border-dashed border-border">
                    <div className="space-y-1">
                      {/* Hạn sử dụng, hiển thị "Không giới hạn" nếu không có ngày kết thúc */}
                      <div className="text-sm text-muted-foreground flex items-center gap-1 uppercase font-bold tracking-tighter">
                        <Info className="size-3" /> Hạn dùng: {v.ngayKetThuc ? formatDate(v.ngayKetThuc) : 'Không giới hạn'}
                      </div>
                      {/* Mức giảm: hiển thị % nếu là percentage, hoặc số tiền nếu là fixed */}
                      <div className="text-sm font-bold text-primary italic">
                        Giảm {v.loaiGiamGia === 'percentage' ? `${v.mucGiamGia}%` : formatPrice(Number(v.mucGiamGia))}
                      </div>
                    </div>
                    {/* Nút copy mã code */}
                    <button
                      onClick={() => handleCopy(v.code)}
                      className="flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted-foreground/10 rounded-lg transition-colors"
                    >
                      <span className="font-mono text-sm font-bold">{v.code}</span>
                      {/* Đổi icon Check sau khi copy thành công (trong 2 giây) */}
                      {copiedCode === v.code ? <Check className="size-4 text-success" /> : <Copy className="size-4 opacity-40" />}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))
        ) : (
          // Trạng thái rỗng: chưa có voucher nào
          <div className="col-span-full py-20 text-center text-muted-foreground bg-muted/20 rounded-2xl border border-dashed border-border">
            <Ticket className="size-12 mx-auto mb-3 opacity-20" />
            <p className="text-lg font-medium">Chưa có mã giảm giá nào</p>
            <p className="text-sm">Hãy tích cực đặt sân để nhận được những ưu đãi nhé!</p>
          </div>
        )}
      </div>

      {/* Phần hướng dẫn: làm sao để nhận thêm voucher */}
      <div className="bg-muted/30 border border-border rounded-xl p-6 space-y-4 mt-8">
        <h2 className="text-lg font-bold">Làm sao để nhận thêm mã?</h2>
        <ul className="space-y-3 text-sm text-muted-foreground">
          <li className="flex items-start gap-2">
            <div className="size-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
            <span><strong className="text-foreground">Đăng ký tài khoản:</strong> Nhận ngay voucher mới.</span>
          </li>
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
