/**
 * Divider — visual separator.
 *
 * ```tsx
 * <Divider />
 * <Divider label="或" />
 * ```
 */
import { cn } from './cn.ts'

export interface DividerProps { label?: string; class?: string }
export function Divider(props: DividerProps) {
  const { label, class: extraClass } = props
  if (!label) return <hr class={cn('border-t border-gray-200 my-4', extraClass)} />
  return (
    <div class={cn('flex items-center gap-3 my-4', extraClass)}>
      <span class="flex-1 border-t border-gray-200" />
      <span class="text-sm text-gray-500">{label}</span>
      <span class="flex-1 border-t border-gray-200" />
    </div>
  )
}
