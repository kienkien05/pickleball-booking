/**
 * CourtsManagePage.tsx
 *
 * Trang quản lý sân pickleball dành cho admin.
 * Chức năng chính:
 * - Hiển thị danh sách tất cả các sân pickleball trong hệ thống (dạng bảng).
 * - Thêm mới sân (tên, mô tả, URL hình ảnh, trạng thái).
 * - Chỉnh sửa thông tin sân hiện có.
 * - Xóa sân (có modal xác nhận trước khi thực hiện).
 * - Các trạng thái sân: "Sẵn sàng" (có thể đặt), "Bảo trì" (đang sửa chữa), "Ẩn" (không hiển thị cho khách).
 *
 * Sử dụng React Query để quản lý việc gọi API và cache dữ liệu, tự động
 * làm mới danh sách sau mỗi thao tác thêm/sửa/xóa thành công.
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, Pencil, Trash2, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { courtService } from '@/services'
import { Button } from '@/components/ui/Button'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'

type CourtForm = {
  tenSan: string
  moTa: string
  hinhAnh: string
  trangThai: string
}

const createEmptyCourtForm = (): CourtForm => ({
  tenSan: '',
  moTa: '',
  hinhAnh: '',
  trangThai: 'Sẵn sàng',
})

/**
 * Component trang quản lý sân.
 * Cho phép admin thực hiện đầy đủ các thao tác CRUD (Tạo, Đọc, Sửa, Xóa)
 * đối với danh sách sân pickleball trong hệ thống.
 *
 * @returns Giao diện bảng danh sách sân kèm các modal thêm/sửa/xóa.
 */
