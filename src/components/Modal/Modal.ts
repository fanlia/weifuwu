/**
 * weifuwu/components — Modal
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, createPortal } from '../../client/vnode.ts'
import { lockScroll, unlockScroll } from '../../client/scroll-lock.ts'
import { trapFocus } from '../../client/focus-trap.ts'

export interface ModalProps {
  open?: boolean
  title?: string
  onClose?: () => void
  children?: any
  footer?: any
}

export const Modal: Component<ModalProps> = (_props, ctx) => {
  // ── mount（只一次）──
  const $ = ctx.ui.$
  $.exiting = false
  let prevOpen: boolean | undefined

  ctx.ui.onmounted((el) => {
    lockScroll()
    const cleanupFocus = trapFocus(el as HTMLElement)
    return () => { unlockScroll(); cleanupFocus() }
  })

  // ── render（每次 dirty/props 变化）──
  return (props: ModalProps) => {
    const { open, title, onClose, children, footer } = props
    const ML = (ctx as any)?.i18n?.components?.Modal ?? {}

    if (prevOpen !== open) {
      prevOpen = open
      if (open && $.exiting) $.exiting = false
    }

    const startClose = () => {
      $.exiting = true
      setTimeout(() => { $.exiting = false; onClose?.() }, 300)
    }
    const onExitEnd = () => { $.exiting = false; onClose?.() }

    if (!open && !$.exiting) return null
    const isClosing = $.exiting

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isClosing) startClose()
    }

    const overlay = h('div', {
      class: 'wf-modal-overlay',
      onClick: isClosing ? undefined : startClose,
    })

    const closeBtn = h('button', {
      class: 'wf-modal-close',
      onClick: isClosing ? undefined : startClose,
      type: 'button',
    }, '✕')

    const titleEl = title
      ? h('div', { class: 'wf-modal-header' }, [title, closeBtn])
      : null

    const bodyEl = h('div', { class: 'wf-modal-body' }, children)

    const footerEl = footer
      ? h('div', { class: 'wf-modal-footer' }, footer)
      : null

    const content = h('div', {
      class: 'wf-modal-content',
      onClick: (e: Event) => e.stopPropagation(),
    }, [titleEl, bodyEl, footerEl].filter(Boolean))

    const cls = isClosing ? 'wf-modal wf-modal--exit' : 'wf-modal wf-modal--enter'

    const root = h('div', {
      class: cls,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title ?? (ML.ariaLabel ?? '弹窗'),
      onKeyDown: handleKeyDown,
      onAnimationEnd: isClosing ? onExitEnd : undefined,
    }, [overlay, content])

    return createPortal(root, 'modal')
  }
}
