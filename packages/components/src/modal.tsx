/**
 * Modal — dialog overlay with focus trap, scroll lock, and keyboard dismiss.
 *
 * ```tsx
 * const isOpen = signal(false)
 * <Modal open={isOpen} title="确认" onClose={() => isOpen.value = false}>
 *   <p>确定删除？</p>
 * </Modal>
 * ```
 */
import { signal, computed, onCleanup, createPortal } from 'weifuwu/client'
import type { Signal } from 'weifuwu/client'
import { cn } from './cn.ts'
import { createFocusTrap } from './primitives/focus-trap.ts'
import { scrollLock } from './primitives/scroll-lock.ts'

export interface ModalProps {
  open: Signal<boolean>
  title?: string
  size?: 'sm' | 'md' | 'lg' | 'full'
  closeOnOverlay?: boolean
  onClose?: () => void
  class?: string
  children?: any
}

const sizeClasses: Record<string, string> = {
  sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', full: 'max-w-[90vw] max-h-[90vh]',
}

export function Modal(props: ModalProps, ctx: any) {
  const { open, title, size = 'md', closeOnOverlay = true, onClose, class: extraClass, children } = props
  let panelEl: HTMLDivElement | null = null
  const mounted = signal(false)

  function close() { open.value = false; onClose?.() }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === 'Escape') close()
  }

  function setPanelRef(el: HTMLDivElement) {
    panelEl = el
    if (panelEl) {
      createFocusTrap(panelEl)
      const unlock = scrollLock()
      onCleanup(() => unlock())
    }
  }

  function onOverlayClick() { if (closeOnOverlay) close() }

  return computed(() => {
    if (!open.value) return null

    return createPortal(
      <div class="fixed inset-0 z-50 flex items-center justify-center" onKeyDown={onKeyDown}>
        <div class="absolute inset-0 bg-black/50" onClick={onOverlayClick} />
        <div
          ref={setPanelRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          class={cn(
            'relative z-10 w-full bg-white rounded-xl shadow-xl max-h-[85vh] overflow-y-auto',
            sizeClasses[size], extraClass,
          )}
        >
          {title && (
            <div class="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 class="text-lg font-semibold text-gray-900">{title}</h2>
              <button type="button" class="size-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100" onClick={close} aria-label="关闭">✕</button>
            </div>
          )}
          <div class="px-6 py-4">{children}</div>
        </div>
      </div>,
      document.body
    )
  })
}
