/**
 * RadioGroup — single selection from options.
 *
 * ```tsx
 * const selected = signal('option-1')
 * <RadioGroup value={selected} options={[
 *   { value: 'option-1', label: '选项一' },
 *   { value: 'option-2', label: '选项二' },
 * ]} />
 * ```
 */
import { signal } from 'weifuwu/client'
import type { Signal } from 'weifuwu/client'
import { cn } from './cn.ts'

export interface RadioOption {
  value: string
  label: string
}

export interface RadioGroupProps {
  value?: Signal<string>
  defaultValue?: string
  options: RadioOption[]
  onChange?: (v: string) => void
  direction?: 'horizontal' | 'vertical'
  class?: string
}

export function RadioGroup(props: RadioGroupProps) {
  const { options, direction = 'vertical', onChange, class: extraClass } = props
  const selected = props.value ?? signal(props.defaultValue ?? '')

  function select(val: string) {
    selected.value = val
    onChange?.(val)
  }

  return (
    <div class={cn(
      'flex gap-3',
      direction === 'vertical' ? 'flex-col' : 'flex-row flex-wrap',
      extraClass,
    )}>
      {options.map(opt => (
        <label class="inline-flex items-center gap-2 cursor-pointer">
          <input
            type="radio"
            name={`radio-group-${(props as any)._uid ?? 0}`}
            value={opt.value}
            checked={selected.value === opt.value}
            class="size-4 border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            onChange={() => select(opt.value)}
          />
          <span class="text-sm text-gray-700">{opt.label}</span>
        </label>
      ))}
    </div>
  )
}
