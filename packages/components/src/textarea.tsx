/**
 * Textarea — multi-line text input with auto-resize.
 *
 * ```tsx
 * <Textarea value={bio} placeholder="自我介绍" />
 * <Textarea label="备注" rows={4} />
 * ```
 */
import { computed } from 'weifuwu/client'
import type { Signal } from 'weifuwu/client'
import { cn } from './cn.ts'

export interface TextareaProps {
  value?: Signal<string>
  defaultValue?: string
  onInput?: (v: string) => void
  placeholder?: string
  label?: string
  rows?: number
  autoResize?: boolean
  error?: Signal<string | null> | string | null
  disabled?: boolean
  required?: boolean
  class?: string
}

export function Textarea(props: TextareaProps) {
  const { value: val, defaultValue, onInput, placeholder, label, rows = 3, autoResize = true, error, disabled, required, class: extraClass } = props

  const err = computed(() => {
    const e = error
    return typeof e === 'string' ? e : e?.value ?? null
  })

  function handleInput(e: Event) {
    const el = e.target as HTMLTextAreaElement
    if (val) val.value = el.value
    onInput?.(el.value)
    if (autoResize) autoResizeTextarea(el)
  }

  function autoResizeTextarea(el: HTMLTextAreaElement) {
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  const textarea = (
    <textarea
      value={val ? val.value : (defaultValue ?? '')}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      required={required}
      aria-invalid={err}
      class={cn(
        'block w-full rounded-lg border px-3 py-2 text-sm transition-colors resize-y',
        'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
        computed(() => err.value ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'),
        disabled && 'bg-gray-50 text-gray-400 cursor-not-allowed',
        extraClass,
      )}
      onInput={handleInput}
    />
  )

  if (label) {
    return (
      <div>
        <label class="block text-sm font-medium text-gray-700 mb-1">
          {label}
          {required && <span class="text-red-500 ml-0.5">*</span>}
        </label>
        {textarea}
        {err && computed(() => err.value ? <p class="mt-1 text-sm text-red-600">{err.value}</p> : null)}
      </div>
    )
  }

  return textarea
}
