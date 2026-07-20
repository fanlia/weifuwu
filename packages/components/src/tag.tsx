/**
 * Tag — inline label/tag.
 *
 * ```tsx
 * <Tag>前端</Tag>
 * <Tag variant="success" closable onClose={() => remove(tag)}>已通过</Tag>
 * ```
 */
import { cn } from './cn.ts'

export interface TagProps {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'danger'
  size?: 'sm' | 'md'
  closable?: boolean
  onClose?: () => void
  class?: string
  children?: any
}

const tagVariants: Record<string, string> = {
  default: 'bg-gray-100 text-gray-700',
  primary: 'bg-blue-50 text-blue-700 border-blue-200',
  success: 'bg-green-50 text-green-700 border-green-200',
  warning: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  danger: 'bg-red-50 text-red-700 border-red-200',
}

export function Tag(props: TagProps) {
  const { variant = 'default', size = 'md', closable, onClose, class: extraClass, children } = props
  return (
    <span class={cn(
      'inline-flex items-center gap-1 rounded-md border font-medium',
      tagVariants[variant],
      size === 'sm' ? 'px-1.5 py-0.5 text-xs' : 'px-2 py-1 text-sm',
      extraClass,
    )}>
      {children}
      {closable && (
        <button
          type="button"
          class="ml-0.5 inline-flex items-center justify-center size-3.5 rounded hover:bg-black/10 text-current"
          onClick={(e: MouseEvent) => { e.stopPropagation(); onClose?.() }}
          aria-label="移除"
        >
          ✕
        </button>
      )}
    </span>
  )
}
