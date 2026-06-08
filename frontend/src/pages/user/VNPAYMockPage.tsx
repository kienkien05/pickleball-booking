import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ShieldCheck, Info, XCircle, CreditCard, Landmark, Loader2, QrCode, Clock } from 'lucide-react'
import api from '@/services/api'

const PAYMENT_TIMEOUT_SECONDS = 15 * 60

function getTxnStartedAt(txnRef: string) {
  const parts = txnRef.split('_')
  const timestamp = Number(parts[parts.length - 1])
  return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : Date.now()
}

function getRemainingSeconds(startedAt: number) {
  return Math.max(0, PAYMENT_TIMEOUT_SECONDS - Math.floor((Date.now() - startedAt) / 1000))
}

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export default function VNPAYMockPage() {
  const [searchParams] = useSearchParams()
  const [method, setMethod] = useState<'qr' | 'card'>('qr')
  const [step, setStep] = useState<'input' | 'otp' | 'processing'>('input')
  const [otp, setOtp] = useState('123456')
  const [errorMsg, setErrorMsg] = useState('')
  const [localIp, setLocalIp] = useState('localhost')

  // Lấy các tham số từ query string của VNPAY
  const vnp_Amount = searchParams.get('vnp_Amount') || '0'
  const vnp_TxnRef = searchParams.get('vnp_TxnRef') || ''
  const vnp_OrderInfo = searchParams.get('vnp_OrderInfo') || ''
  const vnp_ReturnUrl = searchParams.get('vnp_ReturnUrl') || 'http://localhost:5173/payment/sepay-return'
  const apiPort = import.meta.env.VITE_API_PORT || '3001'
  const paymentStartedAt = useMemo(() => getTxnStartedAt(vnp_TxnRef), [vnp_TxnRef])
  const [remainingSeconds, setRemainingSeconds] = useState(() => getRemainingSeconds(paymentStartedAt))
  const isExpired = remainingSeconds <= 0
  const countdownLabel = formatCountdown(remainingSeconds)
  const countdownPercent = Math.max(0, Math.min(100, (remainingSeconds / PAYMENT_TIMEOUT_SECONDS) * 100))

  // Định dạng số tiền từ đơn vị cents (VNPay nhân 100)
  const amountVND = parseInt(vnp_Amount, 10) / 100

  // Thông tin thẻ test mặc định
  const [cardNumber, setCardNumber] = useState('9704 1985 2619 1432 198')
  const [cardHolder, setCardHolder] = useState('NGUYEN VAN A')
  const [cardDate, setCardDate] = useState('07/15')

  const redirectPayment = (responseCode: '00' | '24', delayMs = 1500) => {
    setStep('processing')
    window.setTimeout(() => {
      const redirectParams = new URLSearchParams({
        vnp_ResponseCode: responseCode,
        vnp_TxnRef,
        vnp_Amount,
        vnp_OrderInfo,
        vnp_SecureHash: 'mock_hash',
      })

      if (responseCode === '00') {
        redirectParams.set('vnp_TransactionNo', Math.floor(Math.random() * 100000000).toString())
      }

      window.location.href = `${vnp_ReturnUrl}?${redirectParams.toString()}`
    }, delayMs)
  }

  const handlePayClick = (e: React.FormEvent) => {
    e.preventDefault()
    if (isExpired) {
      setErrorMsg('Giao dịch đã hết thời gian thanh toán')
      return
    }
    if (!cardNumber || !cardHolder || !cardDate) {
      setErrorMsg('Vui lòng điền đầy đủ thông tin thẻ')
      return
    }
    setErrorMsg('')
    setStep('otp')
  }

  const handleVerifyOtp = (e: React.FormEvent) => {
    e.preventDefault()
    if (isExpired) {
      setErrorMsg('Giao dịch đã hết thời gian thanh toán')
      return
    }
    setErrorMsg('')
    redirectPayment('00')
  }

  const handleConfirmQR = () => {
    if (isExpired) {
      setErrorMsg('Giao dịch đã hết thời gian thanh toán')
      return
    }
    redirectPayment('00')
  }

  const cancelPayment = (delayMs = 1000) => {
    redirectPayment('24', delayMs)
  }

  const handleCancelPayment = () => {
    cancelPayment()
  }

  useEffect(() => {
    const updateCountdown = () => setRemainingSeconds(getRemainingSeconds(paymentStartedAt))
    updateCountdown()
    const interval = window.setInterval(updateCountdown, 1000)
    return () => window.clearInterval(interval)
  }, [paymentStartedAt])

  useEffect(() => {
    if (remainingSeconds > 0 || step === 'processing') return
    setErrorMsg('Giao dịch đã hết thời gian thanh toán')
    cancelPayment(0)
  }, [remainingSeconds, step])

  // Lấy IP cục bộ của server và cấu hình polling kiểm tra trạng thái thanh toán từ điện thoại
  useEffect(() => {
    // 1. Lấy IP cục bộ
    api.get('/bookings/local-ip')
      .then((res: any) => {
        if (res.data?.ip) {
          setLocalIp(res.data.ip)
        }
      })
      .catch(() => { })

    // 2. Chặn nếu đã thanh toán
    const savedCourtId = sessionStorage.getItem(`paid_${vnp_TxnRef}`)
    if (savedCourtId) {
      window.location.href = `/courts/${savedCourtId}`
      return
    }

    // 3. Polling kiểm tra trạng thái thanh toán (đối với QR code)
    const parts = vnp_TxnRef.split('_')
    const bookingIds = parts.slice(0, -1).map(Number).filter(id => !isNaN(id))

    if (bookingIds.length > 0 && method === 'qr' && step === 'input') {
      const interval = setInterval(() => {
        api.get('/bookings/status-check', {
          params: { ids: bookingIds.join(',') }
        })
          .then((res: any) => {
            if (res.data?.allPaid) {
              clearInterval(interval)
              handleConfirmQR()
            }
          })
          .catch(() => { })
      }, 1500)

      return () => clearInterval(interval)
    }
  }, [vnp_TxnRef, method, step])

  // URL QR Code test (sử dụng API QR Code công khai để tạo mã QR chứa link callback thành công qua mạng LAN)
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
    `http://${localIp}:${apiPort}/api/bookings/vnpay-verify?vnp_ResponseCode=00&vnp_TxnRef=${vnp_TxnRef}&vnp_Amount=${vnp_Amount}&vnp_SecureHash=mock_hash&format=html`
  )}`

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Banner */}
      <header className="bg-white border-b border-slate-200 py-4 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl font-black italic tracking-tighter text-blue-600">
              VN<span className="text-red-500">PAY</span>
            </span>
            <div className="h-6 w-px bg-slate-200" />
            <span className="text-xs bg-amber-100 text-amber-800 font-bold px-2 py-0.5 rounded-full border border-amber-200">
              SANDBOX SIMULATION
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="size-4 text-emerald-500" />
            Kết nối bảo mật SSL
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left column: Order info */}
        <div className="space-y-4">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-4">
            <h2 className="font-bold text-slate-800 border-b pb-2">Thông tin đơn hàng</h2>
            <div>
              <p className="text-xs text-slate-400 uppercase font-semibold">Nhà cung cấp</p>
              <p className="text-sm font-bold text-slate-800">Cổng đặt lịch Pickleball Premium</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase font-semibold">Mã giao dịch</p>
              <p className="text-sm font-mono font-medium text-slate-700">{vnp_TxnRef}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase font-semibold">Số tiền thanh toán</p>
              <p className="text-xl font-extrabold text-red-600">
                {amountVND.toLocaleString('vi-VN')} VND
              </p>
            </div>
            <div className="pt-3 border-t border-slate-100">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-slate-400 uppercase font-semibold">Thời gian còn lại</p>
                <div className={`inline-flex items-center gap-1.5 font-mono text-sm font-extrabold ${isExpired ? 'text-red-600' : 'text-blue-600'}`}>
                  <Clock className="size-4" />
                  {countdownLabel}
                </div>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${isExpired ? 'bg-red-500' : 'bg-blue-600'}`}
                  style={{ width: `${countdownPercent}%` }}
                />
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                Hết thời gian, giao dịch sẽ tự hủy và đơn sẽ không được giữ thanh toán.
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-400 uppercase font-semibold">Nội dung</p>
              <p className="text-sm text-slate-600 leading-snug">{vnp_OrderInfo}</p>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex gap-3 text-xs text-blue-800">
            <Info className="size-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold mb-1">Môi trường thử nghiệm</p>
              <p className="leading-relaxed text-blue-700">
                Đây là cổng thanh toán giả lập dành cho phát triển cục bộ. Không dùng tiền thật và không yêu cầu thẻ ngân hàng thực tế.
              </p>
            </div>
          </div>
        </div>

        {/* Right column: Interactive Payment Panel */}
        <div className="md:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          {/* Header */}
          <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {method === 'qr' ? <QrCode className="size-5 text-red-400" /> : <Landmark className="size-5 text-blue-400" />}
              <div>
                <h3 className="font-bold text-sm">
                  {method === 'qr' ? 'Thanh toán quét mã VNPAY-QR' : 'Thanh toán qua thẻ ATM / Tài khoản'}
                </h3>
                <p className="text-xs text-slate-400">
                  {method === 'qr' ? 'Dùng ứng dụng ngân hàng hoặc ví điện tử để quét' : 'Ngân hàng NCB (National Citizen Bank)'}
                </p>
              </div>
            </div>
          </div>

          {/* Navigation tabs */}
          {step === 'input' && (
            <div className="flex border-b border-slate-200">
              <button
                type="button"
                onClick={() => setMethod('qr')}
                className={`flex-1 py-3.5 text-center font-bold text-sm border-b-2 transition-all ${method === 'qr'
                    ? 'border-blue-600 text-blue-600 bg-blue-50/30'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
              >
                Cổng VNPAY-QR
              </button>
              <button
                type="button"
                onClick={() => setMethod('card')}
                className={`flex-1 py-3.5 text-center font-bold text-sm border-b-2 transition-all ${method === 'card'
                    ? 'border-blue-600 text-blue-600 bg-blue-50/30'
                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                  }`}
              >
                Thẻ ATM / Tài khoản
              </button>
            </div>
          )}

          <div className="p-6 flex-1 flex flex-col justify-between">
            {step === 'processing' ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12 space-y-4">
                <Loader2 className="size-10 text-blue-600 animate-spin" />
                <h4 className="font-bold text-slate-700">Đang xử lý giao dịch...</h4>
                <p className="text-xs text-slate-400">Vui lòng không đóng cửa sổ này khi chúng tôi chuyển hướng bạn về lại website.</p>
              </div>
            ) : method === 'qr' ? (
              <div className="flex-1 flex flex-col items-center space-y-6">
                <div className="text-center space-y-1">
                  <h4 className="font-bold text-slate-800 text-base">Quét mã QR để thanh toán</h4>
                  <p className="text-xs text-slate-500">Sử dụng ứng dụng Mobile Banking (VietQR) quét mã bên dưới</p>
                </div>

                <button
                  type="button"
                  onClick={handleConfirmQR}
                  disabled={isExpired}
                  title={isExpired ? 'Giao dịch đã hết hạn' : 'Click vào mã QR để giả lập quét thành công'}
                  className={`p-4 bg-white border-2 border-slate-100 rounded-2xl shadow-inner flex flex-col items-center justify-center transition-all group relative overflow-hidden ${isExpired ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:border-blue-400'}`}
                >
                  <img src={qrCodeUrl} alt="VNPay Mock QR Code" className="size-48 object-contain transition-transform group-hover:scale-105" />
                  <div className="absolute inset-0 bg-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <span className="bg-blue-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-md">
                      Nhấp để quét (Simulate Scan)
                    </span>
                  </div>
                </button>

                <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold ${isExpired ? 'bg-red-50 text-red-600 border border-red-100' : 'bg-blue-50 text-blue-700 border border-blue-100'}`}>
                  <Clock className="size-3.5" />
                  {isExpired ? 'Giao dịch đã hết hạn' : `QR hết hạn sau ${countdownLabel}`}
                </div>


                <div className="w-full pt-4 border-t">
                  <button
                    type="button"
                    onClick={handleCancelPayment}
                    className="w-full bg-slate-50 hover:bg-red-50 hover:text-red-600 hover:border-red-200 text-slate-500 font-bold py-3 px-6 rounded-xl transition-all text-sm border border-slate-200 shadow-sm"
                  >
                    Hủy thanh toán (Thất bại)
                  </button>
                </div>
              </div>
            ) : (
              // Method: Card
              <>
                {step === 'input' && (
                  <form onSubmit={handlePayClick} className="space-y-5">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Số thẻ ATM (Test)</label>
                        <div className="relative">
                          <input
                            type="text"
                            value={cardNumber}
                            onChange={e => setCardNumber(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono text-sm"
                            placeholder="9704 1985 2619 1432 198"
                          />
                          <CreditCard className="absolute left-3.5 top-3.5 size-4 text-slate-400" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Tên chủ thẻ</label>
                          <input
                            type="text"
                            value={cardHolder}
                            onChange={e => setCardHolder(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium text-sm"
                            placeholder="NGUYEN VAN A"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Ngày phát hành</label>
                          <input
                            type="text"
                            value={cardDate}
                            onChange={e => setCardDate(e.target.value)}
                            className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-medium text-sm"
                            placeholder="MM/YY"
                          />
                        </div>
                      </div>
                    </div>

                    {errorMsg && (
                      <p className="text-xs text-red-500 flex items-center gap-1">
                        <XCircle className="size-3.5 shrink-0" /> {errorMsg}
                      </p>
                    )}

                    <div className="pt-4 border-t flex flex-col sm:flex-row gap-3">
                      <button
                        type="submit"
                        disabled={isExpired}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl transition-all shadow-sm text-sm"
                      >
                        Tiếp tục thanh toán
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelPayment}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 px-6 rounded-xl transition-all text-sm"
                      >
                        Hủy giao dịch
                      </button>
                    </div>
                  </form>
                )}

                {step === 'otp' && (
                  <form onSubmit={handleVerifyOtp} className="space-y-5">
                    <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl text-xs text-amber-800 space-y-1">
                      <p className="font-bold">Mô phỏng xác thực OTP SMS</p>
                      <p>Mã OTP đã được gửi đến số điện thoại đăng ký thẻ nội địa của bạn.</p>
                      <p className="font-semibold text-slate-700">Mã OTP test mặc định: <span className="underline font-bold text-amber-900">123456</span></p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 mb-1.5 uppercase">Nhập mã OTP</label>
                      <input
                        type="text"
                        maxLength={6}
                        value={otp}
                        onChange={e => setOtp(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-center font-mono tracking-widest text-lg font-bold"
                        placeholder="------"
                      />
                    </div>

                    {errorMsg && (
                      <p className="text-xs text-red-500 flex items-center gap-1">
                        <XCircle className="size-3.5 shrink-0" /> {errorMsg}
                      </p>
                    )}

                    <div className="pt-4 border-t flex flex-col sm:flex-row gap-3">
                      <button
                        type="submit"
                        disabled={isExpired}
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl transition-all shadow-sm text-sm"
                      >
                        Xác nhận thanh toán
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelPayment}
                        className="bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3 px-6 rounded-xl transition-all text-sm"
                      >
                        Hủy giao dịch
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
