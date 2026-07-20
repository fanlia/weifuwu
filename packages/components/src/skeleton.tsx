/**
 * Skeleton — content loading placeholder.
 *
 * ```tsx
 * <Skeleton class="h-4 w-32" />
 * <Skeleton variant="circle" size="lg" />
 * ```
 */
import { cn } from './cn.ts'

export interface SkeletonProps {
  variant?: 'text' | 'circle' | 'rect'
  size?: 'sm' | 'md' | 'lg'
  width?: string
  height?: string
  class?: string
}
export function Skeleton(props: SkeletonProps) {
  const { variant = 'text', size = 'md', width, height, class: extraClass } = props
  const isCircle = variant === 'circle'
  const sizeMap: Record<string, string> = { sm: 'size-8', md: 'size-10', lg: 'size-14' }
  return (
    <div
      class={cn(
        'animate-pulse bg-gray-200 rounded',
        isCircle ? sizeMap[size] : 'rounded-md',
        !isCircle && 'h-4 w-full',
        extraClass,
      )}
      style={(width || height) ? { width, height } as any : undefined}
    />
  )
}
