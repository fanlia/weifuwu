/** Drawer：侧边面板，左右滑入 + ESC 关闭（showcase /components/drawer） */
/**
 * weifuwu/client/components — Drawer
 *
 * 2027-09 原语全面化 W1：行为面（openPopup 生命周期/焦点 trap/滚动锁/Esc/
 * 遮罩点击）→ useOverlay 契约——组件只写皮（overlay/panel/关闭钮/header/footer）。
 */

import type {Component, VNodeChild} from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Icon } from '../Icon/Icon.ts'

export type DrawerPosition = 'left' | 'right'

export interface DrawerProps {
  open?: boolean
  title?: string
  position?: DrawerPosition
  onClose?: ()=> void
  children?: VNodeChild
  footer?: VNodeChild
  /** 面板宽度（默认 360px——--wf-drawer-width 变量） */
  width?: string
}

export const Drawer: Component<DrawerProps> = (_props, ctx)=> {
  // 行为契约（弹层四件套单源）——皮自由（overlay/panel/关闭钮）
  const ov = ctx.ui.useOverlay({ role: 'dialog' })

  return (props: DrawerProps)=> {
    const { open, title, position = 'right', onClose, children, footer, width } = props
    const DL = ctx?.i18n?.components?.Drawer ?? {}

    const overlay = h('div', {
      ...ov.maskProps,
      class: 'wf-drawer-overlay',
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
      onClick: (e: Event)=> e.stopPropagation(),
    }, [titleEl, bodyEl, footerEl].filter(Boolean))

    const root = h('div', {
      ...ov.panelProps,
      class: `wf-drawer wf-drawer--${position} ${open ? 'wf-drawer--enter' : 'wf-drawer--exit'}`,
      'aria-label': title ?? (DL.ariaLabel ?? '侧边面板'),
      tabIndex: -1,
    }, [overlay, panel])

    // 渲染期同步（openPopup 生命周期——受控 + 内容更新——每次渲染恒调用）
    ov.sync(()=> root, {
      open: !!open,
      onOpenChange: (v)=> { if (!v) onClose?.() },
      presence: true,
    })

    return null
  }
}
