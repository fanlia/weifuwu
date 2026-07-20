/**
 * Popover — floating card with content, triggered by click.
 *
 * ```tsx
 * <Popover content={<div class="p-4"><p>这是弹出内容</p></div>}>
 *   <Button>点击我</Button>
 * </Popover>
 * ```
 */
import { signal, computed, onCleanup, createPortal } from 'weifuwu/client'
import { cn } from './cn.ts'
import { createFloating } from './primitives/floating.ts'
import { createClickAway } from './primitives/click-away.ts'
import type { Placement } from './primitives/floating.ts'

export interface PopoverProps {
  content: any
  trigger?: 'click' | 'hover'
  placement?: Placement
  class?: string
  children?: any
}

export function Popover(props: PopoverProps) {
  const { content, trigger = 'click', placement = 'bottom', class: extraClass, children } = props
  const isOpen = signal(false)
  let anchorEl: HTMLElement | null = null
  let floatingEl: HTMLElement | null = null

  function setAnchorRef(el: HTMLElement) { anchorEl = el }

  function onOpenChange(open: boolean) {
    isOpen.value = open
    if (open && anchorEl) {
      // Delay to allow DOM to render floating element
      requestAnimationFrame(() => {
        if (floatingEl) createFloating(anchorEl!, floatingEl!, { placement, gap: 8 })
      })
    }
  }

  function setFloatingRef(el: HTMLElement) {
    if (!el) return
    floatingEl = el
    if (anchorEl) createFloating(anchorEl, el, { placement, gap: 8 })
    createClickAway(el, () => isOpen.value = false)
    onCleanup(() => { /* cleanup handled by createClickAway return */ })
  }

  const toggle = trigger === 'click'
    ? () => onOpenChange(!isOpen.value)
    : undefined

  const hoverHandlers = trigger === 'hover' ? {
    onMouseEnter: () => onOpenChange(true),
    onMouseLeave: () => isOpen.value = false,
  } : {}

  return (
    <div class={cn('inline-flex', extraClass)} {...hoverHandlers as any}>
      {/* Trigger */}
      <div ref={setAnchorRef} onClick={toggle}>
        {children}
      </div>

      {/* Content */}
      {computed(() => {
        if (!isOpen.value) return null
        return createPortal(
          <div
            ref={setFloatingRef}
            class="z-50 bg-white rounded-lg border border-gray-200 shadow-lg min-w-[200px]"
            onMouseDown={(e: MouseEvent) => e.preventDefault()}
          >
            {content}
          </div>,
          document.body
        )
      })}
    </div>
  )
}
