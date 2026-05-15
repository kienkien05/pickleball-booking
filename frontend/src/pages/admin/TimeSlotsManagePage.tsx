/**
 * TimeSlotsManagePage.tsx
 *
 * Trang quản lý khung giờ và giá theo từng sân dành cho admin.
 * Chức năng chính:
 * - Chọn một sân để xem và quản lý các khung giờ của sân đó.
 * - Khi chưa chọn sân: hiển thị danh sách tất cả các sân kèm số lượng khung giờ.
 * - Khi đã chọn sân: hiển thị danh sách khung giờ của sân đó (giờ bắt đầu, giờ kết thúc, mức giá).
 * - Thêm mới khung giờ cho sân đã chọn.
 * - Chỉnh sửa khung giờ hiện có.
 * - Xóa khung giờ (có modal xác nhận).
 *
 * Mỗi khung giờ xác định:
 * - Thời gian bắt đầu/kết thúc (VD: 06:00 - 07:30).
 * - Mức giá cho khung giờ đó (VNĐ) - cho phép định giá linh hoạt theo giờ cao điểm/thấp điểm.
 *
 * Sử dụng React Query để cache dữ liệu theo từng sân (query key bao gồm selectedCourt).
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { courtService, timeSlotService } from '@/services'
import { Button } from '@/components/ui/Button'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice } from '@/lib/utils'

/**
 * Component trang quản lý khung giờ và giá.
 * Admin chọn sân -> xem/sửa/thêm/xóa khung giờ của sân đó.
 *
 * @returns Giao diện quản lý khung giờ gồm: dropdown chọn sân, bảng khung giờ, modal form.
 */
