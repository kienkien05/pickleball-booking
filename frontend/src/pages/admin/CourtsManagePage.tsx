import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, Pencil, Trash2, MapPin } from 'lucide-react'
import { toast } from 'sonner'
import { courtService } from '@/services'
import { Button } from '@/components/ui/Button'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'

export default function CourtsManagePage() {
  const [editCourt, setEditCourt] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ tenSan: '', moTa: '', hinhAnh: '', trangThai: 'Sẵn sàng' })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: courts, isLoading } = useQuery({
    queryKey: ['admin', 'courts'],
    queryFn: () => courtService.getCourts({ limit: 100 }).then(r => r.data.data ?? r.data ?? []),
  })

  const courtList = Array.isArray(courts) ? courts : courts?.courts ?? []

  const saveMutation = useMutation({
    mutationFn: (data: any) => editCourt ? courtService.updateCourt(editCourt.id, data) : courtService.createCourt(data),
    onSuccess: () => {
      toast.success(editCourt ? 'Cập nhật sân thành công!' : 'Thêm sân mới thành công!')
      queryClient.invalidateQueries({ queryKey: ['admin', 'courts'] })
      setShowForm(false); setEditCourt(null)
      setForm({ tenSan: '', moTa: '', hinhAnh: '', trangThai: 'Sẵn sàng' })
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Thao tác thất bại'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => courtService.deleteCourt(id),
    onSuccess: () => {
      toast.success('Xóa sân thành công!')
      queryClient.invalidateQueries({ queryKey: ['admin', 'courts'] })
      setDeleteId(null)
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Không thể xóa sân'),
  })

  const openEdit = (court: any) => {
    setEditCourt(court)
    setForm({ tenSan: court.tenSan, moTa: court.moTa || '', hinhAnh: court.hinhAnh || '', trangThai: court.trangThai || 'Sẵn sàng' })
    setShowForm(true)
  }

  const openCreate = () => {
    setEditCourt(null)
    setForm({ tenSan: '', moTa: '', hinhAnh: '', trangThai: 'Sẵn sàng' })
    setShowForm(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quản lý sân</h1>
        <Button onClick={openCreate}><Plus className="size-4 mr-2" />Thêm sân</Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
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
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${court.trangThai === 'Sẵn sàng' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                      {court.trangThai}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(court)}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(court.id)}><Trash2 className="size-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
              {courtList.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-12 text-center text-muted-foreground"><MapPin className="size-10 mx-auto mb-2 opacity-30" />Chưa có sân nào</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editCourt ? 'Sửa sân' : 'Thêm sân mới'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">Tên sân *</label>
            <input type="text" value={form.tenSan} onChange={e => setForm(prev => ({ ...prev, tenSan: e.target.value }))}
              className="w-full h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Mô tả</label>
            <textarea value={form.moTa} onChange={e => setForm(prev => ({ ...prev, moTa: e.target.value }))} rows={3}
              className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none resize-none" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">URL hình ảnh</label>
            <input type="text" value={form.hinhAnh} onChange={e => setForm(prev => ({ ...prev, hinhAnh: e.target.value }))}
              className="w-full h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Trạng thái</label>
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
          <Button onClick={() => saveMutation.mutate(form)} loading={saveMutation.isPending}>Lưu</Button>
        </ModalFooter>
      </Modal>

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
