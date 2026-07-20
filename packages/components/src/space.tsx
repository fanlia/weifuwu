/**
 * Space — flex gap container.
 *
 * ```tsx
 * <Space gap="md">
 *   <Button>保存</Button>
 *   <Button variant="outline">取消</Button>
 * </Space>
 * ```
 */
import { cn } from './cn.ts'

export interface SpaceProps {
  direction?: 'horizontal' | 'vertical'
  gap?: 'xs' | 'sm' | 'md' | 'lg' | number
  wrap?: boolean
  align?: 'start' | 'center' | 'end' | 'stretch'
  class?: string
  children?: any
}

const gapMap: Record<string, string> = { xs: 'gap-1', sm: 'gap-2', md: 'gap-3', lg: 'gap-4' }

export function Space(props: SpaceProps) {
  const { direction = 'horizontal', gap = 'md', wrap, align = 'center', class: extraClass, children } = props
  const gapClass = typeof gap === 'number' ? '' : gapMap[gap]
  const gapStyle = typeof gap === 'number' ? { gap: `${gap}px` } : undefined

  return (
    <div
      class={cn(
        'flex',
        direction === 'vertical' ? 'flex-col' : 'flex-row',
        gapClass,
        wrap && 'flex-wrap',
        align === 'start' && 'items-start',
        align === 'center' && 'items-center',
        align === 'end' && 'items-end',
        align === 'stretch' && 'items-stretch',
        extraClass,
      )}
      style={gapStyle}
    >
      {children}
    </div>
  )
}
