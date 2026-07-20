/**
 * Empty — empty state placeholder.
 *
 * ```tsx
 * <Empty description="暂无数据" />
 * <Empty>
 *   <Button>新建</Button>
 * </Empty>
 * ```
 */
import { cn } from './cn.ts'

export interface EmptyProps {
  icon?: string
  description?: string
  class?: string
  children?: any
}
export function Empty(props: EmptyProps) {
  const { icon = '📭', description = '暂无数据', class: extraClass, children } = props
  return (
    <div class={cn('flex flex-col items-center justify-center py-12 text-center', extraClass)}>
      <span class="text-4xl mb-4">{icon}</span>
      <p class="text-sm text-gray-500 mb-4">{description}</p>
      {children && <div>{children}</div>}
    </div>
  )
}
