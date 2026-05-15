/**
 * Trang Kết Quả Thanh Toán (PaymentReturnPage)
 * ============================================
 * @purpose Trang nhận kết quả sau khi người dùng hoàn tất (hoặc thất bại) quá trình
 *   thanh toán qua cổng thanh toán. Trang này đọc query param `?status=` từ URL
 *   để xác định kết quả và hiển thị giao diện tương ứng.
 *
 * @route /payment/return?status=success|failure
 * @access Người dùng sau khi được redirect từ cổng thanh toán
 *
 * @businessLogic
 *   - status=success: Hiển thị thông báo thành công, hướng dẫn thanh toán phần còn lại tại sân
 *   - status khác: Hiển thị thông báo thất bại, khuyến khích thử lại
 *   - Cả 2 trường hợp đều cung cấp link đến lịch sử đặt sân và đặt thêm sân
 */

import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, XCircle, CreditCard, Banknote } from 'lucide-react'

/**
 * Trang hiển thị kết quả thanh toán
 * @description Đọc trạng thái từ URL query params, hiển thị giao diện
 *   thành công hoặc thất bại tương ứng với nội dung hướng dẫn phù hợp
 * @returns Giao diện kết quả thanh toán
 */
export default function PaymentReturnPage() {
  // Lấy tất cả query params từ URL hiện tại (vd: ?status=success)
  const [searchParams] = useSearchParams()
  // Đọc giá trị của param 'status' để xác định kết quả
  const status = searchParams.get('status')
  // status === 'success' nghĩa là thanh toán thành công
  const success = status === 'success'

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      {/* Icon kết quả: tích xanh nếu thành công, X đỏ nếu thất bại */}
      <div className={`size-16 mx-auto rounded-full flex items-center justify-center mb-4 ${success ? 'bg-success/10' : 'bg-destructive/10'}`}>
        {success ? <CheckCircle className="size-8 text-success" /> : <XCircle className="size-8 text-destructive" />}
      </div>

      {/* Tiêu đề kết quả */}
      <h1 className="text-xl font-bold">{success ? 'Đặt sân thành công!' : 'Đặt sân thất bại'}</h1>

      {/* Mô tả chi tiết theo từng trường hợp */}
      <p className="mt-2 text-muted-foreground">
        {success
          ? 'Đơn đặt sân của bạn đã được ghi nhận. Vui lòng thanh toán tại sân khi đến chơi.'
          : 'Đã có lỗi xảy ra trong quá trình đặt sân. Vui lòng thử lại.'
        }
      </p>

      {/* Chỉ hiển thị block hướng dẫn thanh toán tại sân khi đặt sân thành công */}
      {success && (
        <div className="mt-6 p-4 rounded-xl border border-border bg-card text-left text-sm space-y-2">
          <p className="font-medium flex items-center gap-2">
            <Banknote className="size-4 text-amber-500" /> Hình thức thanh toán
          </p>
          {/* Hướng dẫn thanh toán phần còn lại tại quầy */}
          <p className="text-muted-foreground">
            Quý khách vui lòng thanh toán số tiền còn lại tại quầy khi đến sân (tiền mặt hoặc chuyển khoản).
          </p>
          {/* Thông tin tài khoản ngân hàng để chuyển khoản (hardcoded - cần cập nhật theo thực tế) */}
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <CreditCard className="size-3" /> STK: 0123456789 - MB Bank - NGUYEN VAN A
            </p>
          </div>
        </div>
      )}

      {/* Các link điều hướng: xem lịch sử đặt sân hoặc đặt thêm sân */}
      <div className="mt-6 space-x-4">
        <Link to="/my-bookings" className="text-primary hover:underline">Xem lịch sử đặt sân</Link>
        <Link to="/courts" className="text-primary hover:underline">Đặt thêm sân</Link>
      </div>
    </div>
  )
}
