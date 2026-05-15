/**
 * Button.tsx - Component nút bấm (Button) tái sử dụng với nhiều biến thể.
 *
 * Component này cung cấp:
 *
 * 1. Button - Nút bấm với các biến thể (variant) và kích thước (size):
 *    - Variants:
 *      + default: nút chính, màu primary
 *      + destructive: nút nguy hiểm (xóa, hủy), màu đỏ
 *      + outline: nút viền, nền trong suốt
 *      + secondary: nút phụ, màu secondary
 *      + ghost: nút trong suốt, chỉ hiện khi hover
 *      + link: nút dạng link, có gạch chân khi hover
 *      + success: nút thành công, màu xanh lá
 *    - Sizes: default, sm, lg, icon
 *    - Hỗ trợ trạng thái loading (spinner + vô hiệu hóa nút)
 *    - Hỗ trợ asChild (dùng với Radix Slot để render component con thay vì <button>)
 *
 * 2. buttonVariants - Hàm CVA (class-variance-authority) tạo class Tailwind
 *    cho từng biến thể và kích thước.
 *
 * Dùng thư viện:
 * - class-variance-authority (cva): định nghĩa variant styles có cấu trúc
 * - @radix-ui/react-slot (Slot): cho phép truyền component con làm nút
 */

import { forwardRef } from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * buttonVariants - Định nghĩa các biến thể và kích thước của Button.
 *
 * Dùng CVA để:
 * - Base styles: flex, căn giữa, border-radius, font, transition, focus ring...
 * - Variants:
 *   + variant: default, destructive, outline, secondary, ghost, link, success
 *   + size: default (h-10), sm (h-9), lg (h-12), icon (size-10)
 * - Default: variant = 'default', size = 'default'
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-lg text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 touch-target active:scale-[0.97]',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
        success: 'bg-success text-success-foreground hover:bg-success/90',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3 text-xs',
        lg: 'h-12 rounded-xl px-8 text-base',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

/**
 * ButtonProps - Props của component Button.
 * Kế thừa từ HTML button attributes + variant props từ CVA.
 */
export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Nếu true, render component con thay vì thẻ <button> (dùng với Radix Slot) */
  asChild?: boolean
  /** Nếu true, hiển thị spinner và vô hiệu hóa nút */
  loading?: boolean
}

/**
 * Button - Component nút bấm với nhiều biến thể.
 *
 * @param variant - Kiểu nút: default, destructive, outline, secondary, ghost, link, success
 * @param size - Kích thước: default, sm, lg, icon
 * @param asChild - Render component con thay vì <button>
 * @param loading - Hiển thị trạng thái đang tải (spinner + disabled)
 * @param ref - Forwarded ref đến phần tử button DOM
 *
 * Khi loading = true:
 * - Nút bị vô hiệu hóa (disabled)
 * - Hiển thị spinner xoay bên trái text
 */
const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} disabled={disabled || loading} {...props}>
        {loading ? (
          <span className="flex items-center gap-2">
            <span className="size-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            {children}
          </span>
        ) : (children)}
      </Comp>
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
