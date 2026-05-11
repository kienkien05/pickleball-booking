import { useState, useRef } from 'react'
import { QrCode, Search, LogIn } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { bookingService } from '@/services'
import { Button } from '@/components/ui/Button'

export default function QRScannerPage() {
  const [manualCode, setManualCode] = useState('')
  const [result, setResult] = useState<any>(null)
  const [scanning, setScanning] = useState(false)
  const scannerRef = useRef<any>(null)
  const queryClient = useQueryClient()

  const checkMutation = useMutation({
    mutationFn: (code: string) => bookingService.getBookingById(code).then(r => r.data.data ?? r.data),
    onSuccess: (data) => { setResult(data); toast.success('Tìm thấy đơn đặt sân!') },
    onError: (err: any) => { toast.error(err.response?.data?.message || 'Không tìm thấy'); setResult(null) },
  })

  const checkinMutation = useMutation({
    mutationFn: (id: string) => bookingService.checkIn(id),
    onSuccess: () => {
      toast.success('Check-in thành công!')
      setResult((prev: any) => {
        if (!prev) return prev;
        return { ...prev, trangThai: 'Đang sử dụng' };
      });
      queryClient.invalidateQueries({ queryKey: ['admin', 'bookings'] });
      queryClient.invalidateQueries({ queryKey: ['bookings'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Check-in thất bại'),
  })

  const startScan = async () => {
    try {
      const { Html5Qrcode } = await import('html5-qrcode')
      setScanning(true)
      const scanner = new Html5Qrcode('qr-reader')
      scannerRef.current = scanner
      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText: string) => {
          scanner.stop()
          setScanning(false)
          let code = decodedText
          try { const parsed = JSON.parse(decodedText); code = parsed.bookingId || parsed.id || decodedText } catch (_) {}
          checkMutation.mutate(code)
        },
        () => {}
      )
    } catch (err) {
      setScanning(false)
      toast.error('Không thể truy cập camera')
    }
  }

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

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-semibold mb-4">Quét mã QR</h2>
        <div id="qr-reader" className="mx-auto max-w-sm" />
        {!scanning ? (
          <Button onClick={startScan} className="w-full"><QrCode className="size-4 mr-2" />Bắt đầu quét</Button>
        ) : (
          <Button variant="outline" onClick={stopScan} className="w-full">Dừng quét</Button>
        )}
      </div>

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

      {result && (
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="font-semibold mb-4">Kết quả</h2>
          <div className="space-y-2 text-sm">
            <p><strong>Sân:</strong> {result.tenSan || `Sân #${result.sanId}`}</p>
            <p><strong>Khách:</strong> {result.full_name || `KH #${result.nguoiDungId}`}</p>
            <p><strong>Ngày:</strong> {result.ngayChoi ? new Date(result.ngayChoi).toLocaleDateString('vi-VN') : '--'}</p>
            <p><strong>Trạng thái:</strong> <span className={
              result.trangThai === 'Đã thanh toán' ? 'text-blue-600 font-medium' :
              result.trangThai === 'Đang sử dụng' ? 'text-success font-medium' :
              result.trangThai === 'Hoàn thành' ? 'text-muted-foreground' : 'text-destructive'
            }>{result.trangThai}</span></p>

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
