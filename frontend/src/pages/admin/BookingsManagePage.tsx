/**
 * Trang Quản Lý Đơn Đặt Sân (BookingsManagePage)
 * ==============================================
 * @purpose Trang dành cho admin để quản lý tất cả đơn đặt sân trong hệ thống:
 *   - Xem danh sách đơn đặt sân với bộ lọc (trạng thái, ngày, tìm kiếm)
 *   - Xem chi tiết từng đơn (modal)
 *   - Thực hiện các thao tác: Check-in, Check-out, Đánh dấu vắng mặt (No-show)
 *
 * @route /admin/bookings
 * @access Admin (yêu cầu quyền admin)
 *
 * @businessLogic
 *   - Bộ lọc trạng thái: Tất cả, Đã đặt, Đã cọc, Đã thanh toán, Đang dùng, Hoàn thành, Đã hủy
 *   - Tìm kiếm: theo tên sân, tên khách hàng, hoặc mã đơn
 *   - Lọc theo ngày cụ thể
 *   - Các thao tác khả dụng phụ thuộc vào trạng thái hiện tại của đơn:
 *     + "Đã thanh toán": có thể Check-in hoặc đánh dấu vắng mặt
 *     + "Đã đặt" / "Đã cọc": chỉ đánh dấu vắng mặt/hủy theo policy, không được Check-in
 *     + "Đang sử dụng": có thể Check-out
 *     + Các trạng thái khác: không có thao tác nào
 *   - Mỗi thao tác cần xác nhận trước khi thực hiện
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Search, LogIn, LogOut, UserX, MoreHorizontal, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import { bookingService } from '@/services'
import { Button } from '@/components/ui/Button'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice, formatDate, formatTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

/**
 * Định nghĩa các tab lọc theo trạng thái đơn
 * @key '' là "Tất cả" (không lọc)
 * @key cụ thể tương ứng với giá trị trạng thái trong database
 */
const statusTabs = [
  { key: '', label: 'Tất cả' },
  { key: 'Đã cọc', label: 'Đã cọc' },
  { key: 'Đã thanh toán', label: 'Đã thanh toán' },
  { key: 'Đang sử dụng', label: 'Đang dùng' },
  { key: 'Hoàn thành', label: 'Hoàn thành' },
  { key: 'Đã hủy', label: 'Đã hủy' },
]

/**
 * Trang quản lý đơn đặt sân cho admin
 * @description Component quản lý toàn bộ đơn đặt sân với đầy đủ chức năng:
 *   lọc, tìm kiếm, xem chi tiết, check-in/check-out, đánh dấu vắng mặt
 * @returns Giao diện bảng quản lý đơn đặt sân kèm các modal thao tác
 */
