import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, XCircle } from 'lucide-react'

export default function PaymentReturnPage() {
  const [searchParams] = useSearchParams()
  const status = searchParams.get('status')
  const success = status === 'success'

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className={`size-16 mx-auto rounded-full flex items-center justify-center mb-4 ${success ? 'bg-success/10' : 'bg-destructive/10'}`}>
        {success ? <CheckCircle className="size-8 text-success" /> : <XCircle className="size-8 text-destructive" />}
      </div>
      <h1 className="text-xl font-bold">{success ? 'Thanh toán thành công!' : 'Thanh toán thất bại'}</h1>
      <p className="mt-2 text-muted-foreground">
        {success ? 'Cảm ơn bạn đã đặt sân. Đơn đặt của bạn đã được xác nhận.' : 'Đã có lỗi xảy ra trong quá trình thanh toán. Vui lòng thử lại.'}
      </p>
      <Link to="/my-bookings" className="mt-6 inline-block text-primary hover:underline">Xem lịch sử đặt sân</Link>
    </div>
  )
}
