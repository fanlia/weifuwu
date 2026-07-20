/**
 * Checkbox — single checkbox.
 * CheckboxGroup — group of checkboxes.
 *
 * ```tsx
 * const checked = signal(false)
 * <Checkbox value={checked}>同意条款</Checkbox>
 *
 * const selected = signal<string[]>(['vue'])
 * <CheckboxGroup value={selected} options={[
 *   { value: 'react', label: 'React' },
 *   { value: 'vue', label: 'Vue' },
 *   { value: 'svelte', label: 'Svelte' },
 * ]} />
 * ```
 */
import { signal, computed } from 'weifuwu/client'
import type { Signal } from 'weifuwu/client'
import { cn } from './cn.ts'

export interface CheckboxProps {
  value?: Signal<boolean>
  defaultValue?: boolean
  onChange?: (v: boolean) => void
  disabled?: boolean
  label?: string
  class?: string
  children?: any
}

export function Checkbox(props: CheckboxProps) {
  const val = props.value ?? signal(props.defaultValue ?? false)

  function toggle() {
    if (props.disabled) return
    val.value = !val.value
    props.onChange?.(val.value)
  }

  return (
    <label class={cn('inline-flex items-center gap-2 cursor-pointer', props.disabled && 'opacity-50 cursor-not-allowed', props.class)}>
      <input
        type="checkbox"
        checked={val.value}
        disabled={props.disabled}
        class="size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
        onChange={toggle}
      />
      {props.children && <span class="text-sm text-gray-700">{props.children}</span>}
      {props.label && <span class="text-sm text-gray-700">{props.label}</span>}
    </label>
  )
}

export interface CheckboxOption {
  value: string
  label: string
}

export interface CheckboxGroupProps {
  value?: Signal<string[]>
  defaultValue?: string[]
  options: CheckboxOption[]
  onChange?: (v: string[]) => void
  direction?: 'horizontal' | 'vertical'
  class?: string
}

export function CheckboxGroup(props: CheckboxGroupProps) {
  const { options, direction = 'vertical', onChange, class: extraClass } = props
  const selected = props.value ?? signal(props.defaultValue ?? [])

  function toggle(val: string) {
    const current = selected.value
    const idx = current.indexOf(val)
    const next = idx >= 0
      ? current.filter(v => v !== val)
      : [...current, val]
    selected.value = next
    onChange?.(next)
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
            type="checkbox"
            checked={selected.value.includes(opt.value)}
            class="size-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
            onChange={() => toggle(opt.value)}
          />
          <span class="text-sm text-gray-700">{opt.label}</span>
        </label>
      ))}
    </div>
  )
}
