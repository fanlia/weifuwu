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
  let prevOpen: boolean | undefined

  ctx.ui.onmounted((el) => {
    lockScroll()
    const cleanupFocus = trapFocus(el as HTMLElement)
    return () => { unlockScroll(); cleanupFocus() }
  })

  return (props: ModalProps) => {
    const { open, title, onClose, children, footer } = props
    const ML = (ctx as any)?.i18n?.components?.Modal ?? {}

    if (prevOpen !== open) {
      prevOpen = open
    }

    if (!open) return null

    const overlay = h('div', {
      class: 'wf-modal-overlay',
      onClick: onClose,
    })

    const closeBtn = h('button', {
      class: 'wf-modal-close',
      onClick: onClose,
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

    const root = h('div', {
      class: 'wf-modal wf-modal--enter',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title ?? (ML.ariaLabel ?? '弹窗'),
    }, [overlay, content])

    return createPortal(root, 'modal')
  }
}
