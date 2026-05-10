import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Package } from 'lucide-react'
import { toast } from 'sonner'
import { serviceService } from '@/services'
import { Button } from '@/components/ui/Button'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice } from '@/lib/utils'

export default function ServicesManagePage() {
  const [editService, setEditService] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ tenDichVu: '', donGia: '', loaiDichVu: 'Đồ uống', soLuongTon: '0', trangThai: 'Còn hàng' })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: services, isLoading } = useQuery({
    queryKey: ['admin', 'services'],
    queryFn: () => serviceService.getAll().then(r => r.data.data ?? r.data ?? []),
  })
  const list = Array.isArray(services) ? services : services?.services ?? []

  const saveMutation = useMutation({
    mutationFn: (data: any) => editService ? serviceService.update(editService.id, data) : serviceService.create(data),
    onSuccess: () => {
      toast.success(editService ? 'Cập nhật thành công!' : 'Thêm dịch vụ thành công!')
      queryClient.invalidateQueries({ queryKey: ['admin', 'services'] })
      setShowForm(false); setEditService(null)
      setForm({ tenDichVu: '', donGia: '', loaiDichVu: 'Đồ uống', soLuongTon: '0', trangThai: 'Còn hàng' })
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Thao tác thất bại'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => serviceService.delete(id),
    onSuccess: () => { toast.success('Xóa thành công!'); queryClient.invalidateQueries({ queryKey: ['admin', 'services'] }); setDeleteId(null) },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Không thể xóa'),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quản lý dịch vụ</h1>
        <Button onClick={() => { setEditService(null); setForm({ tenDichVu: '', donGia: '', loaiDichVu: 'Đồ uống', soLuongTon: '0', trangThai: 'Còn hàng' }); setShowForm(true) }}>
          <Plus className="size-4 mr-2" />Thêm dịch vụ
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
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
                  <td className="px-4 py-3">{formatPrice(Number(svc.donGia || 0))}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${svc.trangThai === 'Còn hàng' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                      {svc.trangThai}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" onClick={() => { setEditService(svc); setForm({ tenDichVu: svc.tenDichVu, donGia: String(svc.donGia), loaiDichVu: svc.loaiDichVu, soLuongTon: String(svc.soLuongTon ?? 0), trangThai: svc.trangThai }); setShowForm(true) }}>
                      <Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(svc.id)}><Trash2 className="size-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground"><Package className="size-10 mx-auto mb-2 opacity-30" />Chưa có dịch vụ nào</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

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
            <select value={form.trangThai} onChange={e => setForm(p => ({ ...p, trangThai: e.target.value }))}
              className="w-full h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none">
              <option value="Còn hàng">Còn hàng</option>
              <option value="Hết hàng">Hết hàng</option>
            </select>
          </div>
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={() => setShowForm(false)}>Hủy</Button>
          <Button onClick={() => saveMutation.mutate(form)} loading={saveMutation.isPending}>Lưu</Button>
        </ModalFooter>
      </Modal>

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
