import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, Fragment } from '../../client/vnode.ts'

export interface ModalProps {
  open?: boolean
  title?: string
  onClose?: () => void
  children?: any
  footer?: any
}

export const Modal: Component<ModalProps> = (props, ctx) => {
  const { open, title, onClose, children, footer } = props

  if (!open) return null

  // ESC 关闭
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && onClose) onClose()
  }

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

  return h('div', {
    class: 'wf-modal',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': title ?? '弹窗',
    onKeyDown: handleKeyDown,
  }, [overlay, content])
}
