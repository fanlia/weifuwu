/**
 * Switch — toggle control.
 *
 * ```tsx
 * const enabled = signal(false)
 * <Switch value={enabled} />
 * ```
 */
import { signal, computed } from 'weifuwu/client'
import type { Signal } from 'weifuwu/client'
import { cn } from './cn.ts'

export interface SwitchProps {
  value?: Signal<boolean>
  defaultValue?: boolean
  onChange?: (v: boolean) => void
  disabled?: boolean
  label?: string
  class?: string
}

export function Switch(props: SwitchProps) {
  const val = props.value ?? signal(props.defaultValue ?? false)

  function toggle() {
    if (props.disabled) return
    val.value = !val.value
    props.onChange?.(val.value)
  }

  return (
    <label class={cn('inline-flex items-center gap-2 cursor-pointer', props.disabled && 'opacity-50 cursor-not-allowed', props.class)}>
      <button
        type="button"
        role="switch"
        aria-checked={val}
        disabled={props.disabled}
        class={cn(
          'relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
          computed(() => val.value ? 'bg-blue-600' : 'bg-gray-200'),
        )}
        onClick={toggle}
      >
        <span class={cn(
          'pointer-events-none inline-block size-4 rounded-full bg-white shadow transition-transform',
          computed(() => val.value ? 'translate-x-4' : 'translate-x-0'),
        )} />
      </button>
      {props.label && <span class="text-sm text-gray-700">{props.label}</span>}
    </label>
  )
}
