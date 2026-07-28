/**
 * weifuwu/components — Drawer
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, createPortal } from '../../client/vnode.ts'
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

export const Drawer: Component<DrawerProps> = (_props, ctx) => {
  // ── mount（只一次）──
  const $ = ctx.ui.$
  $.exiting = false
  let prevOpen: boolean | undefined

  // ── render（每次 dirty/props 变化）──
  return (props: DrawerProps) => {
    const { open, title, position = 'right', onClose, children, footer } = props
    const DL = (ctx as any)?.i18n?.components?.Drawer ?? {}

    if (prevOpen !== open) {
      prevOpen = open
      if (open && $.exiting) $.exiting = false
    }

    const startClose = () => { $.exiting = true }
    const onExitEnd = () => { $.exiting = false; onClose?.() }

    if (!open && !$.exiting) return null
    const isClosing = $.exiting

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isClosing) startClose()
    }

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

    const cls = isClosing
      ? `wf-drawer wf-drawer--${position} wf-drawer--exit`
      : `wf-drawer wf-drawer--${position} wf-drawer--enter`

    const root = h('div', {
      class: cls,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title ?? (DL.ariaLabel ?? '侧边面板'),
      onKeyDown: handleKeyDown,
      ref: drawerRef,
    }, [overlay, panel])

    return createPortal(root, 'drawer')
  }
}
