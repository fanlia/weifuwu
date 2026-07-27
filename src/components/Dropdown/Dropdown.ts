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
}

export const Dropdown: Component<DropdownProps> = (props, _ctx) => {
  const { trigger, items = [], open } = props

  const menuItems = items.map((item, i) =>
    h('button', {
      class: `wf-dropdown-item${item.variant === 'danger' ? ' wf-dropdown-item--danger' : ''}`,
      key: item.value ?? i,
      disabled: item.disabled || undefined,
      role: 'menuitem',
      onClick: item.onClick,
    }, item.label)
  )

  const menu = open ? h('div', { class: 'wf-dropdown-menu', role: 'menu' }, menuItems) : null

  return h('div', { class: `wf-dropdown${open ? ' wf-dropdown--open' : ''}` }, [
    trigger,
    menu,
  ].filter(Boolean))
}
