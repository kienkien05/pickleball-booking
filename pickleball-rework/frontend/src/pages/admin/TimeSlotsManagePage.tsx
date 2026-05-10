import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { courtService, timeSlotService } from '@/services'
import { Button } from '@/components/ui/Button'
import { Modal, ModalFooter } from '@/components/ui/Modal'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatPrice } from '@/lib/utils'

export default function TimeSlotsManagePage() {
  const [selectedCourt, setSelectedCourt] = useState<string>('')
  const [editSlot, setEditSlot] = useState<any>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ gioBatDau: '06:00', gioKetThuc: '07:30', mucGia: '150000' })
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const { data: courts } = useQuery({
    queryKey: ['admin', 'courts'],
    queryFn: () => courtService.getCourts({ limit: 100 }).then(r => r.data.data ?? r.data ?? []),
  })
  const courtList = Array.isArray(courts) ? courts : courts?.courts ?? []

  const { data: slots, isLoading } = useQuery({
    queryKey: ['timeslots', 'all', selectedCourt],
    queryFn: () => timeSlotService.getByCourt(selectedCourt).then(r => r.data.data ?? r.data ?? []),
    enabled: !!selectedCourt,
  })
  const slotList = Array.isArray(slots) ? slots : slots?.slots ?? []

  const saveMutation = useMutation({
    mutationFn: (data: any) => editSlot
      ? timeSlotService.update(selectedCourt, editSlot.id, data)
      : timeSlotService.create(selectedCourt, data),
    onSuccess: () => {
      toast.success(editSlot ? 'Cập nhật thành công!' : 'Thêm khung giờ thành công!')
      queryClient.invalidateQueries({ queryKey: ['timeslots', 'all', selectedCourt] })
      setShowForm(false); setEditSlot(null)
      setForm({ gioBatDau: '06:00', gioKetThuc: '07:30', mucGia: '150000' })
    },
    onError: (err: any) => toast.error(err.response?.data?.message || 'Thao tác thất bại'),
  })

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

      <div>
        <label className="block text-sm font-medium mb-2">Chọn sân</label>
        <select value={selectedCourt} onChange={e => setSelectedCourt(e.target.value)}
          className="w-full sm:w-64 h-11 px-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none">
          <option value="">-- Chọn sân --</option>
          {courtList.map((c: any) => <option key={c.id} value={c.id}>{c.tenSan}</option>)}
        </select>
      </div>

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
                      <td className="px-4 py-3">{slot.gioBatDau?.substring(0, 5)}</td>
                      <td className="px-4 py-3">{slot.gioKetThuc?.substring(0, 5)}</td>
                      <td className="px-4 py-3 font-medium">{formatPrice(Number(slot.mucGia || 0))}</td>
                      <td className="px-4 py-3 text-right">
                        <Button variant="ghost" size="icon" onClick={() => { setEditSlot(slot); setForm({ gioBatDau: slot.gioBatDau?.substring(0, 5), gioKetThuc: slot.gioKetThuc?.substring(0, 5), mucGia: String(slot.mucGia) }); setShowForm(true) }}>
                          <Pencil className="size-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteId(slot.id)}><Trash2 className="size-4 text-destructive" /></Button>
                      </td>
                    </tr>
                  ))}
                  {slotList.length === 0 && (
                    <tr><td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">Chưa có khung giờ nào</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      <Modal isOpen={showForm} onClose={() => setShowForm(false)} title={editSlot ? 'Sửa khung giờ' : 'Thêm khung giờ'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Giờ bắt đầu</label>
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