export default function TimeSlotsManagePage() {
  /** ID của sân đang được chọn để quản lý khung giờ (rỗng = chưa chọn sân) */
  const [selectedCourt, setSelectedCourt] = useState<string>('')
  /** Khung giờ đang được chỉnh sửa (null = chế độ thêm mới) */
  const [editSlot, setEditSlot] = useState<any>(null)
  /** Trạng thái hiển thị modal form thêm/sửa khung giờ */
  const [showForm, setShowForm] = useState(false)
  /**
   * Dữ liệu form khung giờ.
   * Mặc định: 06:00 - 07:30, giá 150.000 VNĐ.
   */
  const [form, setForm] = useState({ gioBatDau: '06:00', gioKetThuc: '07:30', mucGia: '150000' })
  /** ID khung giờ được chọn để xóa (null = không có modal xóa) */
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  /**
   * Lấy danh sách tất cả sân để hiển thị trong dropdown chọn.
   * Giới hạn 100 sân, dùng cho admin.
   */
  const { data: courts } = useQuery({
    queryKey: ['admin', 'courts'],
    queryFn: () => courtService.getCourts({ limit: 100 }).then(r => r.data.data ?? r.data ?? []),
  })
  /** Chuẩn hóa thành mảng sân */
  const courtList = Array.isArray(courts) ? courts : courts?.courts ?? []

  /**
   * Lấy danh sách khung giờ của sân đã chọn.
   * Query chỉ được kích hoạt (enabled) khi đã chọn sân (selectedCourt có giá trị).
   * Query key bao gồm selectedCourt để cache riêng cho từng sân.
   */
  const { data: slots, isLoading } = useQuery({
    queryKey: ['timeslots', 'all', selectedCourt],
    queryFn: () => timeSlotService.getByCourt(selectedCourt).then(r => r.data.data ?? r.data ?? []),
    enabled: !!selectedCourt, // Chỉ gọi API khi đã chọn sân
  })
  /** Chuẩn hóa thành mảng khung giờ */
  const slotList = Array.isArray(slots) ? slots : slots?.slots ?? []

  /**
   * Mutation lưu (thêm mới hoặc cập nhật) khung giờ.
   * - Nếu `editSlot` có giá trị -> gọi API cập nhật khung giờ.
   * - Nếu `editSlot` null -> gọi API tạo khung giờ mới.
   * Cả hai đều cần selectedCourt (ID sân).
   */
  const saveMutation = useMutation({
    mutationFn: (data: any) => editSlot
      ? timeSlotService.update(selectedCourt, editSlot.id, data)
      : timeSlotService.create(selectedCourt, data),
    onSuccess: () => {
      toast.success(editSlot ? 'Cập nhật thành công!' : 'Thêm khung giờ thành công!')
      // Làm mới cache khung giờ của sân đang chọn
      queryClient.invalidateQueries({ queryKey: ['timeslots', 'all', selectedCourt] })
      setShowForm(false); setEditSlot(null)
      // Reset form về mặc định
      setForm({ gioBatDau: '06:00', gioKetThuc: '07:30', mucGia: '150000' })
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Thao tác thất bại'),
  })

  /**
   * Mutation xóa khung giờ.
   * Cần selectedCourt và ID khung giờ cần xóa.
   */
  const deleteMutation = useMutation({
    mutationFn: (id: string) => timeSlotService.delete(selectedCourt, id),
    onSuccess: () => { toast.success('Xóa thành công!'); queryClient.invalidateQueries({ queryKey: ['timeslots', 'all', selectedCourt] }); setDeleteId(null) },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Không thể xóa'),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quản lý khung giờ & giá</h1>
      </div>

      {/* Dropdown chọn sân để xem khung giờ */}
      <div>
        <label className="block text-sm font-medium mb-2">Chọn sân</label>
        <select value={selectedCourt} onChange={e => setSelectedCourt(e.target.value)}
          className="w-full sm:w-64 h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none">
          <option value="">-- Chọn sân --</option>
          {courtList.map((c: any) => <option key={c.id} value={c.id}>{c.tenSan}</option>)}
        </select>
      </div>

      {/* Khi chưa chọn sân: hiển thị danh sách tất cả sân với số khung giờ */}
      {!selectedCourt && courtList.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Sân</th>
                <th className="text-left px-4 py-3 font-medium">Trạng thái</th>
                <th className="text-right px-4 py-3 font-medium">Số khung giờ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {courtList.map((c: any) => (
                // Click vào tên sân để chọn sân đó và xem chi tiết khung giờ
                <tr key={c.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedCourt(String(c.id))}>
                  <td className="px-4 py-3 font-medium">{c.tenSan}</td>
                  <td className="px-4 py-3">{c.trangThai || 'Sẵn sàng'}</td>
                  <td className="px-4 py-3 text-right">{c.slotCount ?? 0} khung giờ</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Khi đã chọn sân: hiển thị bảng khung giờ và nút thêm mới */}
      {selectedCourt && (
        <>
          <div className="flex justify-end">
            <Button onClick={() => { setEditSlot(null); setForm({ gioBatDau: '06:00', gioKetThuc: '07:30', mucGia: '150000' }); setShowForm(true) }}>
              <Plus className="size-4 mr-2" />Thêm khung giờ
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : (
            /* Bảng danh sách khung giờ của sân đã chọn */
            <div className="rounded-xl border border-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Giờ bắt đầu</th>
                    <th className="text-left px-4 py-3 font-medium">Giờ kết thúc</th>
                    <th className="text-left px-4 py-3 font-medium">Mức giá</th>
                    <th className="text-right px-4 py-3 font-medium">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {slotList.map((slot: any) => (
                    <tr key={slot.id} className="hover:bg-muted/30">
                      {/* Hiển thị giờ dạng HH:mm (cắt 5 ký tự đầu) */}
                      <td className="px-4 py-3">{slot.gioBatDau?.substring(0, 5)}</td>
                      <td className="px-4 py-3">{slot.gioKetThuc?.substring(0, 5)}</td>
                      <td className="px-4 py-3 font-medium">{formatPrice(Number(slot.mucGia || 0))}</td>
                      <td className="px-4 py-3 text-right">
                        {/* Nút sửa - điền sẵn dữ liệu khung giờ vào form */}
                        <Button variant="ghost" size="icon" onClick={() => { setEditSlot(slot); setForm({ gioBatDau: slot.gioBatDau?.substring(0, 5), gioKetThuc: slot.gioKetThuc?.substring(0, 5), mucGia: String(slot.mucGia) }); setShowForm(true) }}>
                          <Pencil className="size-4" /></Button>
                        {/* Nút xóa - mở modal xác nhận */}
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(slot.id)}><Trash2 className="size-4 text-destructive" /></Button>
                      </td>
                    </tr>
                  ))}
                  {/* Trạng thái rỗng */}
                  {slotList.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">Chưa có khung giờ nào</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modal form thêm/sửa khung giờ */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editSlot ? 'Sửa khung giờ' : 'Thêm khung giờ'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Giờ bắt đầu</label>
              {/* Input type="time" cho phép chọn giờ dạng HH:mm */}
              <input type="time" value={form.gioBatDau} onChange={e => setForm(prev => ({ ...prev, gioBatDau: e.target.value }))}
                className="w-full h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Giờ kết thúc</label>
              <input type="time" value={form.gioKetThuc} onChange={e => setForm(prev => ({ ...prev, gioKetThuc: e.target.value }))}
                className="w-full h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Mức giá (VNĐ)</label>
            <input type="number" value={form.mucGia} onChange={e => setForm(prev => ({ ...prev, mucGia: e.target.value }))}
              className="w-full h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" />
          </div>
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={() => setShowForm(false)}>Hủy</Button>
          <Button onClick={() => saveMutation.mutate(form)} loading={saveMutation.isPending}>Lưu</Button>
        </ModalFooter>
      </Modal>

      {/* Modal xác nhận xóa khung giờ */}
      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Xác nhận xóa" size="sm">
        <p className="text-sm">Xóa khung giờ này?</p>
        <ModalFooter>
          <Button variant="outline" onClick={() => setDeleteId(null)}>Hủy</Button>
          <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} loading={deleteMutation.isPending}>Xóa</Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
