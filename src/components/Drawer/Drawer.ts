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
  // usePopup 会话级模态（统一弹窗能力）：presence 退场状态机 + 焦点 trap + 滚动锁
  let latestOpen = false
  const popup = ctx.ui.usePopup({
    presence: true,
    trapFocus: true,
    lockScroll: true,
    positioning: 'none',
    closeOnOutside: false,
    closeOnEscape: false,
    isOpen: () => latestOpen,
    setOpen: () => {},
  })
  // ESC 关闭（document 级——焦点在 trap 外也可关闭；phase=open 才触发避免 exit 期间重复）
  let latestOnClose: (() => void) | undefined
  ctx.ui.useGlobalKey((e: KeyboardEvent) => {
    if (e.key === 'Escape' && popup.phase === 'open') latestOnClose?.()
  })

  return async (props: DrawerProps) => {
    const { open, title, position = 'right', onClose, children, footer, width } = props
    latestOnClose = onClose
    const DL = (ctx as any)?.i18n?.components?.Drawer ?? {}
    latestOpen = !!open
    const phase = popup.sync!(latestOpen)

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
      
      onClick: (e: Event) => e.stopPropagation(),
    }, [titleEl, bodyEl, footerEl].filter(Boolean))

    const root = h('div', {
      
      class: `wf-drawer wf-drawer--${position} ${phase === 'exit' ? 'wf-drawer--exit' : 'wf-drawer--enter'}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title ?? (DL.ariaLabel ?? '侧边面板'),
      tabIndex: -1,
      onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.() },
    }, [overlay, panel])

    return popup.portal(root, 'drawer')
  }
}
