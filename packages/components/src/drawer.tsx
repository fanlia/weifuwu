/**
 * Drawer — side panel overlay with focus trap and scroll lock.
 *
 * ```tsx
 * const isOpen = signal(false)
 * <Drawer open={isOpen} title="详情" placement="right" onClose={() => isOpen.value = false}>
 *   <p>抽屉内容</p>
 * </Drawer>
 * ```
 */
import { computed, onCleanup, createPortal } from 'weifuwu/client'
import type { Signal } from 'weifuwu/client'
import { cn } from './cn.ts'
import { createFocusTrap } from './primitives/focus-trap.ts'
import { scrollLock } from './primitives/scroll-lock.ts'

export interface DrawerProps {
  open: Signal<boolean>
  title?: string
  placement?: 'left' | 'right'
  size?: 'sm' | 'md' | 'lg'
  closeOnOverlay?: boolean
  onClose?: () => void
  class?: string
  children?: any
}

const drawerWidths: Record<string, string> = {
  sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl',
}

export function Drawer(props: DrawerProps, ctx: any) {
  const { open, title, placement = 'right', size = 'md', closeOnOverlay = true, onClose, class: extraClass, children } = props

  function close() { open.value = false; onClose?.() }
  function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape') close() }

  function setPanelRef(el: HTMLDivElement) {
    if (el) {
      createFocusTrap(el)
      const unlock = scrollLock()
      onCleanup(() => unlock())
    }
  }

  return computed(() => {
    if (!open.value) return null

    const translateFrom = placement === 'left' ? '-translate-x-full' : 'translate-x-full'
    const alignClasses = placement === 'left' ? 'left-0' : 'right-0'

    return createPortal(
      <div class="fixed inset-0 z-50 flex" onKeyDown={onKeyDown}>
        {/* Overlay */}
        <div
          class="absolute inset-0 bg-black/50 transition-opacity"
          onClick={closeOnOverlay ? close : undefined}
        />

        {/* Panel */}
        <div
          ref={setPanelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          class={cn(
            'relative z-10 h-full w-full bg-white shadow-xl flex flex-col',
            'transition-transform duration-300',
            alignClasses,
            drawerWidths[size],
            extraClass,
          )}
        >
          {/* Header */}
          {title && (
            <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 class="text-lg font-semibold text-gray-900">{title}</h2>
              <button type="button" class="size-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100" onClick={close} aria-label="关闭">✕</button>
            </div>
          )}

          {/* Content */}
          <div class="flex-1 overflow-y-auto px-6 py-4">{children}</div>
        </div>
      </div>,
      document.body
    )
  })
}
