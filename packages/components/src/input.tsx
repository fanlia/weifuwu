/**
 * Input — text input with label, error state, and addons.
 *
 * ```tsx
 * <Input value={name} placeholder="请输入姓名" />
 * <Input label="邮箱" error={computed(() => form.errors.value.email)} />
 * ```
 */
import { computed } from 'weifuwu/client'
import type { Signal } from 'weifuwu/client'
import { cn } from './cn.ts'

export interface InputProps {
  value?: Signal<string>
  defaultValue?: string
  onInput?: (v: string) => void
  type?: string
  placeholder?: string
  label?: string
  error?: Signal<string | null> | string | null
  disabled?: boolean
  required?: boolean
  class?: string
}

export function Input(props: InputProps) {
  const val = props.value
  const err = computed(() => {
    const e = props.error
    return typeof e === 'string' ? e : e?.value ?? null
  })

  function onInput(e: Event) {
    const v = (e.target as HTMLInputElement).value
    if (val) val.value = v
    props.onInput?.(v)
  }

  const input = (
    <input
      type={props.type ?? 'text'}
      value={val ? val.value : (props.defaultValue ?? '')}
      placeholder={props.placeholder}
      disabled={props.disabled}
      required={props.required}
      aria-invalid={err}
      class={cn(
        'block w-full rounded-lg border px-3 py-2 text-sm transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
        computed(() => err.value ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'),
        props.disabled && 'bg-gray-50 text-gray-400 cursor-not-allowed',
        props.class,
      )}
      onInput={onInput}
    />
  )

  if (props.label) {
    return (
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          {props.label}
          {props.required && <span class="text-red-500 ml-0.5">*</span>}
        </label>
        {input}
        {err && computed(() => err.value ? <p class="mt-1 text-sm text-red-600">{err.value}</p> : null)}
      </div>
    )
  }

  return input
}
