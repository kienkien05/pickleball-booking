/**
 * QRScannerPage.tsx
 *
 * Trang quét mã QR để check-in đơn đặt sân cho admin.
 * Chức năng chính:
 * - Quét mã QR bằng camera thiết bị (sử dụng thư viện html5-qrcode).
 * - Nhập mã đơn hàng thủ công để tra cứu.
 * - Hiển thị chi tiết đơn đặt sân sau khi quét/tra cứu thành công
 *   (tên sân, khách hàng, ngày chơi, trạng thái, dịch vụ đi kèm, tổng tiền).
 * - Thực hiện check-in cho đơn đã thanh toán (Đã thanh toán -> Đang sử dụng).
 *
 * Luồng hoạt động:
 * 1. Admin quét QR hoặc nhập mã đơn -> tìm thông tin đơn đặt sân.
 * 2. Hiển thị chi tiết đơn và cho phép check-in nếu trạng thái là "Đã thanh toán".
 * 3. Sau khi check-in, trạng thái đơn cập nhật thành "Đang sử dụng".
 */

import { useState, useRef } from 'react'
import { QrCode, Search, LogIn } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { bookingService } from '@/services'
import { Button } from '@/components/ui/Button'

/**
 * Component trang quét QR check-in.
 * Hỗ trợ cả quét camera và nhập mã thủ công để tra cứu đơn đặt sân.
 *
 * @returns Giao diện quét QR và hiển thị kết quả tra cứu đơn đặt sân.
 */
