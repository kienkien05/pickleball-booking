import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Ticket } from 'lucide-react'
import { toast } from 'sonner'
import { discountService } from '@/services'
import { Button } from '@/components/ui/Button'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice, formatDate } from '@/lib/utils'

export default function DiscountsManagePage() {
  const [editDiscount, setEditDiscount] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    code: '', noiDung: '', moTa: '', loaiGiamGia: 'percentage',
    mucGiamGia: '', ngayBatDau: '', ngayKetThuc: '', soLuongBanDau: '', trangThai: 'Active'
  })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: discounts, isLoading } = useQuery({
    queryKey: ['admin', 'discounts'],
    queryFn: () => discountService.getAll().then(r => r.data.data ?? r.data ?? []),
  })
  const list = Array.isArray(discounts) ? discounts : discounts?.discounts ?? []

  const saveMutation = useMutation({
    mutationFn: (data: any) => editDiscount
      ? discountService.update(editDiscount.id, data)
      : discountService.create(data),
    onSuccess: () => {
      toast.success(editDiscount ? 'Cập nhật mã giảm giá!' : 'Thêm mã giảm giá!')
      queryClient.invalidateQueries({ queryKey: ['admin', 'discounts'] })
      setShowForm(false); setEditDiscount(null)
      setForm({ code: '', noiDung: '', moTa: '', loaiGiamGia: 'percentage', mucGiamGia: '', ngayBatDau: '', ngayKetThuc: '', soLuongBanDau: '', trangThai: 'Active' })
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Thao tác thất bại'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => discountService.delete(id),
    onSuccess: () => { toast.success('Xóa thành công!'); queryClient.invalidateQueries({ queryKey: ['admin', 'discounts'] }); setDeleteId(null) },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Không thể xóa'),
  })

  const openEdit = (d: any) => {
    setEditDiscount(d)
    setForm({
      code: d.code, noiDung: d.noiDung || '', moTa: d.moTa || '',
      loaiGiamGia: d.loaiGiamGia || 'percentage', mucGiamGia: String(d.mucGiamGia || ''),
      ngayBatDau: d.ngayBatDau ? d.ngayBatDau.slice(0, 10) : '',
      ngayKetThuc: d.ngayKetThuc ? d.ngayKetThuc.slice(0, 10) : '',
      soLuongBanDau: String(d.soLuongBanDau || 0), trangThai: d.trangThai || 'Active'
    })
    setShowForm(true)
  }

  const openCreate = () => {
    setEditDiscount(null)
    setForm({ code: '', noiDung: '', moTa: '', loaiGiamGia: 'percentage', mucGiamGia: '', ngayBatDau: '', ngayKetThuc: '', soLuongBanDau: '', trangThai: 'Active' })
    setShowForm(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quản lý mã giảm giá</h1>
        <Button onClick={openCreate}><Plus className="size-4 mr-2" />Thêm mã</Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Mã</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Nội dung</th>
                <th className="text-left px-4 py-3 font-medium">Giảm</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Hiệu lực</th>
                <th className="text-left px-4 py-3 font-medium">Trạng thái</th>
                <th className="text-right px-4 py-3 font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((d: any) => (
                <tr key={d.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono font-medium">{d.code}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell max-w-[200px] truncate">{d.noiDung || '--'}</td>
                  <td className="px-4 py-3">
                    {d.loaiGiamGia === 'percentage' ? `${d.mucGiamGia}%` : formatPrice(Number(d.mucGiamGia || 0))}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                    {d.ngayBatDau ? formatDate(d.ngayBatDau) : '--'} - {d.ngayKetThuc ? formatDate(d.ngayKetThuc) : '--'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${d.trangThai === 'Active' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                      {d.trangThai}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(d)}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(d.id)}><Trash2 className="size-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground"><Ticket className="size-10 mx-auto mb-2 opacity-30" />Chưa có mã giảm giá nào</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editDiscount ? 'Sửa mã giảm giá' : 'Thêm mã giảm giá'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Mã giảm giá *</label>
              <input type="text" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))}
                className="w-full h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none uppercase" placeholder="VD: SUMMER50" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Nội dung</label>
              <input type="text" value={form.noiDung} onChange={e => setForm(p => ({ ...p, noiDung: e.target.value }))}
                className="w-full h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" placeholder="VD: Giảm giá hè 2026" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Loại giảm giá</label>
              <select value={form.loaiGiamGia} onChange={e => setForm(p => ({ ...p, loaiGiamGia: e.target.value }))}
                className="w-full h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none">
                <option value="percentage">Phần trăm (%)</option>
                <option value="fixed">Số tiền cố định</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Mức giảm *</label>
              <input type="number" value={form.mucGiamGia} onChange={e => setForm(p => ({ ...p, mucGiamGia: e.target.value }))}
                className="w-full h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none"
                placeholder={form.loaiGiamGia === 'percentage' ? 'VD: 10 (%)' : 'VD: 50000 (VNĐ)'} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Ngày bắt đầu</label>
              <input type="date" value={form.ngayBatDau} onChange={e => setForm(p => ({ ...p, ngayBatDau: e.target.value }))}
                className="w-full h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Ngày kết thúc</label>
              <input type="date" value={form.ngayKetThuc} onChange={e => setForm(p => ({ ...p, ngayKetThuc: e.target.value }))}
                className="w-full h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Số lượng</label>
              <input type="number" value={form.soLuongBanDau} onChange={e => setForm(p => ({ ...p, soLuongBanDau: e.target.value }))}
                className="w-full h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" placeholder="0 = không giới hạn" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Trạng thái</label>
              <select value={form.trangThai} onChange={e => setForm(p => ({ ...p, trangThai: e.target.value }))}
                className="w-full h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none">
                <option value="Active">Kích hoạt</option>
                <option value="Inactive">Vô hiệu</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1.5">Mô tả</label>
            <textarea value={form.moTa} onChange={e => setForm(p => ({ ...p, moTa: e.target.value }))} rows={2}
              className="w-full px-4 py-2 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none resize-none" />
          </div>
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={() => setShowForm(false)}>Hủy</Button>
          <Button onClick={() => saveMutation.mutate(form)} loading={saveMutation.isPending}>Lưu</Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Xác nhận xóa" size="sm">
        <p className="text-sm">Xóa mã giảm giá này?</p>
        <ModalFooter>
          <Button variant="outline" onClick={() => setDeleteId(null)}>Hủy</Button>
          <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} loading={deleteMutation.isPending}>Xóa</Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
