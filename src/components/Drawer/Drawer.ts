/**
 * weifuwu/components — Drawer
 */

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

export const Drawer: Component<DrawerProps> = (props, ctx) => {
  const { open, title, position = 'right', onClose, children, footer } = props
  const $ = ctx.ui.$
  if (!ctx.ui.ready) { $.exiting = false; $.prevOpen = open }

  // 退出过程中重新打开 → 取消退出（仅在 open 从 false→true 时触发）
  if ($.prevOpen !== open) {
    $.prevOpen = open
    if (open && $.exiting) $.exiting = false
  }

  // 退出动画触发
  const startClose = () => { $.exiting = true }

  // 退出动画播完
  const onExitEnd = () => {
    $.exiting = false
    onClose?.()
  }

  // 完全关闭状态 → 不渲染
  if (!open && !$.exiting) return null

  const isClosing = $.exiting

  // ESC 关闭
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !isClosing) startClose()
  }

  // ScrollLock + FocusTrap
  const drawerRef = (el: HTMLElement | null) => {
    if (!el) return
    lockScroll()
    const cleanupFocus = trapFocus(el)
    return () => { unlockScroll(); cleanupFocus() }
  }

  const overlay = h('div', {
    class: 'wf-drawer-overlay',
    onClick: isClosing ? undefined : startClose,
  })

  const closeBtn = h('button', {
    class: 'wf-drawer-close',
    onClick: isClosing ? undefined : startClose,
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
    onAnimationEnd: isClosing ? onExitEnd : undefined,
  }, [titleEl, bodyEl, footerEl].filter(Boolean))

  const DL = (ctx as any)?.i18n?.components?.Drawer ?? {}
  const cls = isClosing
    ? `wf-drawer wf-drawer--${position} wf-drawer--exit`
    : `wf-drawer wf-drawer--${position} wf-drawer--enter`

  return h('div', {
    class: cls,
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': title ?? (DL.ariaLabel ?? '侧边面板'),
    onKeyDown: handleKeyDown,
    ref: drawerRef,
  }, [overlay, panel])
}
