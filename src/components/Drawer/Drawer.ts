/**
 * weifuwu/components — Drawer
 */

import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h, createPortal } from '../../ui-dom/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

export type DrawerPosition = 'left' | 'right'

export interface DrawerProps {
  open?: boolean
  title?: string
  position?: DrawerPosition
  onClose?: () => void
  children?: any
  footer?: any
  /** 面板宽度（默认 360px——--wf-drawer-width 变量） */
  width?: string
}

export const Drawer: Component<DrawerProps> = async (_props, ctx) => {
  // useDialog：退场状态机（open → exit → closed）+ 滚动锁 + 焦点 trap + animationend 卸载
  const dialog = ctx.ui.useDialog({ name: 'Drawer' })

  return (props: DrawerProps) => {
    const { open, title, position = 'right', onClose, children, footer, width } = props
    const DL = (ctx as any)?.i18n?.components?.Drawer ?? {}
    const phase = dialog.sync(!!open)

    if (phase === 'closed') return null

    const overlay = h('div', {
      class: 'wf-drawer-overlay',
      onClick: onClose,
    })

    const closeBtn = h('button', {
      class: 'wf-drawer-close',
      onClick: onClose,
      type: 'button',
      'aria-label': DL.closeAria ?? '关闭',
    }, h(Icon, { name: 'close' }))

    const titleEl = title
      ? h('div', { class: 'wf-drawer-header' }, [title, closeBtn])
      : null

    const bodyEl = h('div', { class: 'wf-drawer-body' }, children)
    const footerEl = footer
      ? h('div', { class: 'wf-drawer-footer' }, footer)
      : null

    const panel = h('div', {
      class: `wf-drawer-panel wf-drawer-panel--${position}`,
      style: width ? { '--wf-drawer-width': width } : undefined,
      ref: dialog.panelRef,
      onClick: (e: Event) => e.stopPropagation(),
    }, [titleEl, bodyEl, footerEl].filter(Boolean))

    const root = h('div', {
      ref: dialog.rootRef,
      class: `wf-drawer wf-drawer--${position} ${phase === 'exit' ? 'wf-drawer--exit' : 'wf-drawer--enter'}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title ?? (DL.ariaLabel ?? '侧边面板'),
      tabIndex: -1,
      onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.() },
    }, [overlay, panel])

    return createPortal(root, 'drawer')
  }
}
