/**
 * weifuwu/components — Dropdown
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, createPortal } from '../../client/vnode.ts'

export interface DropdownItem {
  label: string
  value?: string
  disabled?: boolean
  variant?: 'default' | 'danger'
  onClick?: () => void
}

export interface DropdownProps {
  trigger: any
  items?: DropdownItem[]
  open?: boolean
  /** 关闭回调（面板内 Escape） */
  onOpenChange?: (open: boolean) => void
}

export const Dropdown: Component<DropdownProps> = (_init, ctx) => {
  // ── mount（只一次）──
  let wrapEl: HTMLElement | null = null
  const wrapRef = (el: HTMLElement | null) => { wrapEl = el }
  let latestOpen = false
  let prevOpen = false

  // 滚动/resize 时自动重算坐标（弹层跟随触发元素）
  const pos = ctx.ui.usePopupPosition({
    el: () => wrapEl,
    isOpen: () => latestOpen,
    compute: (r) => ({ top: r.bottom + 4, left: r.left }),
  })

  // ── render（每次 dirty/props 变化）──
  return (props: DropdownProps) => {
    const { trigger, items = [], open, onOpenChange } = props
    latestOpen = !!open

    // ── 打开瞬间算一次初始坐标（受控 open）──
    if (latestOpen && !prevOpen) pos.refresh()
    prevOpen = latestOpen

    const menuItems = items.map((item, i) =>
      h('button', {
        class: `wf-dropdown-item${item.variant === 'danger' ? ' wf-dropdown-item--danger' : ''}`,
        key: item.value ?? i, disabled: item.disabled || undefined,
        role: 'menuitem', onClick: item.onClick,
      }, item.label)
    )

    const menu = open ? h('div', {
      class: 'wf-dropdown-menu', role: 'menu',
      style: { top: pos.top, left: pos.left },
      // Escape 关闭（菜单项可聚焦，keydown 冒泡到菜单）
      onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Escape') onOpenChange?.(false) },
    }, menuItems) : null

    const portalContent = open ? createPortal(menu, 'dropdown') : null

    return h('div', {
      class: `wf-dropdown${open ? ' wf-dropdown--open' : ''}`,
      ref: wrapRef,
      // 触发区语义：菜单弹出（trigger 为不透明 VNode，ARIA 挂在包装层，文档注明）
      'aria-haspopup': 'menu',
      'aria-expanded': String(!!open),
    }, [trigger, portalContent].filter(Boolean))
  }
}
