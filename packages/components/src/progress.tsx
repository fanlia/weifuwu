/**
 * Progress — horizontal progress bar.
 *
 * ```tsx
 * <Progress value={65} />
 * <Progress value={100} variant="success" />
 * ```
 */
import { cn } from './cn.ts'

export interface ProgressProps {
  value?: number
  max?: number
  variant?: 'default' | 'success' | 'warning'
  size?: 'sm' | 'md'
  showLabel?: boolean
  class?: string
}

const barVariants: Record<string, string> = {
  default: 'bg-blue-600',
  success: 'bg-green-600',
  warning: 'bg-yellow-500',
}

export function Progress(props: ProgressProps) {
  const { value = 0, max = 100, variant = 'default', size = 'md', showLabel, class: extraClass } = props
  const pct = Math.min(100, Math.max(0, (value / max) * 100))
  const barStyle = { width: `${pct}%` } as any
  return (
    <div class={cn('flex items-center gap-2', extraClass)}>
      <div class={cn('flex-1 bg-gray-100 rounded-full overflow-hidden', size === 'sm' ? 'h-1.5' : 'h-2')}>
        <div
          class={cn('h-full rounded-full transition-all duration-300', barVariants[variant])}
          style={barStyle}
          role="progressbar"
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
        />
      </div>
      {showLabel && <span class="text-xs text-gray-500">{Math.round(pct)}%</span>}
    </div>
  )
}
