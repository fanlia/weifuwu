/**
 * Spinner — loading indicator.
 *
 * ```tsx
 * <Spinner />
 * <Spinner size="lg" />
 * ```
 */
import { cn } from './cn.ts'

export interface SpinnerProps { size?: 'sm' | 'md' | 'lg'; class?: string }
export function Spinner(props: SpinnerProps) {
  const { size = 'md', class: extraClass } = props
  const sizeClass = size === 'sm' ? 'size-4' : size === 'lg' ? 'size-8' : 'size-5'
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <svg class={cn('animate-spin text-gray-400', sizeClass, extraClass)} viewBox="0 0 24 24" fill="none">
      <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
      <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  )
}