export default function QRScannerPage() {
  /** Mã đơn hàng nhập thủ công */
  const [manualCode, setManualCode] = useState('')
  /** Kết quả tra cứu đơn đặt sân (null nếu chưa tra cứu hoặc không tìm thấy) */
  const [result, setResult] = useState<any>(null)
  /** Trạng thái đang quét camera (true = camera đang bật) */
  const [scanning, setScanning] = useState(false)
  /** Tham chiếu đến instance Html5Qrcode để dừng camera khi cần */
  const scannerRef = useRef<any>(null)
  /** QueryClient để làm mới cache danh sách đơn hàng sau khi check-in */
  const queryClient = useQueryClient()

  /**
   * Mutation tra cứu đơn đặt sân bằng mã.
   * Gọi API tìm đơn theo mã (ID), lưu kết quả vào state `result`.
   */
  const checkMutation = useMutation({
    mutationFn: (code: string) => bookingService.getBookingById(code).then(r => r.data.data ?? r.data),
    onSuccess: (data) => { setResult(data); toast.success('Tìm thấy đơn đặt sân!') },
    onError: (err: any) => { toast.error(err.response?.data?.message || 'Không tìm thấy'); setResult(null) },
  })

  /**
   * Mutation thực hiện check-in cho đơn đặt sân.
   * Sau khi check-in thành công:
   * - Cập nhật trạng thái hiển thị thành "Đang sử dụng" ngay trên giao diện.
   * - Làm mới cache danh sách đơn hàng để đồng bộ với server.
   */
  const checkinMutation = useMutation({
    mutationFn: (id: string) => bookingService.checkIn(id),
    onSuccess: () => {
      toast.success('Check-in thành công!')
      // Cập nhật trạng thái ngay trên UI mà không cần gọi lại API
      setResult((prev: any) => {
        if (!prev) return prev;
        return { ...prev, trangThai: 'Đang sử dụng' };
      });
      // Làm mới cache để các trang khác cũng thấy thay đổi
      queryClient.invalidateQueries({ queryKey: ['admin', 'bookings'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Check-in thất bại'),
  })

  /**
   * Bắt đầu quét mã QR bằng camera.
   * Sử dụng thư viện html5-qrcode (import động để giảm bundle size ban đầu).
   * - Sử dụng camera sau (facingMode: 'environment').
   * - Tốc độ quét 10 fps, khung quét 250x250px.
   * - Khi quét được mã: dừng camera, trích xuất bookingId từ chuỗi JSON hoặc text,
   *   sau đó gọi API tra cứu.
   */
  const startScan = async () => {
    try {
      // Import động thư viện html5-qrcode - chỉ tải khi cần dùng
      const { Html5Qrcode } = await import('html5-qrcode')
      setScanning(true)
      const scanner = new Html5Qrcode('qr-reader')
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: 'environment' }, // Sử dụng camera sau
        { fps: 10, qrbox: { width: 250, height: 250 } }, // Cấu hình tốc độ và kích thước khung quét
        (decodedText: string) => {
          // Callback khi quét thành công
          scanner.stop()
          setScanning(false)
          let code = decodedText
          // Thử parse chuỗi quét được thành JSON để lấy bookingId
          try { const parsed = JSON.parse(decodedText); code = parsed.bookingId || parsed.id || decodedText } catch (_) {}
          checkMutation.mutate(code)
        },
        () => {} // Callback lỗi quét - bỏ qua
      )
    } catch (err) {
      setScanning(false)
      toast.error('Không thể truy cập camera')
    }
  }

  /**
   * Dừng quét camera.
   * Gọi phương thức stop() của Html5Qrcode và reset trạng thái.
   */
  const stopScan = () => {
    if (scannerRef.current) {
      scannerRef.current.stop()
      scannerRef.current = null
    }
    setScanning(false)
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h1 className="text-2xl font-bold">Quét QR Check-in</h1>

      {/* Khu vực quét camera */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold mb-4">Quét mã QR</h2>
        {/* Div chứa viewfinder camera - id="qr-reader" được thư viện html5-qrcode sử dụng */}
        <div id="qr-reader" className="mx-auto max-w-sm" />
        {!scanning ? (
          <Button onClick={startScan} className="w-full"><QrCode className="size-4 mr-2" />Bắt đầu quét</Button>
        ) : (
          <Button variant="outline" onClick={stopScan} className="w-full">Dừng quét</Button>
        )}
      </div>

      {/* Khu vực nhập mã đơn hàng thủ công */}
      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold mb-4">Nhập mã đơn hàng</h2>
        <div className="flex gap-3">
          <input type="text" value={manualCode} onChange={e => setManualCode(e.target.value)}
            placeholder="Nhập mã đơn..." className="flex-1 h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" />
          <Button onClick={() => manualCode && checkMutation.mutate(manualCode)} loading={checkMutation.isPending}>
            <Search className="size-4 mr-2" />Tra cứu
          </Button>
        </div>
      </div>

      {/* Khu vực hiển thị kết quả tra cứu */}
      {result && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold mb-4">Kết quả</h2>
          <div className="space-y-2 text-sm">
            {/* Thông tin sân - hiển thị tên sân hoặc ID nếu không có tên */}
            <p><strong>Sân:</strong> {result.tenSan || `Sân #${result.sanId}`}</p>
            {/* Thông tin khách hàng - hiển thị tên hoặc ID */}
            <p><strong>Khách:</strong> {result.full_name || `KH #${result.nguoiDungId}`}</p>
            {/* Ngày chơi - định dạng tiếng Việt */}
            <p><strong>Ngày:</strong> {result.ngayChoi ? new Date(result.ngayChoi).toLocaleDateString('vi-VN') : '--'}</p>
            {/* Trạng thái đơn với màu sắc tương ứng */}
            <p><strong>Trạng thái:</strong> <span className={
              result.trangThai === 'Đã thanh toán' ? 'text-blue-600 font-medium' :
              result.trangThai === 'Đã cọc' ? 'text-purple-600 font-medium' :
              result.trangThai === 'Đã đặt' ? 'text-amber-600 font-medium' :
              result.trangThai === 'Đang sử dụng' ? 'text-success font-medium' :
              result.trangThai === 'Hoàn thành' ? 'text-muted-foreground' : 'text-destructive'
            }>{result.trangThai}</span></p>

            {/* Hiển thị danh sách dịch vụ đi kèm nếu có */}
            {result.dichVu && result.dichVu.length > 0 && (
              <div className="mt-4 p-3 bg-muted/30 rounded-lg space-y-1">
                <p className="font-semibold text-xs uppercase text-muted-foreground mb-1">Dịch vụ đi kèm:</p>
                {result.dichVu.map((sv: any) => (
                  <div key={sv.id} className="flex justify-between text-xs">
                    <span>{sv.tenDichVu} x{sv.soLuong}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Chi tiết thanh toán: giá gốc, voucher giảm, tổng tiền */}
            <div className="mt-4 pt-2 border-t border-dashed border-border space-y-1">
              {result.giaGoc && (
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Giá trị đơn:</span>
                  <span>{Number(result.giaGoc).toLocaleString('vi-VN')}đ</span>
                </div>
              )}
              {result.tienGiam > 0 && (
                <div className="flex justify-between text-xs text-success">
                  <span>Voucher giảm ({result.maGiamGia}):</span>
                  <span>-{Number(result.tienGiam).toLocaleString('vi-VN')}đ</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg text-primary pt-1">
                <span>Tổng tiền:</span>
                <span>{Number(result.tongTien).toLocaleString('vi-VN')}đ</span>
              </div>
            </div>
          </div>
          {/* Nút check-in - hiển thị khi đơn còn hợp lệ trước giờ chơi */}
          {result.trangThai === 'Đã thanh toán' && (
            <Button className="w-full mt-4" onClick={() => checkinMutation.mutate(result.id)} loading={checkinMutation.isPending}>
              <LogIn className="size-4 mr-2" />Check-in ngay
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
