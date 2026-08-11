/**
 * weifuwu/components — Dropdown
 *
 * usePopup 组合器：click 触发 + 受控 open + 外部点击/Escape（document 级，
 * 弹层在 portal 中按 Escape 也能关）+ 定位/视口 clamp + portal。
 */

import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

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

export const Dropdown: Component<DropdownProps> = async (_init, ctx) => {
  // ── mount（只一次）──
  let wrapEl: HTMLElement | null = null
  const wrapRef = (el: HTMLElement | null) => { wrapEl = el }

  // useOpen：受控/非受控 open 统一（warn 缺回调——受控纪律自动化）
  let openCtrl: ReturnType<WfuiContext['ui']['useOpen']> | null = null

  const popup = ctx.ui.usePopup({
    trigger: 'click',
    el: () => wrapEl,
    isOpen: () => openCtrl?.open ?? false,
    setOpen: (v) => openCtrl?.setOpen(v),
  })

  // ── render（每次 dirty/props 变化）──
  return (props: DropdownProps) => {
    const { trigger, items = [] } = props
    openCtrl = ctx.ui.useOpen({ open: props.open, onOpenChange: props.onOpenChange, name: 'Dropdown' })

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
      class: `wf-dropdown${openCtrl?.open ? ' wf-dropdown--open' : ''}`,
      ref: wrapRef,
      ...popup.wrapProps,
      // 触发区语义：菜单弹出（trigger 为不透明 VNode，ARIA 挂在包装层，文档注明）
      'aria-haspopup': 'menu',
      'aria-expanded': String(!!openCtrl?.open),
    }, [trigger, popup.portal(menu, 'dropdown')].filter(Boolean))
  }
}
