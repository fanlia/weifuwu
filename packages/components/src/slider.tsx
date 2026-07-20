/**
 * Slider — range slider for numeric input.
 *
 * ```tsx
 * const value = signal(50)
 * <Slider value={value} min={0} max={100} />
 * <Slider value={range} min={0} max={100} step={10} showValue />
 * ```
 */
import { signal, computed } from 'weifuwu/client'
import type { Signal } from 'weifuwu/client'
import { cn } from './cn.ts'

export interface SliderProps {
  value?: Signal<number>
  defaultValue?: number
  min?: number
  max?: number
  step?: number
  showValue?: boolean
  disabled?: boolean
  onChange?: (v: number) => void
  class?: string
}

export function Slider(props: SliderProps) {
  const { min = 0, max = 100, step = 1, showValue, disabled, onChange, class: extraClass } = props
  const val = props.value ?? signal(props.defaultValue ?? min)

  function handleInput(e: Event) {
    const v = Number((e.target as HTMLInputElement).value)
    val.value = v
    onChange?.(v)
  }

  const pct = computed(() => ((val.value - min) / (max - min)) * 100)

  const inputProps: any = {
    type: 'range',
    min, max, step,
    value: val.value,
    disabled,
    class: 'absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed z-10',
    onInput: handleInput,
  }

  return (
    <div class={cn('flex items-center gap-3', extraClass)}>
      <div class="relative flex-1 h-2">
        <div class="absolute inset-0 rounded-full bg-gray-200" />
        <div
          class={cn(
            'absolute top-0 left-0 h-full rounded-full transition-all',
            disabled ? 'bg-gray-300' : 'bg-blue-600',
          )}
          style={computed(() => ({ width: `${pct.value}%` })) as any}
        />
        <input {...inputProps} />
        <div
          class={cn(
            'absolute top-1/2 -translate-y-1/2 size-4 rounded-full border-2 border-blue-600 bg-white shadow-sm -translate-x-1/2 transition-all pointer-events-none',
            disabled && 'border-gray-300',
          )}
          style={computed(() => ({ left: `${pct.value}%` })) as any}
        />
      </div>
      {showValue && (
        <span class="text-sm text-gray-600 min-w-[3ch] tabular-nums">{val.value}</span>
      )}
    </div>
  )
}
