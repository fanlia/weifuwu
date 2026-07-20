/**
 * Tooltip — text hint on hover.
 *
 * ```tsx
 * <Tooltip content="保存草稿">
 *   <Button>保存</Button>
 * </Tooltip>
 * ```
 */
import { signal, computed, onCleanup, createPortal } from 'weifuwu/client'
import { cn } from './cn.ts'
import { createFloating } from './primitives/floating.ts'
import type { Placement } from './primitives/floating.ts'

export interface TooltipProps {
  content: string
  placement?: Placement
  delay?: number
  class?: string
  children?: any
}

export function Tooltip(props: TooltipProps) {
  const { content, placement = 'top', delay = 200, class: extraClass, children } = props
  const isVisible = signal(false)
  let anchorEl: HTMLElement | null = null
  let floatingEl: HTMLElement | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  function setAnchorRef(el: HTMLElement) {
    anchorEl = el
  }

  function setFloatingRef(el: HTMLElement) {
    if (!el) return
    floatingEl = el
    if (anchorEl) {
      createFloating(anchorEl, el, { placement, gap: 4 })
    }
  }

  function show() {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { isVisible.value = true }, delay)
  }
  function hide() {
    if (timer) clearTimeout(timer)
    timer = null
    isVisible.value = false
  }

  return (
    <div class={cn('inline-flex', extraClass)} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      <div ref={setAnchorRef}>{children}</div>

      {computed(() => {
        if (!isVisible.value || !content) return null
        return createPortal(
          <div
            ref={setFloatingRef}
            class="z-[9999] px-2 py-1 text-xs text-white bg-gray-800 rounded-md shadow-sm whitespace-nowrap pointer-events-none"
            role="tooltip"
          >
            {content}
          </div>,
          document.body
        )
      })}
    </div>
  )
}
