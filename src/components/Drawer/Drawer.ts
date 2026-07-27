import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
import { lockScroll, unlockScroll } from '../../client/scroll-lock.ts'
import { trapFocus } from '../../client/focus-trap.ts'

export type DrawerPosition = 'left' | 'right'

export interface DrawerProps {
  open?: boolean
  title?: string
  position?: DrawerPosition
  onClose?: () => void
  children?: any
  footer?: any
}

const DRAWER_EXIT_DURATION = 200

export const Drawer: Component<DrawerProps> = (props, ctx) => {
  const { open, title, position = 'right', onClose, children, footer } = props
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.prevOpen = open; $.closing = false; $.locked = false }

  // 检测 open 从 true→false 的切换，启动退出动画
  if (!open && $.prevOpen && !$.closing) {
    $.closing = true
    setTimeout(() => { $.closing = false }, DRAWER_EXIT_DURATION)
  }
  if (open && $.closing) $.closing = false
  $.prevOpen = open

  // ScrollLock
  if (open && !$.locked) { $.locked = true; lockScroll() }
  if (!open && $.locked) { $.closing = false; unlockScroll(); $.locked = false }

  // closed 状态且无退出动画 → 不渲染
  if (!open && !$.closing) return null

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

  const DL = (ctx as any)?.i18n?.components?.Drawer ?? {}
  const drawerClass = $.closing
    ? `wf-drawer wf-drawer--${position} wf-drawer--exit`
    : `wf-drawer wf-drawer--${position} wf-drawer--enter`

  return h('div', {
    class: drawerClass,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': title ?? (DL.ariaLabel ?? '侧边面板'),
    onKeyDown: handleKeyDown,
    ref: (el: HTMLElement | null) => {
      if (el && open) return trapFocus(el)
    },
  }, [overlay, panel])
}
