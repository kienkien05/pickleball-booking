import { Link } from 'react-router-dom'
import { ShieldOff } from 'lucide-react'

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center">
        <div className="size-16 mx-auto rounded-full bg-destructive/10 flex items-center justify-center mb-4">
          <ShieldOff className="size-8 text-destructive" />
        </div>
        <h1 className="text-2xl font-bold">Truy cập bị từ chối</h1>
        <p className="mt-2 text-muted-foreground">Bạn không có quyền truy cập trang này.</p>
        <Link to="/" className="mt-6 inline-block text-primary hover:underline">Về trang chủ</Link>
      </div>
    </div>
  )
}
