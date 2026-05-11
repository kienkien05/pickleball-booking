import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Ticket, Settings, Shield, Filter } from 'lucide-react'
import { toast } from 'sonner'
import { discountService, courtService } from '@/services'
import { Button } from '@/components/ui/Button'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice, formatDate } from '@/lib/utils'

export default function DiscountsManagePage() {
  const [editDiscount, setEditDiscount] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    code: '', noiDung: '', moTa: '', loaiGiamGia: 'percentage',
    mucGiamGia: '', giamToiDa: '', usageLimitPerUser: '1',
    ngayBatDau: '', ngayKetThuc: '', soLuongBanDau: '', trangThai: 'Active',
    min_order_value: '',
    applicable_court_ids: [] as number[],
    target_audience: 'all' as 'all' | 'new_user' | 'vip'
  })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [hideSystemCodes, setHideSystemCodes] = useState(true)
  const queryClient = useQueryClient()

  const { data: discounts, isLoading } = useQuery({
    queryKey: ['admin', 'discounts'],
    queryFn: async () => {
      const res = await discountService.getAll()
      return res.data?.data || res.data || []
    },
  })
  
  const { data: courts } = useQuery({
    queryKey: ['admin', 'courts'],
    queryFn: async () => {
      const res = await courtService.getCourts({ limit: 100 })
      return res.data?.data || res.data || []
    },
  })
  
  const allDiscounts = Array.isArray(discounts) ? discounts : []
  const list = hideSystemCodes 
    ? allDiscounts.filter(d => !d.code.startsWith('LTY10-') && !d.code.startsWith('LOYAL') && !d.nguoiDungId)
    : allDiscounts
  const courtList = Array.isArray(courts) ? courts : []

  const saveMutation = useMutation({
    mutationFn: (data: any) => {
      const payload = {
        ...data,
        usageLimitPerUser: parseInt(data.usageLimitPerUser) || 1,
        giamToiDa: data.giamToiDa ? parseFloat(data.giamToiDa) : null,
        conditions: {
          min_order_value: data.min_order_value ? parseFloat(data.min_order_value) : null,
          applicable_court_ids: Array.isArray(data.applicable_court_ids) && data.applicable_court_ids.length > 0 ? data.applicable_court_ids : null,
          target_audience: data.target_audience
        }
      }
      return editDiscount
        ? discountService.update(editDiscount.id, payload)
        : discountService.create(payload)
    },
    onSuccess: () => {
      toast.success(editDiscount ? 'Cập nhật mã giảm giá!' : 'Thêm mã giảm giá!')
      queryClient.invalidateQueries({ queryKey: ['admin', 'discounts'] })
      setShowForm(false); setEditDiscount(null)
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Thao tác thất bại'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => discountService.delete(id),
    onSuccess: () => {
      toast.success('Xóa mã giảm giá thành công!')
      queryClient.invalidateQueries({ queryKey: ['admin', 'discounts'] })
      setDeleteId(null)
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Không thể xóa mã giảm giá'),
  })

  const openEdit = (d: any) => {
    if (!d) return
    setEditDiscount(d)
    let conditions = { min_order_value: '', applicable_court_ids: [], target_audience: 'all' }
    try {
      if (d.conditions) {
        const parsed = typeof d.conditions === 'string' ? JSON.parse(d.conditions) : d.conditions
        if (parsed && typeof parsed === 'object') {
          conditions = { ...conditions, ...parsed }
        }
      }
    } catch (e) { console.error('Parse conditions error', e) }

    setForm({
      code: d.code || '', 
      noiDung: d.noiDung || '', 
      moTa: d.moTa || '',
      loaiGiamGia: d.loaiGiamGia || 'percentage', 
      mucGiamGia: String(d.mucGiamGia || ''),
      giamToiDa: d.giamToiDa ? String(d.giamToiDa) : '',
      usageLimitPerUser: String(d.usageLimitPerUser || 1),
      ngayBatDau: d.ngayBatDau ? d.ngayBatDau.slice(0, 10) : '',
      ngayKetThuc: d.ngayKetThuc ? d.ngayKetThuc.slice(0, 10) : '',
      soLuongBanDau: String(d.soLuongBanDau || 0), 
      trangThai: d.trangThai || 'Active',
      min_order_value: conditions.min_order_value ? String(conditions.min_order_value) : '',
      applicable_court_ids: Array.isArray(conditions.applicable_court_ids) ? conditions.applicable_court_ids : [],
      target_audience: (conditions.target_audience as any) || 'all'
    })
    setShowForm(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold">Quản lý mã giảm giá</h1>
          <div className="flex items-center gap-2 bg-muted/50 px-3 py-1.5 rounded-full border">
            <Filter className="size-3.5 text-muted-foreground" />
            <label className="text-xs font-medium cursor-pointer select-none flex items-center gap-2">
              <input 
                type="checkbox" 
                checked={hideSystemCodes} 
                onChange={e => setHideSystemCodes(e.target.checked)}
                className="size-3 rounded border-primary text-primary focus:ring-primary"
              />
              Ẩn mã hệ thống sinh
            </label>
          </div>
        </div>
        <Button onClick={() => { setEditDiscount(null); setShowForm(true) }}><Plus className="size-4 mr-2" />Thêm mã</Button>
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
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Lượt dùng</th>
                <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Hiệu lực</th>
                <th className="text-left px-4 py-3 font-medium">Trạng thái</th>
                <th className="text-right px-4 py-3 font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {list.map((d: any) => (
                <tr key={d.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-mono font-medium">{d.code}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell max-w-[150px] truncate">{d.noiDung || '--'}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-primary">
                      {d.loaiGiamGia === 'percentage' ? `${d.mucGiamGia}%` : formatPrice(Number(d.mucGiamGia || 0))}
                    </div>
                    {d.giamToiDa > 0 && <div className="text-[10px] text-muted-foreground uppercase">Tối đa {formatPrice(Number(d.giamToiDa))}</div>}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground hidden sm:table-cell">
                    {d.soLuongDaDung || 0} / {d.soLuongBanDau > 0 ? d.soLuongBanDau : '∞'}
                  </td>
                  <td className="px-4 py-3 text-[10px] text-muted-foreground hidden sm:table-cell">
                    {d.ngayBatDau ? formatDate(d.ngayBatDau) : '--'} <br/> {d.ngayKetThuc ? formatDate(d.ngayKetThuc) : '--'}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${d.trangThai === 'Active' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
                      {d.trangThai}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(d)}><Pencil className="size-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => setDeleteId(d.id)}><Trash2 className="size-4 text-destructive" /></Button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">Chưa có mã giảm giá nào</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editDiscount ? 'Sửa mã' : 'Thêm mã'} size="lg">
        <div className="space-y-6 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1 uppercase opacity-60">Mã *</label>
              <input type="text" value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-input bg-background outline-none uppercase font-mono" />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1 uppercase opacity-60">Nội dung</label>
              <input type="text" value={form.noiDung} onChange={e => setForm(p => ({ ...p, noiDung: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-input bg-background outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold mb-1 uppercase opacity-60">Loại giảm</label>
              <select value={form.loaiGiamGia} onChange={e => setForm(p => ({ ...p, loaiGiamGia: e.target.value }))}
                className="w-full h-10 px-3 rounded-lg border border-input bg-background outline-none">
                <option value="percentage">Phần trăm (%)</option>
                <option value="fixed">Số tiền (VNĐ)</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold mb-1 uppercase opacity-60">Mức giảm *</label>
                <input type="number" value={form.mucGiamGia} onChange={e => setForm(p => ({ ...p, mucGiamGia: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1 uppercase opacity-60">Tối đa</label>
                <input type="number" value={form.giamToiDa} onChange={e => setForm(p => ({ ...p, giamToiDa: e.target.value }))}
                  disabled={form.loaiGiamGia === 'fixed'}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background outline-none disabled:opacity-50" />
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-border">
            <h3 className="text-sm font-bold flex items-center gap-2"><Filter className="size-4" /> Điều kiện áp dụng</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold mb-1 uppercase opacity-60">Đơn hàng tối thiểu</label>
                <input type="number" value={form.min_order_value} onChange={e => setForm(p => ({ ...p, min_order_value: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background outline-none" />
              </div>
              <div>
                <label className="block text-xs font-bold mb-1 uppercase opacity-60">Đối tượng khách</label>
                <select value={form.target_audience} onChange={e => setForm(p => ({ ...p, target_audience: e.target.value as any }))}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background outline-none">
                  <option value="all">Tất cả</option>
                  <option value="new_user">Khách mới</option>
                  <option value="vip">Khách VIP</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold mb-1 uppercase opacity-60">Áp dụng cho Sân</label>
              <div className="border border-input rounded-lg p-2 h-[100px] overflow-y-auto space-y-1 bg-muted/20">
                <label className="flex items-center gap-2 text-xs cursor-pointer">
                  <input type="checkbox" checked={form.applicable_court_ids.length === 0} onChange={() => setForm(p => ({ ...p, applicable_court_ids: [] }))} />
                  Tất cả sân
                </label>
                {courtList.map((c: any) => (
                  <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer">
                    <input type="checkbox" checked={form.applicable_court_ids.includes(c.id)}
                      onChange={(e) => {
                        const ids = e.target.checked ? [...form.applicable_court_ids, c.id] : form.applicable_court_ids.filter(id => id !== c.id)
                        setForm(p => ({ ...p, applicable_court_ids: ids }))
                      }}
                    />
                    {c.tenSan}
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-border">
            <h3 className="text-sm font-bold flex items-center gap-2"><Shield className="size-4" /> Giới hạn & Trạng thái</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold mb-1 uppercase opacity-60">Lượt/Khách</label>
                  <input type="number" value={form.usageLimitPerUser} onChange={e => setForm(p => ({ ...p, usageLimitPerUser: e.target.value }))}
                    className="w-full h-10 px-2 rounded-lg border border-input bg-background outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-bold mb-1 uppercase opacity-60">Tổng mã</label>
                  <input type="number" value={form.soLuongBanDau} onChange={e => setForm(p => ({ ...p, soLuongBanDau: e.target.value }))}
                    className="w-full h-10 px-2 rounded-lg border border-input bg-background outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold mb-1 uppercase opacity-60">Trạng thái</label>
                <select value={form.trangThai} onChange={e => setForm(p => ({ ...p, trangThai: e.target.value }))}
                  className="w-full h-10 px-3 rounded-lg border border-input bg-background outline-none">
                  <option value="Active">Kích hoạt</option>
                  <option value="Inactive">Vô hiệu</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        <ModalFooter>
          <Button variant="outline" onClick={() => setShowForm(false)}>Hủy</Button>
          <Button onClick={() => saveMutation.mutate(form)} loading={saveMutation.isPending}>Lưu</Button>
        </ModalFooter>
      </Modal>

      <Modal isOpen={!!deleteId} onClose={() => setDeleteId(null)} title="Xóa mã" size="sm">
        <p className="text-sm">Xác nhận xóa mã giảm giá này?</p>
        <ModalFooter>
          <Button variant="outline" onClick={() => setDeleteId(null)}>Hủy</Button>
          <Button variant="destructive" onClick={() => deleteId && deleteMutation.mutate(deleteId)} loading={deleteMutation.isPending}>Xóa</Button>
        </ModalFooter>
      </Modal>
    </div>
  )
}