export default function CourtsManagePage() {
  /** Sân đang được chỉnh sửa (null nếu đang ở chế độ thêm mới) */
  const [editCourt, setEditCourt] = useState<any>(null)
  /** Trạng thái hiển thị modal form thêm/sửa sân */
  const [showForm, setShowForm] = useState(false)
  /**
   * Dữ liệu form thêm/sửa sân.
   * Bao gồm: tên sân, mô tả, URL hình ảnh, trạng thái sân.
   * Mặc định trạng thái là "Sẵn sàng" khi tạo mới.
   */
  const [form, setForm] = useState<CourtForm>(createEmptyCourtForm)
  /** ID của sân đang được chọn để xóa (null nếu không có xác nhận xóa nào đang mở) */
  const [deleteId, setDeleteId] = useState<string | null>(null)
  /** QueryClient để làm mới cache sau khi thực hiện mutation */
  const queryClient = useQueryClient()

  /**
   * Lấy danh sách tất cả sân từ API dành cho admin.
   * Query key: ['admin', 'courts'] để phân biệt với query của người dùng thường.
   * Giới hạn 100 sân cho một lần request.
   */
  const { data: courts, isLoading } = useQuery({
    queryKey: ['admin', 'courts'],
    queryFn: () => courtService.getCourts({ limit: 100, isAdmin: true }).then(r => r.data.data ?? r.data ?? []),
  })

  /**
   * Chuẩn hóa dữ liệu sân thành mảng.
   * API có thể trả về mảng trực tiếp hoặc object chứa thuộc tính `courts`.
   */
  const courtList = Array.isArray(courts) ? courts : courts?.courts ?? []

  /**
   * Mutation để thêm mới hoặc cập nhật sân.
   * - Nếu `editCourt` có giá trị -> gọi API cập nhật (updateCourt).
   * - Nếu `editCourt` là null -> gọi API tạo mới (createCourt).
   * Sau khi thành công: hiển thị toast, làm mới danh sách sân, đóng form.
   */
  const saveMutation = useMutation({
    mutationFn: (data: any) => editCourt ? courtService.updateCourt(editCourt.id, data) : courtService.createCourt(data),
    onSuccess: () => {
      toast.success(editCourt ? 'Cập nhật sân thành công!' : 'Thêm sân mới thành công!')
      // Làm mới cache danh sách sân để hiển thị dữ liệu mới nhất
      queryClient.invalidateQueries({ queryKey: ['admin', 'courts'] })
      setShowForm(false); setEditCourt(null)
      // Reset form về giá trị mặc định sau khi lưu thành công
      setForm(createEmptyCourtForm())
    },
    onError: (err: any) => toast.error(err.response?.data?.message || err.response?.data?.error || 'Thao tác thất bại'),
  })

  /**
   * Mutation để xóa sân.
   * Gọi API xóa sân theo ID, làm mới danh sách và đóng modal xác nhận khi thành công.
   */
  const deleteMutation = useMutation({
    mutationFn: (id: string) => courtService.deleteCourt(id),
    onSuccess: () => {
      toast.success('Xóa sân thành công!')
      queryClient.invalidateQueries({ queryKey: ['admin', 'courts'] })
      setDeleteId(null)
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Không thể xóa sân'),
  })

  /**
   * Mở form chỉnh sửa với dữ liệu của sân được chọn.
   * Điền sẵn các trường form từ dữ liệu sân hiện có.
   *
   * @param court - Đối tượng sân cần chỉnh sửa
   */
  const openEdit = (court: any) => {
    setEditCourt(court)
    setForm({
      tenSan: court.tenSan || '',
      moTa: court.moTa || '',
      hinhAnh: court.hinhAnh || '',
      trangThai: court.trangThai || 'Sẵn sàng',
    })
    setShowForm(true)
  }

  /**
   * Mở form thêm mới sân.
   * Reset tất cả các trường về giá trị mặc định, đặt editCourt = null
   * để mutation biết đây là thao tác tạo mới.
   */
  const openCreate = () => {
    setEditCourt(null)
    setForm(createEmptyCourtForm())
    setShowForm(true)
  }

  /**
   * Kiểm tra tính hợp lệ của dữ liệu form và gửi yêu cầu lưu sân.
   * Các trường nhập tay không được để trống hoặc chỉ có khoảng trắng.
   */
  const handleSave = () => {
    const payload = {
      ...form,
      tenSan: form.tenSan.trim(),
      moTa: form.moTa.trim(),
      hinhAnh: form.hinhAnh.trim(),
    }

    if (!payload.tenSan) {
      toast.error('Vui lòng nhập tên sân')
      return
    }
    if (!payload.moTa) {
      toast.error('Vui lòng nhập mô tả sân')
      return
    }
    if (!payload.hinhAnh) {
      toast.error('Vui lòng nhập URL hình ảnh')
      return
    }

    saveMutation.mutate(payload)
  }

  return (
    <div className="space-y-6">
      {/* Tiêu đề và nút thêm sân */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quản lý sân</h1>
        <Button onClick={openCreate}><Plus className="size-4 mr-2" />Thêm sân</Button>
      </div>

      {/* Hiển thị skeleton loading trong khi dữ liệu đang được tải */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        /* Bảng danh sách sân */
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Tên sân</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Mô tả</th>
                <th className="text-left px-4 py-3 font-medium">Trạng thái</th>
                <th className="text-right px-4 py-3 font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {courtList.map((court: any) => (
                <tr key={court.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{court.tenSan}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell max-w-xs truncate">{court.moTa}</td>
                  <td className="px-4 py-3">
                    {/* Badge trạng thái với màu sắc tương ứng: xanh lá (Sẵn sàng), cam (Bảo trì), xám (Ẩn) */}
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      court.trangThai === 'Sẵn sàng' ? 'bg-success/10 text-success' :
                      court.trangThai === 'Bảo trì' ? 'bg-orange-500/10 text-orange-600' :
                      'bg-muted text-muted-foreground'
                    }`}>
                      {court.trangThai}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {/* Nút sửa sân */}
                    <Button variant="ghost" size="icon" onClick={() => openEdit(court)}><Pencil className="size-4" /></Button>
                    {/* Nút xóa sân - mở modal xác nhận xóa */}
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(court.id)}><Trash2 className="size-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
              {/* Hiển thị thông báo khi danh sách trống */}
              {courtList.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-12 text-center text-muted-foreground"><MapPin className="size-10 mx-auto mb-2 opacity-30" />Chưa có sân nào</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal form thêm/sửa sân */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editCourt ? 'Sửa sân' : 'Thêm sân mới'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Tên sân *</label>
            <input type="text" value={form.tenSan} onChange={e => setForm(prev => ({ ...prev, tenSan: e.target.value }))}
              required
              className="w-full h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Mô tả *</label>
            <textarea value={form.moTa} onChange={e => setForm(prev => ({ ...prev, moTa: e.target.value }))} rows={3}
              required
              className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">URL hình ảnh *</label>
            <input type="text" value={form.hinhAnh} onChange={e => setForm(prev => ({ ...prev, hinhAnh: e.target.value }))}
              required
              className="w-full h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Trạng thái</label>
            {/* Dropdown chọn trạng thái: Sẵn sàng, Bảo trì, hoặc Ẩn */}
            <select value={form.trangThai} onChange={e => setForm(prev => ({ ...prev, trangThai: e.target.value }))}
              className="w-full h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none">
              <option value="Sẵn sàng">Sẵn sàng</option>
              <option value="Bảo trì">Bảo trì</option>
              <option value="Ẩn">Ẩn</option>
            </select>
          </div>
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={() => setShowForm(false)}>Hủy</Button>
          <Button onClick={handleSave} loading={saveMutation.isPending}>Lưu</Button>
        </ModalFooter>
      </Modal>

      {/* Modal xác nhận xóa sân */}
      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Xác nhận xóa sân" size="sm">
        <p className="text-sm">Bạn có chắc chắn muốn xóa sân này? Hành động này không thể hoàn tác.</p>
        <ModalFooter>
          <Button variant="outline" onClick={() => setDeleteId(null)}>Hủy</Button>
          <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} loading={deleteMutation.isPending}>Xóa</Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
