/**
 * Dropdown — menu anchored to a trigger button.
 *
 * ```tsx
 * <Dropdown
 *   trigger={<Button variant="outline">操作</Button>}
 *   items={[
 *     { label: '编辑', onClick: () => edit(item) },
 *     { label: '删除', onClick: () => remove(item), variant: 'danger' },
 *     { type: 'separator' },
 *     { label: '详情', onClick: () => view(item) },
 *   ]}
 * />
 * ```
 */
import { signal, computed, Show, onCleanup, createPortal } from 'weifuwu/client'
import type { Signal, Component } from 'weifuwu/client'
import { cn } from './cn.ts'
import { createFloating } from './primitives/floating.ts'
import { createClickAway } from './primitives/click-away.ts'
import type { Placement } from './primitives/floating.ts'

export interface DropdownItem {
  label?: string
  onClick?: () => void
  variant?: 'default' | 'danger'
  disabled?: boolean
  icon?: string
  type?: 'item' | 'separator'
}

export interface DropdownProps {
  trigger: any  // JSX node for the trigger
  items: DropdownItem[]
  placement?: Placement
  align?: 'start' | 'end'
  class?: string
}

export function Dropdown(props: DropdownProps, ctx: any) {
  const { trigger, items, placement = 'bottom-end', class: extraClass } = props
  const open = signal(false)
  let anchorEl: HTMLElement | null = null
  let floatingEl: HTMLElement | null = null

  function setAnchorRef(el: HTMLElement) { anchorEl = el }
  function setFloatingRef(el: HTMLElement) { floatingEl = el }

  function toggle() { open.value = !open.value }
  function close() { open.value = false }

  // Setup floating positioning when opened
  computed(() => {
    if (!open.value) { floatingEl = null; return }
    // Will be set up after render via the floating ref callback
  })

  function onFloatingMount(el: HTMLElement) {
    floatingEl = el
    if (anchorEl && floatingEl) {
      const cleanup = createFloating(anchorEl, floatingEl, { placement })
      const cleanup2 = createClickAway(floatingEl, close)
      // Also click away on trigger
      const cleanup3 = createClickAway(anchorEl, (e) => {
        if (floatingEl && !floatingEl.contains(e.target as Node)) close()
      })
      onCleanup(() => { cleanup(); cleanup2(); cleanup3() })
    }
  }

  return (
    <div class={cn('relative inline-block', extraClass)}>
      {/* Trigger */}
      <div ref={setAnchorRef} onClick={toggle}>
        {trigger}
      </div>

      {/* Menu */}
      {computed(() => {
        if (!open.value) return null
        return createPortal(
          <div
            ref={onFloatingMount}
            class="z-50 min-w-[160px] bg-white rounded-lg border border-gray-200 shadow-lg py-1"
            role="menu"
          >
            {items.map((item) => {
              if (item.type === 'separator' || item.label === '-') {
                return <div class="my-1 border-t border-gray-100" />
              }
              return (
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  class={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
                    item.variant === 'danger' ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-100',
                    item.disabled && 'opacity-50 cursor-not-allowed',
                  )}
                  onClick={() => { item.onClick?.(); close() }}
                >
                  {item.icon && <span>{item.icon}</span>}
                  {item.label}
                </button>
              )
            })}
          </div>,
          document.body
        )
      })}
    </div>
  )
}
