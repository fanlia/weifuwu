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
  let prevOpen: boolean | undefined
  let focusCleanup: (() => void) | undefined

  const rootRef = (el: any) => {
    if (el) {
      lockScroll()
      const panelEl = el.querySelector('.wf-drawer') ?? el
      focusCleanup = trapFocus(panelEl as HTMLElement)
    } else {
      unlockScroll()
      focusCleanup?.()
    }
  }

  return (props: DrawerProps) => {
    const { open, title, position = 'right', onClose, children, footer } = props
    const DL = (ctx as any)?.i18n?.components?.Drawer ?? {}

    if (prevOpen !== open) {
      prevOpen = open
    }

    if (!open) return null

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

    const root = h('div', {
      ref: rootRef,
      class: `wf-drawer wf-drawer--${position} wf-drawer--enter`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title ?? (DL.ariaLabel ?? '侧边面板'),
      tabIndex: -1,
      onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.() },
    }, [overlay, panel])

    return createPortal(root, 'drawer')
  }
}
