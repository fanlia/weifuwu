import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export type DrawerPosition = 'left' | 'right'

export interface DrawerProps {
  open?: boolean
  title?: string
  position?: DrawerPosition
  onClose?: () => void
  children?: any
  footer?: any
}

export const Drawer: Component<DrawerProps> = (props, ctx) => {
  const { open, title, position = 'right', onClose, children, footer } = props

  if (!open) return null

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && onClose) onClose()
  }

  const overlay = h('div', {
    class: 'wf-drawer-overlay',
    onClick: onClose,
  })

  const closeBtn = h('button', {
    class: 'wf-drawer-close',
    onClick: onClose,
    type: 'button',
    'aria-label': '关闭',
  }, '✕')

  const titleEl = title
    ? h('div', { class: 'wf-drawer-header' }, [title, closeBtn])
    : null

  const bodyEl = h('div', { class: 'wf-drawer-body' }, children)

  const footerEl = footer
    ? h('div', { class: 'wf-drawer-footer' }, footer)
    : null

  const panel = h('div', {
    class: `wf-drawer-panel wf-drawer-panel--${position}`,
    onClick: (e: Event) => e.stopPropagation(),
  }, [titleEl, bodyEl, footerEl].filter(Boolean))

  return h('div', {
    class: `wf-drawer wf-drawer--${position}`,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': title ?? '侧边面板',
    onKeyDown: handleKeyDown,
  }, [overlay, panel])
}
