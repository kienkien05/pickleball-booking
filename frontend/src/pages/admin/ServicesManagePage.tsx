/**
 * ServicesManagePage.tsx
 *
 * Trang quản lý dịch vụ đi kèm dành cho admin.
 * Các dịch vụ này được khách hàng đặt kèm khi đặt sân (ví dụ: đồ uống, dụng cụ).
 * Chức năng chính:
 * - Hiển thị danh sách tất cả dịch vụ (dạng bảng).
 * - Thêm mới dịch vụ (tên, loại, số lượng tồn, đơn giá, trạng thái).
 * - Chỉnh sửa thông tin dịch vụ hiện có.
 * - Xóa dịch vụ (có modal xác nhận).
 * - Các loại dịch vụ: "Đồ uống", "Dụng cụ".
 * - Các trạng thái: "Còn hàng", "Hết hàng".
 *
 * Sử dụng React Query để quản lý cache và tự động làm mới danh sách
 * sau mỗi thao tác thêm/sửa/xóa.
 */

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Package } from 'lucide-react'
import { toast } from 'sonner'
import { serviceService } from '@/services'
import { Button } from '@/components/ui/Button'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice } from '@/lib/utils'

/**
 * Component trang quản lý dịch vụ.
 * Cho phép admin quản lý toàn bộ dịch vụ đi kèm mà khách có thể đặt thêm khi đặt sân.
 *
 * @returns Giao diện bảng danh sách dịch vụ kèm modal thêm/sửa/xóa.
 */
