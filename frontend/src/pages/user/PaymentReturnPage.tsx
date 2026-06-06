import { useSearchParams, Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, CreditCard, Banknote, Loader2 } from 'lucide-react'
import api from '@/services/api'

/**
 * Trang hiển thị kết quả thanh toán
 * @description Đọc trạng thái từ URL query params, gọi API xác thực VNPay, hiển thị giao diện
 *   thành công hoặc thất bại tương ứng với nội dung hướng dẫn phù hợp
 * @returns Giao diện kết quả thanh toán
 */
export default function PaymentReturnPage() {
  const [searchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [success, setSuccess] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const vnp_SecureHash = searchParams.get('vnp_SecureHash')
    const vnp_ResponseCode = searchParams.get('vnp_ResponseCode')

    if (vnp_SecureHash || vnp_ResponseCode) {
      // Nếu có các tham số của VNPay, gọi API xác thực với backend
      api.get('/bookings/vnpay-verify', {
        params: Object.fromEntries(searchParams.entries())
      })
        .then((res: any) => {
          const courtId = res.data?.courtId;
          const vnp_TxnRef = searchParams.get('vnp_TxnRef');
          if (courtId && vnp_TxnRef) {
            sessionStorage.setItem(`paid_${vnp_TxnRef}`, String(courtId));
          }
          setSuccess(true)
          setLoading(false)
        })
        .catch((err: any) => {
          setSuccess(false)
          setErrorMessage(err.response?.data?.error || err.response?.data?.message || 'Xác thực thanh toán thất bại')
          setLoading(false)
        })
    } else {
      // Nếu không có tham số VNPay, dùng fallback status=success thông thường
      const status = searchParams.get('status')
      setSuccess(status === 'success')
      setLoading(false)
    }
  }, [searchParams])

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-32 text-center space-y-4">
        <Loader2 className="size-12 mx-auto text-primary animate-spin" />
        <h1 className="text-xl font-bold">Đang xác thực giao dịch...</h1>
        <p className="text-sm text-muted-foreground">Vui lòng không tắt hoặc reload trang này trong khi hệ thống đang xử lý.</p>
      </div>
    )
  }

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center animate-in fade-in duration-300">
      {/* Icon kết quả: tích xanh nếu thành công, X đỏ nếu thất bại */}
      <div className={`size-16 mx-auto rounded-full flex items-center justify-center mb-4 ${success ? 'bg-success/10' : 'bg-destructive/10'}`}>
        {success ? <CheckCircle className="size-8 text-success" /> : <XCircle className="size-8 text-destructive" />}
      </div>

      {/* Tiêu đề kết quả */}
      <h1 className="text-xl font-bold">{success ? 'Đặt sân thành công!' : 'Đặt sân thất bại'}</h1>

      {/* Mô tả chi tiết theo từng trường hợp */}
      <p className="mt-2 text-muted-foreground text-sm">
        {success
          ? 'Đơn đặt sân của bạn đã được ghi nhận và thanh toán thành công qua VNPay Sandbox.'
          : errorMessage || 'Đã có lỗi xảy ra hoặc giao dịch thanh toán bị hủy. Vui lòng thử lại.'
        }
      </p>

      {/* Chỉ hiển thị block xác nhận thanh toán khi đặt sân thành công */}
      {success && (
        <div className="mt-6 p-4 rounded-xl border border-border bg-card text-left text-sm space-y-2">
          <p className="font-medium flex items-center gap-2">
            <Banknote className="size-4 text-success" /> Trạng thái thanh toán
          </p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            Hệ thống đã nhận được thông tin thanh toán thành công của bạn. Lịch chơi đã được xác nhận và khóa cho bạn.
          </p>
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Mã giao dịch VNPay: {searchParams.get('vnp_TransactionNo') || 'N/A'}
            </p>
          </div>
        </div>
      )}

      {/* Các link điều hướng: xem lịch sử đặt sân hoặc đặt thêm sân */}
      <div className="mt-8 flex justify-center gap-6 text-sm">
        <Link to="/my-bookings" className="text-primary hover:underline font-medium">Xem lịch đặt sân</Link>
        <div className="w-1.5 h-1.5 rounded-full bg-border self-center" />
        <Link to="/courts" className="text-primary hover:underline font-medium">Đặt thêm sân</Link>
      </div>
    </div>
  )
}
