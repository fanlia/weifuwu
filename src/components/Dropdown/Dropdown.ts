import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, createPortal } from '../../client/vnode.ts'
import { computeFixedPos } from '../../client/popup.ts'

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
}

export const Dropdown: Component<DropdownProps> = (props, ctx) => {
  const { trigger, items = [], open } = props
  const $ = ctx.ui.$

  // 在 open 切换时从 ref 计算位置
  if (open && $._wrapRef && !$._pos) {
    $._pos = computeFixedPos($._wrapRef, 'bottom', 4, false)
  }
  if (!open) { $._pos = undefined }

  const menuItems = items.map((item, i) =>
    h('button', {
      class: `wf-dropdown-item${item.variant === 'danger' ? ' wf-dropdown-item--danger' : ''}`,
      key: item.value ?? i, disabled: item.disabled || undefined,
      role: 'menuitem', onClick: item.onClick,
    }, item.label)
  )

  const p = $._pos ?? { top: 0, left: 0 }
  const menu = open ? h('div', { class: 'wf-dropdown-menu', role: 'menu', style: { top: p.top, left: p.left } }, menuItems) : null
  const portalContent = open ? createPortal(menu, 'dropdown') : null

  return h('div', {
    class: `wf-dropdown${open ? ' wf-dropdown--open' : ''}`,
    ref: (el: HTMLElement | null) => { $._wrapRef = el },
  }, [trigger, portalContent].filter(Boolean))
}
