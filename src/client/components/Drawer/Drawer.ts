/**
 * weifuwu/components — Drawer
 */

import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
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

export const Drawer: Component<DrawerProps> = (_props, ctx) => {
  // openPopup 内核 会话级模态（统一弹窗能力）：presence 退场状态机 + 焦点 trap + 滚动锁
  let latestOpen = false
  // 命令式弹窗（唯一形态 openPopup）：presence 退场状态机 + 焦点 trap + 滚动锁
  /** 命令式句柄（唯一形态——openPopup——组件内部同步样板） */
  let handle: import('../../vdom/hooks/popup-manager.ts').PopupHandle | null = null
  // ESC 关闭（document 级——焦点在 trap 外也可关闭；open 期间才触发避免退场重复）
  let latestOnClose: (() => void) | undefined
  ctx.ui.useGlobalKey((e: KeyboardEvent) => {
    if (e.key === 'Escape' && handle?.open && latestOpen) latestOnClose?.()
  })
  ctx.ui.onUnmount?.(() => { if (handle) handle.close() })

  return (props: DrawerProps) => {
    const { open, title, position = 'right', onClose, children, footer, width } = props
    latestOnClose = onClose
    const DL = (ctx as any)?.i18n?.components?.Drawer ?? {}
    latestOpen = !!open

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
      class: `wf-drawer wf-drawer--${position} ${open ? 'wf-drawer--enter' : 'wf-drawer--exit'}`,
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title ?? (DL.ariaLabel ?? '侧边面板'),
      tabIndex: -1,
      onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Escape') onClose?.() },
    }, [overlay, panel])

    // 命令式同步（受控 + 内容更新——每次渲染恒调用）
    if (open && !handle)
      handle = ctx.ui.openPopup({
        key: 'drawer',
        presence: true,
        trapFocus: true,
        lockScroll: true,
        positioning: 'none',
        closeOnOutside: false,
        closeOnEscape: false,
        content: () => root,
        onClose: () => { handle = null },
      })
    else if (!open && handle) {
      // 退场：先渲染 exit class（动画）→ close（presence——animationend → dispose）
      handle.update(root)
      handle.close()
      handle = null
    }
    else if (handle) handle.update(root)

    return null
  }
}
