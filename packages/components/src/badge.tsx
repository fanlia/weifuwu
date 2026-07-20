/**
 * Badge — status label.
 *
 * ```tsx
 * <Badge variant="success">已通过</Badge>
 * <Badge variant="outline">草稿</Badge>
 * ```
 */
import { cn } from './cn.ts'

export interface BadgeProps {
  variant?: 'default' | 'secondary' | 'success' | 'warning' | 'danger' | 'outline'
  class?: string
  children?: any
}
const badgeVariants: Record<string, string> = {
  default: 'bg-blue-100 text-blue-700',
  secondary: 'bg-gray-100 text-gray-700',
  success: 'bg-green-100 text-green-700',
  warning: 'bg-yellow-100 text-yellow-700',
  danger: 'bg-red-100 text-red-700',
  outline: 'border border-gray-300 text-gray-600',
}
export function Badge(props: BadgeProps) {
  const { variant = 'default', class: extraClass, children } = props
  return (
    <span class={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
      badgeVariants[variant],
      extraClass,
    )}>
      {children}
    </span>
  )
}
