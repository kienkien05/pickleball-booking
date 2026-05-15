/**
 * queryClient.ts - Cấu hình React Query (TanStack Query) client cho toàn bộ ứng dụng.
 *
 * React Query là thư viện quản lý server state, cung cấp:
 * - Tự động caching dữ liệu từ API
 * - Tự động refetch khi dữ liệu cũ (stale)
 * - Garbage collection cho cache không còn dùng
 * - Retry khi request thất bại
 *
 * Cấu hình mặc định cho tất cả queries:
 * - staleTime: 2 phút - dữ liệu được coi là "tươi" trong 2 phút, không cần refetch
 * - gcTime: 10 phút - cache được giữ trong bộ nhớ 10 phút sau khi không còn component nào dùng
 * - retry: 1 lần - tự động thử lại 1 lần nếu request thất bại
 * - refetchOnWindowFocus: false - không tự động refetch khi user quay lại tab (tránh request thừa)
 */

import { QueryClient } from '@tanstack/react-query'

/**
 * queryClient - Instance duy nhất của React Query client, dùng cho toàn bộ ứng dụng.
 *
 * Được truyền vào QueryClientProvider ở main.tsx để tất cả component con đều dùng được.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000, // 2 phút: dữ liệu tươi trong 2 phút
      gcTime: 10 * 60 * 1000,   // 10 phút: giữ cache 10 phút sau khi unmount
      retry: 1,                  // Thử lại 1 lần nếu lỗi
      refetchOnWindowFocus: false, // Không refetch khi focus lại tab
    },
  },
})