export default function BookingsManagePage() {
  // --- Bộ lọc ---
  const [statusFilter, setStatusFilter] = useState('')    // Lọc theo trạng thái đơn ('' = tất cả)
  const [dateFilter, setDateFilter] = useState('')         // Lọc theo ngày cụ thể (YYYY-MM-DD)
  const [search, setSearch] = useState('')                  // Từ khóa tìm kiếm (tên sân, KH, mã đơn)

  // --- Quản lý modal ---
  const [selectedBooking, setSelectedBooking] = useState<any>(null) // Đơn đang được chọn để xem chi tiết / thao tác
  const [showActions, setShowActions] = useState(false)             // Hiển thị modal chọn thao tác (check-in/check-out/noshow)
  const [showDetail, setShowDetail] = useState(false)               // Hiển thị modal chi tiết đơn
  const [actionConfirm, setActionConfirm] = useState<'checkin' | 'checkout' | 'noshow' | null>(null) // Loại thao tác cần xác nhận
  const [selectedId, setSelectedId] = useState<string | null>(null) // ID của đơn đang xem chi tiết (dùng để fetch detail)

  const queryClient = useQueryClient()

  /**
   * Truy vấn lấy danh sách đơn đặt sân theo bộ lọc
   * @description Tự động re-fetch khi statusFilter hoặc dateFilter thay đổi
   *   Gửi params { status, date, limit: 100 } lên API
   */
  const { data: bookingsData, isLoading } = useQuery({
    queryKey: ['admin', 'bookings', statusFilter, dateFilter],
    queryFn: () => bookingService.getAllBookings({ status: statusFilter || undefined, date: dateFilter, limit: 100 })
      .then(r => r.data.data ?? r.data ?? []),
  })

  /**
   * Truy vấn lấy chi tiết đầy đủ của một đơn (bao gồm dịch vụ, thanh toán)
   * @enabled Chỉ chạy khi có selectedId và showDetail = true (modal chi tiết đang mở)
   */
  const { data: fullDetail, isLoading: detailLoading } = useQuery({
    queryKey: ['admin', 'booking-detail', selectedId],
    queryFn: () => bookingService.getBookingById(selectedId!).then(r => r.data.data),
    enabled: !!selectedId && showDetail
  })

  // Chuẩn hóa dữ liệu danh sách: có thể là array trực tiếp hoặc nằm trong { bookings: [...] }
  const bookings = Array.isArray(bookingsData) ? bookingsData : bookingsData?.bookings ?? []

  /**
   * Mutation thực hiện thao tác trên đơn (check-in, check-out, noshow)
   * @description Dựa vào type để gọi API tương ứng:
   *   - 'checkin': bookingService.checkIn(id)
   *   - 'checkout': bookingService.checkOut(id)
   *   - 'noshow': bookingService.markNoShow(id)
   * @onSuccess Toast thành công, làm mới danh sách, đóng tất cả modal
   * @onError Toast thông báo lỗi từ server
   */
  const actionMutation = useMutation({
    mutationFn: ({ id, type }: { id: string; type: string }) => {
      if (type === 'checkin') return bookingService.checkIn(id)
      if (type === 'checkout') return bookingService.checkOut(id)
      return bookingService.markNoShow(id)
    },
    onSuccess: (_, { type }) => {
      toast.success(type === 'checkin' ? 'Check-in thành công!' : type === 'checkout' ? 'Check-out thành công!' : 'Đã hủy vắng mặt!')
      queryClient.invalidateQueries({ queryKey: ['admin', 'bookings'] })
      // Reset tất cả trạng thái modal
      setShowActions(false); setActionConfirm(null); setSelectedBooking(null)
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Thao tác thất bại'),
  })

  /**
   * Lọc danh sách đơn theo từ khóa tìm kiếm (client-side filtering)
   * @description Tìm kiếm không phân biệt hoa/thường theo:
   *   - Tên sân (tenSan)
   *   - Tên khách hàng (full_name)
   *   - Mã đơn (id)
   * @returns Danh sách đã lọc, hoặc toàn bộ nếu search rỗng
   */
  const filtered = search ? bookings.filter((b: any) =>
    b.tenSan?.toLowerCase().includes(search.toLowerCase()) ||
    b.full_name?.toLowerCase().includes(search.toLowerCase()) ||
    String(b.id).includes(search)
  ) : bookings

  /**
   * Xác định các thao tác khả dụng cho một đơn dựa trên trạng thái hiện tại
   * @param b - Đối tượng đơn đặt sân
   * @returns Mảng các thao tác { type, label, icon, variant }
   * @logic
   *   - "Đã thanh toán": Check-in + Vắng mặt
   *   - "Đã đặt" / "Đã cọc": chỉ Vắng mặt
   *   - "Đang sử dụng": Check-out
   *   - Các trạng thái khác: không có thao tác nào (mảng rỗng)
   */
  const getActions = (b: any) => {
    const actions: { type: 'checkin' | 'checkout' | 'noshow'; label: string; icon: any; variant: any }[] = []
    if (b.trangThai === 'Đã thanh toán') {
      // Chỉ đơn đã thanh toán mới được check-in
      actions.push({ type: 'checkin', label: 'Check-in', icon: LogIn, variant: 'success' })
      actions.push({ type: 'noshow', label: 'Vắng mặt', icon: UserX, variant: 'destructive' })
    } else if (b.trangThai === 'Đã cọc' || b.trangThai === 'Đã đặt') {
      actions.push({ type: 'noshow', label: 'Vắng mặt', icon: UserX, variant: 'destructive' })
    } else if (b.trangThai === 'Đang sử dụng') {
      // Đơn đang sử dụng: có thể check-out (kết thúc phiên chơi)
      actions.push({ type: 'checkout', label: 'Check-out', icon: LogOut, variant: 'default' })
    }
    return actions
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Quản lý đơn đặt sân</h1>

      {/* Thanh tìm kiếm + lọc ngày */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Ô tìm kiếm: theo tên sân, tên KH, mã đơn */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo tên sân, khách hàng..." className="w-full h-11 pl-10 pr-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" />
        </div>
        {/* Bộ lọc ngày: nút "Tất cả các ngày" + input date picker */}
        <div className="flex gap-2">
          <Button variant={dateFilter === '' ? 'default' : 'outline'} onClick={() => setDateFilter('')} className="h-11 px-4">
            Tất cả các ngày
          </Button>
          <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
            className="h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" />
        </div>
      </div>

      {/* Tabs lọc theo trạng thái (có thể scroll ngang trên mobile) */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
        {statusTabs.map(tab => (
          <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
            className={`shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${statusFilter === tab.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Bảng danh sách đơn đặt sân hoặc skeleton loading */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            {/* Header bảng */}
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Khách hàng</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Sân</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Thời gian</th>
                <th className="text-left px-4 py-3 font-medium">Tổng tiền</th>
                <th className="text-left px-4 py-3 font-medium">Hình thức</th>
                <th className="text-left px-4 py-3 font-medium">Trạng thái</th>
                <th className="text-center px-4 py-3 font-medium w-16">Thao tác</th>
              </tr>
            </thead>
            {/* Body bảng: danh sách đơn đã lọc */}
            <tbody className="divide-y divide-border">
              {filtered.map((booking: any) => {
                // Lấy danh sách thao tác khả dụng cho đơn này
                const actions = getActions(booking)
                return (
                  // Click vào hàng để mở modal chi tiết
                  <tr key={booking.id} className="hover:bg-muted/30 cursor-pointer"
                    onClick={() => { setSelectedId(String(booking.id)); setSelectedBooking(booking); setShowDetail(true) }}>
                    {/* Tên khách hàng (hoặc ID nếu không có tên) */}
                    <td className="px-4 py-3 font-medium">{booking.full_name || `KH #${booking.nguoiDungId}`}</td>
                    {/* Tên sân - ẩn trên mobile */}
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{booking.tenSan || `Sân #${booking.sanId}`}</td>
                    {/* Thời gian chơi - ẩn trên mobile */}
                    <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">
                      {booking.ngayChoi ? formatDate(booking.ngayChoi) : ''} {booking.gioBatDau ? formatTime(booking.gioBatDau) + '-' + formatTime(booking.gioKetThuc) : ''}
                    </td>
                    {/* Tổng tiền */}
                    <td className="px-4 py-3">{formatPrice(Number(booking.tongTien || 0))}</td>
                    {/* Hình thức thanh toán */}
                    <td className="px-4 py-3 text-xs text-muted-foreground">{booking.loaiThanhToan || 'N/A'}</td>
                    {/* Trạng thái với badge màu tương ứng:
                        - Đã đặt: vàng/cam
                        - Đã cọc: tím
                        - Đã thanh toán: xanh dương
                        - Đang sử dụng: xanh lá
                        - Hoàn thành: xám
                        - Đã hủy/vắng mặt: đỏ */}
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${booking.trangThai === 'Đã đặt' ? 'bg-amber-500/10 text-amber-600' :
                          booking.trangThai === 'Đã cọc' ? 'bg-purple-500/10 text-purple-600' :
                            booking.trangThai === 'Đã thanh toán' ? 'bg-blue-500/10 text-blue-600' :
                              booking.trangThai === 'Đang sử dụng' ? 'bg-success/10 text-success' :
                                booking.trangThai === 'Hoàn thành' ? 'bg-muted text-muted-foreground' :
                                  'bg-destructive/10 text-destructive'}`}>
                        {booking.trangThai}
                      </span>
                    </td>
                    {/* Cột thao tác: nút "..." để mở menu thao tác (chỉ hiện nếu có thao tác khả dụng)
                        stopPropagation để click vào nút không mở modal chi tiết */}
                    <td className="px-4 py-3 text-center" onClick={e => e.stopPropagation()}>
                      {actions.length > 0 && (
                        <Button variant="ghost" size="icon"
                          onClick={() => { setSelectedBooking(booking); setShowActions(true) }}>
                          <MoreHorizontal className="size-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {/* Hàng trống khi không có kết quả */}
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">Không có đơn đặt sân nào</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Chi Tiết Đơn
          Hiển thị khi showDetail = true và selectedBooking tồn tại */}
      <Modal isOpen={showDetail && !!selectedBooking} onClose={() => setShowDetail(false)} title={`Chi tiết đơn #${selectedBooking?.id}`}>
        {selectedBooking && (
          <div className="space-y-3 text-sm">
            {/* Grid 2 cột hiển thị thông tin cơ bản */}
            <div className="grid grid-cols-2 gap-3">
              <div><p className="text-muted-foreground">Khách hàng</p><p className="font-medium">{selectedBooking.full_name}</p></div>
              <div><p className="text-muted-foreground">Email</p><p className="font-medium">{selectedBooking.email || '--'}</p></div>
              <div><p className="text-muted-foreground">Sân</p><p className="font-medium">{selectedBooking.tenSan}</p></div>
              <div><p className="text-muted-foreground">Ngày</p><p className="font-medium">{selectedBooking.ngayChoi ? formatDate(selectedBooking.ngayChoi) : '--'}</p></div>
              <div><p className="text-muted-foreground">Khung giờ</p><p className="font-medium">{selectedBooking.gioBatDau ? formatTime(selectedBooking.gioBatDau) + ' - ' + formatTime(selectedBooking.gioKetThuc) : '--'}</p></div>
              <div><p className="text-muted-foreground">Trạng thái</p><p className="font-medium">{selectedBooking.trangThai}</p></div>
            </div>

            {/* Khu vực dịch vụ & thanh toán */}
            <div className="border-t border-border pt-3 space-y-2">
              <p className="font-semibold flex items-center gap-2">Dịch vụ & Thanh toán</p>
              {detailLoading ? (
                // Loading skeleton cho phần dịch vụ
                <Skeleton className="h-20 w-full" />
              ) : fullDetail?.dichVu && fullDetail.dichVu.length > 0 ? (
                // Danh sách dịch vụ đi kèm
                <div className="bg-muted/30 rounded-lg p-3 space-y-1">
                  {fullDetail.dichVu.map((sv: any) => (
                    <div key={sv.id} className="flex justify-between text-xs">
                      <span>{sv.tenDichVu} x{sv.soLuong}</span>
                      <span>{formatPrice(Number(sv.tongTien))}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground italic">Không kèm dịch vụ</p>
              )}

              {/* Chi tiết thanh toán: giá gốc, giảm giá, tổng thanh toán */}
              <div className="space-y-1 pt-2 border-t border-dashed border-border text-xs">
                {/* Dòng giá trị đơn hàng (tạm tính) */}
                {(fullDetail?.giaGoc || selectedBooking.giaGoc) && (
                  <div className="flex justify-between">
                    <span>Giá trị đơn hàng:</span>
                    <span>{formatPrice(Number(fullDetail?.giaGoc || selectedBooking.giaGoc))}</span>
                  </div>
                )}
                {/* Dòng giảm giá từ voucher (chỉ hiển thị nếu > 0) */}
                {(fullDetail?.tienGiam || selectedBooking.tienGiam) > 0 && (
                  <div className="flex justify-between text-success">
                    <span>Giảm giá (Voucher {selectedBooking.maGiamGia}):</span>
                    <span>-{formatPrice(Number(fullDetail?.tienGiam || selectedBooking.tienGiam))}</span>
                  </div>
                )}
                {/* Dòng tổng thanh toán (in đậm, màu primary) */}
                <div className="flex justify-between font-bold text-sm pt-1 text-primary">
                  <span>Tổng thanh toán:</span>
                  <span>{formatPrice(Number(selectedBooking.tongTien))}</span>
                </div>
              </div>
            </div>

            {/* Ghi chú của đơn (nếu có) */}
            {selectedBooking.ghiChu && (
              <div className="mt-3 p-2 rounded bg-amber-500/5 border border-amber-500/20 text-xs">
                <p className="text-amber-600 font-medium">Ghi chú:</p>
                <p className="text-muted-foreground">{selectedBooking.ghiChu}</p>
              </div>
            )}
          </div>
        )}
        <ModalFooter>
          <Button variant="outline" onClick={() => setShowDetail(false)}>Đóng</Button>
        </ModalFooter>
      </Modal>

      {/* Modal Chọn Thao Tác (Check-in / Check-out / Vắng mặt)
          Hiển thị các nút thao tác khả dụng cho đơn đã chọn */}
      <Modal isOpen={showActions && !!selectedBooking} onClose={() => setShowActions(false)}
        title={selectedBooking ? `Thao tác với đơn #${selectedBooking.id}` : 'Thao tác'} size="sm">
        {selectedBooking && (
          <div className="space-y-2">
            {getActions(selectedBooking).map((action) => (
              // Mỗi nút thao tác mở modal xác nhận tương ứng
              <Button key={action.type} variant={action.variant} className="w-full justify-start"
                onClick={() => setActionConfirm(action.type)}>
                <action.icon className="size-4 mr-2" />{action.label}
              </Button>
            ))}
          </div>
        )}
        <ModalFooter>
          <Button variant="outline" onClick={() => setShowActions(false)}>Đóng</Button>
        </ModalFooter>
      </Modal>

      {/* Modal Xác Nhận Thao Tác
          Yêu cầu admin xác nhận trước khi thực hiện check-in/check-out/noshow */}
      <Modal isOpen={!!actionConfirm} onClose={() => setActionConfirm(null)}
        title={actionConfirm === 'checkin' ? 'Xác nhận Check-in' : actionConfirm === 'checkout' ? 'Xác nhận Check-out' : 'Hủy vắng mặt'}
        size="sm">
        <p className="text-sm">{actionConfirm === 'noshow' ? 'Khách không đến? Đơn sẽ bị hủy.' : 'Xác nhận thao tác này?'}</p>
        <ModalFooter>
          <Button variant="outline" onClick={() => setActionConfirm(null)}>Hủy</Button>
          <Button variant={actionConfirm === 'noshow' ? 'destructive' : 'default'}
            onClick={() => selectedBooking && actionConfirm && actionMutation.mutate({ id: selectedBooking.id, type: actionConfirm })}
            loading={actionMutation.isPending}>Xác nhận</Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
