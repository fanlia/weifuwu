/**
 * Select — dropdown selector with search.
 *
 * ```tsx
 * const city = signal('')
 * <Select
 *   value={city}
 *   options={[
 *     { value: 'beijing', label: '北京' },
 *     { value: 'shanghai', label: '上海' },
 *   ]}
 *   placeholder="选择城市"
 * />
 * ```
 */
import { signal, computed } from 'weifuwu/client'
import type { Signal } from 'weifuwu/client'
import { cn } from './cn.ts'
import { createClickAway } from './primitives/click-away.ts'
import { createFloating } from './primitives/floating.ts'
import { createPortal } from 'weifuwu/client'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps {
  value?: Signal<string>
  defaultValue?: string
  options: SelectOption[]
  placeholder?: string
  searchable?: boolean
  disabled?: boolean
  onChange?: (v: string) => void
  class?: string
}

export function Select(props: SelectProps, ctx: any) {
  const { options, placeholder = '请选择', searchable = false, disabled = false, onChange, class: extraClass } = props
  const val = props.value ?? signal(props.defaultValue ?? '')
  const isOpen = signal(false)
  const search = signal('')
  let anchorEl: HTMLElement | null = null
  let floatingEl: HTMLElement | null = null

  function setAnchorRef(el: HTMLElement) { anchorEl = el }
  function setFloatingRef(el: HTMLElement) {
    floatingEl = el
    if (anchorEl && floatingEl) {
      createFloating(anchorEl, floatingEl, { placement: 'bottom-start', gap: 4 })
      createClickAway(floatingEl, () => isOpen.value = false)
      createClickAway(anchorEl, (e) => {
        if (floatingEl && !floatingEl.contains(e.target as Node) && e.target !== anchorEl) isOpen.value = false
      })
    }
  }

  const selectedLabel = computed(() => {
    const v = val.value
    if (!v) return ''
    return options.find(o => o.value === v)?.label ?? v
  })

  const filtered = computed(() => {
    const q = search.value.toLowerCase()
    return q ? options.filter(o => o.label.toLowerCase().includes(q)) : options
  })

  function toggle() { if (!disabled) isOpen.value = !isOpen.value }
  function select(v: string) {
    val.value = v
    isOpen.value = false
    search.value = ''
    onChange?.(v)
  }

  return (
    <div class={cn('relative', extraClass)}>
      {/* Trigger */}
      <div ref={setAnchorRef}>
        <button
          type="button"
          disabled={disabled}
          class={cn(
            'flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
            disabled ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : 'bg-white text-gray-900 cursor-pointer',
            val.value ? 'text-gray-900' : 'text-gray-400',
          )}
          onClick={toggle}
        >
          <span>{selectedLabel || placeholder}</span>
          <span class={cn('ml-2 transition-transform', computed(() => isOpen.value ? 'rotate-180' : ''))}>▼</span>
        </button>
      </div>

      {/* Dropdown */}
      {computed(() => {
        if (!isOpen.value) return null
        const items = filtered.value
        return createPortal(
          <div
            ref={setFloatingRef}
            class="z-50 min-w-[var(--trigger-width)] bg-white rounded-lg border border-gray-200 shadow-lg overflow-hidden"
          >
            {searchable && (
              <div class="p-2 border-b border-gray-100">
                <input
                  type="text"
                  class="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="搜索..."
                  value={search.value}
                  onInput={(e: Event) => search.value = (e.target as HTMLInputElement).value}
                />
              </div>
            )}
            <div class="max-h-48 overflow-y-auto py-1">
              {items.length === 0 ? (
                <div class="px-3 py-2 text-sm text-gray-400">无匹配</div>
              ) : (
                items.map(item => (
                  <button
                    type="button"
                    class={cn(
                      'w-full text-left px-3 py-2 text-sm transition-colors',
                      item.value === val.value ? 'bg-blue-50 text-blue-700' : 'text-gray-700 hover:bg-gray-100',
                    )}
                    onClick={() => select(item.value)}
                  >
                    {item.label}
                  </button>
                ))
              )}
            </div>
          </div>,
          document.body
        )
      })}
    </div>
  )
}
