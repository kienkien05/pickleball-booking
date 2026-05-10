import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { queryClient } from '@/lib/queryClient'

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

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  login: (data: { token: string; user: User }) => void
  logout: () => void
  updateUser: (data: Partial<User>) => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      isAuthenticated: false,
      login: ({ token, user }) => set({ user, token, isAuthenticated: true }),
      logout: () => {
        set({ user: null, token: null, isAuthenticated: false })
        queryClient.clear()
      },
      updateUser: (data) => set((state) => ({
        user: state.user ? { ...state.user, ...data } : null,
      })),
    }),
    {
      name: 'pickleball-auth',
      partialize: (state) => ({
        user: state.user, token: state.token, isAuthenticated: state.isAuthenticated,
      }),
    }
  )
)