export default function ServicesManagePage() {
  /** Dịch vụ đang được chỉnh sửa (null = chế độ thêm mới) */
  const [editService, setEditService] = useState<any>(null)
  /** Trạng thái hiển thị modal form thêm/sửa dịch vụ */
  const [showForm, setShowForm] = useState(false)
  /**
   * Dữ liệu form dịch vụ.
   * Mặc định: tên rỗng, đơn giá rỗng, loại "Đồ uống", số lượng tồn = 0, trạng thái "Còn hàng".
   */
  const [form, setForm] = useState({ tenDichVu: '', donGia: '', loaiDichVu: 'Đồ uống', soLuongTon: '0', trangThai: 'Còn hàng' })
  /** ID dịch vụ được chọn để xóa (null = không có modal xóa nào mở) */
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  /**
   * Lấy danh sách tất cả dịch vụ từ API.
   * Query key: ['admin', 'services'].
   */
  const { data: services, isLoading } = useQuery({
    queryKey: ['admin', 'services'],
    queryFn: () => serviceService.getAll().then(r => r.data.data ?? r.data ?? []),
  })
  /** Chuẩn hóa dữ liệu thành mảng dịch vụ */
  const list = Array.isArray(services) ? services : services?.services ?? []

  /**
   * Mutation lưu (thêm mới hoặc cập nhật) dịch vụ.
   * - Nếu `editService` có giá trị -> cập nhật.
   * - Nếu `editService` null -> tạo mới.
   * Sau khi thành công, reset form và làm mới danh sách.
   */
  const saveMutation = useMutation({
    mutationFn: (data: any) => editService ? serviceService.update(editService.id, data) : serviceService.create(data),
    onSuccess: () => {
      toast.success(editService ? 'Cập nhật thành công!' : 'Thêm dịch vụ thành công!')
      queryClient.invalidateQueries({ queryKey: ['admin', 'services'] })
      setShowForm(false); setEditService(null)
      // Reset form về mặc định
      setForm({ tenDichVu: '', donGia: '', loaiDichVu: 'Đồ uống', soLuongTon: '0', trangThai: 'Còn hàng' })
    },
    onError: (err: any) => toast.error(err.response?.data?.error || err.response?.data?.message || 'Thao tác thất bại'),
  })

  /**
   * Mutation xóa dịch vụ.
   * Gọi API xóa theo ID, làm mới danh sách khi thành công.
   */
  const deleteMutation = useMutation({
    mutationFn: (id: string) => serviceService.delete(id),
    onSuccess: () => { toast.success('Xóa thành công!'); queryClient.invalidateQueries({ queryKey: ['admin', 'services'] }); setDeleteId(null) },
    onError: (err: any) => toast.error(err.response?.data?.error || err.response?.data?.message || 'Không thể xóa'),
  })

  return (
    <div className="space-y-6">
      {/* Tiêu đề và nút thêm dịch vụ */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quản lý dịch vụ</h1>
        <Button onClick={() => { setEditService(null); setForm({ tenDichVu: '', donGia: '', loaiDichVu: 'Đồ uống', soLuongTon: '0', trangThai: 'Còn hàng' }); setShowForm(true) }}>
          <Plus className="size-4 mr-2" />Thêm dịch vụ
        </Button>
      </div>

      {/* Loading skeleton */}
      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        /* Bảng danh sách dịch vụ */
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Tên dịch vụ</th>
                <th className="text-left px-4 py-3 font-medium">Loại</th>
                <th className="text-left px-4 py-3 font-medium">Số lượng</th>
                <th className="text-left px-4 py-3 font-medium">Đơn giá</th>
                <th className="text-left px-4 py-3 font-medium">Trạng thái</th>
                <th className="text-right px-4 py-3 font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((svc: any) => (
                <tr key={svc.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium">{svc.tenDichVu}</td>
                  <td className="px-4 py-3">{svc.loaiDichVu}</td>
                  <td className="px-4 py-3">{svc.soLuongTon ?? 0}</td>
                  {/* Hiển thị đơn giá đã format (VD: 15.000đ) */}
                  <td className="px-4 py-3">{formatPrice(Number(svc.donGia || 0))}</td>
                  <td className="px-4 py-3">
                    {/* Badge trạng thái: xanh lá = Còn hàng, đỏ = hết */}
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${svc.trangThai === 'Còn hàng' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                      {svc.trangThai}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {/* Nút sửa - điền sẵn dữ liệu dịch vụ vào form */}
                    <Button variant="ghost" size="icon" onClick={() => { setEditService(svc); setForm({ tenDichVu: svc.tenDichVu, donGia: String(svc.donGia), loaiDichVu: svc.loaiDichVu, soLuongTon: String(svc.soLuongTon ?? 0), trangThai: svc.trangThai }); setShowForm(true) }}>
                      <Pencil className="size-4" /></Button>
                    {/* Nút xóa - mở modal xác nhận */}
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(svc.id)}><Trash2 className="size-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
              {/* Trạng thái rỗng */}
              {list.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground"><Package className="size-10 mx-auto mb-2 opacity-30" />Chưa có dịch vụ nào</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal form thêm/sửa dịch vụ */}
      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editService ? 'Sửa dịch vụ' : 'Thêm dịch vụ'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Tên dịch vụ *</label>
            <input type="text" value={form.tenDichVu} onChange={e => setForm(p => ({ ...p, tenDichVu: e.target.value }))}
              className="w-full h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Loại</label>
              {/* Dropdown chọn loại dịch vụ: Đồ uống hoặc Dụng cụ */}
              <select value={form.loaiDichVu} onChange={e => setForm(p => ({ ...p, loaiDichVu: e.target.value }))}
                className="w-full h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none">
                <option value="Đồ uống">Đồ uống</option>
                <option value="Dụng cụ">Dụng cụ</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Số lượng tồn</label>
              <input type="number" value={form.soLuongTon} onChange={e => setForm(p => ({ ...p, soLuongTon: e.target.value }))}
                className="w-full h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Đơn giá (VNĐ)</label>
            <input type="number" value={form.donGia} onChange={e => setForm(p => ({ ...p, donGia: e.target.value }))}
              className="w-full h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Trạng thái</label>
            {/* Dropdown trạng thái: Còn hàng hoặc Hết hàng */}
            <select value={form.trangThai} onChange={e => setForm(p => ({ ...p, trangThai: e.target.value }))}
              className="w-full h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none">
              <option value="Còn hàng">Còn hàng</option>
              <option value="Hết hàng">Hết hàng</option>
            </select>
          </div>
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={() => setShowForm(false)}>Hủy</Button>
          <Button onClick={() => {
            if (!form.tenDichVu || form.tenDichVu.trim() === '') {
              return toast.error('Vui lòng nhập tên dịch vụ');
            }
            const donGia = Number(form.donGia);
            if (isNaN(donGia) || donGia <= 0) {
              return toast.error('Đơn giá phải là số lớn hơn 0');
            }
            const soLuong = Number(form.soLuongTon);
            if (isNaN(soLuong) || soLuong < 0 || !Number.isInteger(soLuong)) {
              return toast.error('Số lượng tồn phải là số nguyên không âm');
            }
            saveMutation.mutate(form);
          }} loading={saveMutation.isPending}>Lưu</Button>
        </ModalFooter>
      </Modal>

      {/* Modal xác nhận xóa dịch vụ */}
      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Xác nhận xóa" size="sm">
        <p className="text-sm">Xóa dịch vụ này?</p>
        <ModalFooter>
          <Button variant="outline" onClick={() => setDeleteId(null)}>Hủy</Button>
          <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} loading={deleteMutation.isPending}>Xóa</Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
