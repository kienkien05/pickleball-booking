/**
 * main.tsx - Điểm khởi đầu (entry point) của ứng dụng React.
 *
 * File này khởi tạo ứng dụng React với các provider cần thiết:
 *
 * 1. React.StrictMode - Bọc ứng dụng trong StrictMode để phát hiện các vấn đề tiềm ẩn
 *    (chỉ chạy trong development, không ảnh hưởng production)
 *
 * 2. QueryClientProvider - Cung cấp React Query client cho toàn bộ ứng dụng:
 *    - Quản lý cache, tự động refetch, stale time, gc time
 *    - Cấu hình trong lib/queryClient.ts
 *
 * 3. BrowserRouter - Cung cấp routing cho ứng dụng (React Router v6)
 *
 * 4. <App /> - Component gốc chứa toàn bộ route (định nghĩa trong App.tsx)
 *
 * 5. <Toaster /> - Hiển thị toast notification (dùng thư viện sonner):
 *    - Vị trí: góc trên bên phải
 *    - Tự động ẩn sau 3 giây
 *    - Style tương thích với theme (bg-card, text-card-foreground)
 */

import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import App from './App'
import { queryClient } from './lib/queryClient'
import './index.css'

// Mount ứng dụng vào thẻ div#root trong index.html
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* React Query Provider - quản lý server state và cache */}
    <QueryClientProvider client={queryClient}>
      {/* React Router Provider - quản lý điều hướng */}
      <BrowserRouter>
        <App />
        {/* Toast notification - hiển thị thông báo popup */}
        <Toaster
          position="top-right"
          toastOptions={{
            className: 'bg-card text-card-foreground border-border',
            duration: 3000,
          }}
        />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
)
