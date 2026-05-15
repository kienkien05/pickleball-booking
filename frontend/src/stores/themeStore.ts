/**
 * themeStore.ts - Zustand store quản lý theme (sáng/tối) của ứng dụng.
 *
 * Store này quản lý:
 * - theme: 'light' hoặc 'dark' (mặc định 'dark')
 *
 * Các action:
 * - toggleTheme(): chuyển đổi qua lại giữa light và dark
 * - setTheme(theme): đặt theme cụ thể
 *
 * Cả 2 action đều cập nhật class 'dark' trên thẻ <html> để Tailwind CSS
 * nhận biết và áp dụng dark mode styles tương ứng.
 *
 * Dùng Zustand middleware 'persist' để lưu theme vào localStorage:
 * - Key lưu trữ: 'pickleball-theme'
 * - onRehydrateStorage: khi khôi phục theme từ localStorage, áp dụng class 'dark' lên <html>
 *   để tránh tình trạng "flash" sai theme khi reload trang
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type Theme = 'light' | 'dark'

/**
 * ThemeState interface - Định nghĩa state và action của theme store.
 */
interface ThemeState {
  theme: Theme
  /** Chuyển đổi qua lại giữa light và dark */
  toggleTheme: () => void
  /** Đặt theme cụ thể (light hoặc dark) */
  setTheme: (theme: Theme) => void
}

/**
 * useThemeStore - Hook Zustand cho phép đọc/ghi theme từ bất kỳ component nào.
 *
 * Cách hoạt động:
 * - Mặc định theme = 'dark'
 * - Khi toggle hoặc set theme -> cập nhật class 'dark' trên document.documentElement (<html>)
 * - Tailwind CSS dùng class 'dark' để áp dụng dark mode variants (vd: dark:bg-gray-900)
 * - Persist vào localStorage để giữ theme khi reload trang
 */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'dark' as Theme,

      /** Chuyển đổi theme: dark -> light hoặc light -> dark */
      toggleTheme: () => {
        const newTheme = get().theme === 'dark' ? 'light' : 'dark'
        // Cập nhật class 'dark' trên <html> để Tailwind áp dụng dark mode styles
        document.documentElement.classList.toggle('dark', newTheme === 'dark')
        set({ theme: newTheme })
      },

      /** Đặt theme cụ thể, cập nhật class 'dark' tương ứng */
      setTheme: (theme: Theme) => {
        document.documentElement.classList.toggle('dark', theme === 'dark')
        set({ theme })
      },
    }),
    {
      name: 'pickleball-theme', // Key trong localStorage
      // Khi khôi phục theme từ localStorage lúc reload trang:
      // áp dụng ngay class 'dark' để không bị flash theme sai
      onRehydrateStorage: () => (state) => {
        if (state) document.documentElement.classList.toggle('dark', state.theme === 'dark')
      },
    }
  )
)
