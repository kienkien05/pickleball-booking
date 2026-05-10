import { useSearchParams, Link } from 'react-router-dom'
import { CheckCircle, XCircle, CreditCard, Banknote } from 'lucide-react'

export default function PaymentReturnPage() {
  const [searchParams] = useSearchParams()
  const status = searchParams.get('status')
  const success = status === 'success'

  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className={`size-16 mx-auto rounded-full flex items-center justify-center mb-4 ${success ? 'bg-success/10' : 'bg-destructive/10'}`}>
        {success ? <CheckCircle className="size-8 text-success" /> : <XCircle className="size-8 text-destructive" />}
      </div>
      <h1 className="text-xl font-bold">{success ? 'Đặt sân thành công!' : 'Đặt sân thất bại'}</h1>
      <p className="mt-2 text-muted-foreground">
        {success ? 'Đơn đặt sân của bạn đã được ghi nhận. Vui lòng thanh toán tại sân khi đến chơi.' : 'Đã có lỗi xảy ra trong quá trình đặt sân. Vui lòng thử lại.'}
      </p>
      {success && (
        <div className="mt-6 p-4 rounded-xl border border-border bg-card text-left text-sm space-y-2">
          <p className="font-medium flex items-center gap-2"><Banknote className="size-4 text-amber-500" /> Hình thức thanh toán</p>
          <p className="text-muted-foreground">Quý khách vui lòng thanh toán số tiền còn lại tại quầy khi đến sân (tiền mặt hoặc chuyển khoản).</p>
          <div className="pt-2 border-t border-border">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><CreditCard className="size-3" /> STK: 0123456789 - MB Bank - NGUYEN VAN A</p>
          </div>
        </div>
      )}
      <div className="mt-6 space-x-4">
        <Link to="/my-bookings" className="text-primary hover:underline">Xem lịch sử đặt sân</Link>
        <Link to="/courts" className="text-primary hover:underline">Đặt thêm sân</Link>
      </div>
    </div>
  )
}
