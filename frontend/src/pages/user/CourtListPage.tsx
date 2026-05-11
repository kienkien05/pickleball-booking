import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MapPin, Search, Clock, Star } from 'lucide-react'
import { courtService } from '@/services'
import { CardSkeleton } from '@/components/ui/Skeleton'

export default function CourtListPage() {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')

  const { data: courtsData, isLoading } = useQuery({
    queryKey: ['courts', 'list', debouncedSearch],
    queryFn: () => courtService.getCourts({ search: debouncedSearch, limit: 20 }).then(r => r.data.data ?? r.data ?? []),
  })

  const courts = Array.isArray(courtsData) ? courtsData : courtsData?.courts ?? []

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold mb-6">Danh sách sân Pickleball</h1>
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') setDebouncedSearch(search) }}
              placeholder="Tìm kiếm sân..." className="w-full h-11 pl-10 pr-4 rounded-lg border border-input bg-background focus:ring-2 focus:ring-ring outline-none" />
          </div>
          <button onClick={() => setDebouncedSearch(search)} className="h-11 px-4 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">Tìm</button>
        </div>
      </motion.div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : courts.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <MapPin className="size-16 mx-auto mb-4 opacity-20" />
          <p className="text-lg">Không tìm thấy sân nào</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {courts.map((court: any) => (
            <Link key={court.id} to={`/courts/${court.id}`}
              className="group rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 hover:shadow-lg transition-all duration-300">
              <div className="aspect-video bg-muted relative overflow-hidden">
                {court.hinhAnh ? (
                  <img src={court.hinhAnh} alt={court.tenSan} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><MapPin className="size-12 text-muted-foreground/30" /></div>
                )}
                <div className={`absolute top-3 right-3 px-2 py-1 rounded-full text-xs font-medium backdrop-blur-md ${
                  court.trangThai === 'Sẵn sàng' ? 'bg-success/20 text-success' : 
                  court.trangThai === 'Bảo trì' ? 'bg-orange-500/20 text-orange-600' : 
                  'bg-muted/50 text-muted-foreground'
                }`}>
                  {court.trangThai || 'Sẵn sàng'}
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-semibold group-hover:text-primary transition-colors">{court.tenSan}</h3>
                <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{court.moTa || 'Sân Pickleball tiêu chuẩn'}</p>
                <div className="flex items-center gap-3 mt-3 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="size-3" /> {court.slotCount ?? 0} khung giờ</span>
                  <span className="flex items-center gap-1"><Star className="size-3" /> {court.avgRating != null && court.avgRating > 0 ? Number(court.avgRating).toFixed(1) : '--'}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
