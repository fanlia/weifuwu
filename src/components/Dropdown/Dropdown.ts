/**
 * weifuwu/components — Dropdown
 *
 * usePopup 组合器：click 触发 + 受控 open + 外部点击/Escape（document 级，
 * 弹层在 portal 中按 Escape 也能关）+ 定位/视口 clamp + portal。
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

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
  /** 关闭回调（面板内 Escape / 外部点击） */
  onOpenChange?: (open: boolean) => void
}

export const Dropdown: Component<DropdownProps> = (_init, ctx) => {
  // ── mount（只一次）──
  let latestOpen = false
  let latestOnOpenChange: ((open: boolean) => void) | undefined = _init?.onOpenChange
  let wrapEl: HTMLElement | null = null
  const wrapRef = (el: HTMLElement | null) => { wrapEl = el }

  const popup = ctx.ui.usePopup({
    trigger: 'click',
    el: () => wrapEl,
    isOpen: () => latestOpen,
    setOpen: (v) => { latestOpen = v; ctx.ui.render() },
    // 受控桥：initProps 传了 open 才进受控模式；值每次渲染同步（getter）
    open: _init?.open !== undefined ? () => latestOpen : undefined,
    onOpenChange: (v) => {
      if (latestOnOpenChange) {
        latestOnOpenChange(v)
      } else if (_init?.open !== undefined) {
        console.warn('[weifuwu/Dropdown] 受控模式（open 已传）但未提供 onOpenChange，Escape/外部点击关闭无法生效。\n非受控：去掉 open；受控：传入 onOpenChange={(o) => setOpen(o)}')
      }
    },
  })

  // ── render（每次 dirty/props 变化）──
  return (props: DropdownProps) => {
    const { trigger, items = [] } = props
    latestOpen = !!props.open
    latestOnOpenChange = props.onOpenChange

    const menuItems = items.map((item, i) =>
      h('button', {
        class: `wf-dropdown-item${item.variant === 'danger' ? ' wf-dropdown-item--danger' : ''}`,
        key: item.value ?? i, disabled: item.disabled || undefined,
        role: 'menuitem', onClick: item.disabled ? undefined : () => { item.onClick?.() },
      }, item.label)
    )

    const menu = h('div', {
      class: 'wf-dropdown-menu', role: 'menu',
    }, menuItems)

    return h('div', {
      class: `wf-dropdown${latestOpen ? ' wf-dropdown--open' : ''}`,
      ref: wrapRef,
      ...popup.wrapProps,
      // 触发区语义：菜单弹出（trigger 为不透明 VNode，ARIA 挂在包装层，文档注明）
      'aria-haspopup': 'menu',
      'aria-expanded': String(!!latestOpen),
    }, [trigger, popup.portal(menu, 'dropdown')].filter(Boolean))
  }
}
