/**
 * authStore.ts - Zustand store quản lý trạng thái xác thực người dùng.
 *
 * Store này quản lý:
 * - user: thông tin người dùng hiện tại (null nếu chưa đăng nhập)
 * - token: JWT token để gửi kèm API request
 * - isAuthenticated: trạng thái đăng nhập (true/false)
 *
 * Các action:
 * - login({ token, user }): lưu token và thông tin user sau khi đăng nhập thành công
 * - logout(): xóa token, user, và clear toàn bộ React Query cache
 * - updateUser(data): cập nhật một phần thông tin user (vd: sau khi edit profile)
 *
 * Dùng Zustand middleware 'persist' để tự động lưu vào localStorage:
 * - Key lưu trữ: 'pickleball-auth'
 * - Chỉ lưu 3 field: user, token, isAuthenticated
 * - Khi user mở lại trang, trạng thái đăng nhập được khôi phục tự động
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { queryClient } from '@/lib/queryClient'

/**
 * User interface - Cấu trúc dữ liệu người dùng.
 */
export interface User {
  id: string
  email: string
  full_name: string
  phone_number?: string
  role: 'user' | 'admin'
  avatar_url?: string
  is_vip?: boolean
  gender?: string
  address?: string
  created_at?: string
  is_active?: boolean
}

/**
 * AuthState interface - Định nghĩa state và action của auth store.
 */
interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  /** Lưu token và user sau khi đăng nhập thành công */
  login: (data: { token: string; user: User }) => void
  /** Xóa token, user, và cache -> chuyển về trạng thái chưa đăng nhập */
  logout: () => void
  /** Cập nhật một phần thông tin user (merge với dữ liệu cũ) */
  updateUser: (data: Partial<User>) => void
}

/**
 * useAuthStore - Hook Zustand cho phép truy cập trạng thái auth từ bất kỳ component nào.
 *
 * Dùng persist middleware để:
 * - Tự động lưu auth state vào localStorage (key: 'pickleball-auth')
 * - Khi user reload trang, token và user được khôi phục -> không cần đăng nhập lại
 * - Khi logout -> xóa khỏi localStorage + clear React Query cache (xóa cache dữ liệu cá nhân)
 */
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,

      /** Lưu thông tin đăng nhập vào store (và localStorage qua persist) */
      login: ({ token, user }) => set({ user, token, isAuthenticated: true }),

      /** Đăng xuất: xóa state + clear toàn bộ React Query cache */
      logout: () => {
        set({ user: null, token: null, isAuthenticated: false })
        queryClient.clear()
      },

      /** Cập nhật user (merge partial data), dùng sau khi edit profile */
      updateUser: (data) => set((state) => ({
        user: state.user ? { ...state.user, ...data } : null,
      })),
    }),
    {
      name: 'pickleball-auth', // Key trong localStorage
      // Chỉ lưu 3 field quan trọng, không lưu các function
      partialize: (state) => ({
        user: state.user, token: state.token, isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
