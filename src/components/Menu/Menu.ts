/**
 * weifuwu/components — Menu
 *
 * 导航菜单（侧栏导航）：分组项 + 图标 + 选中态 + 方向键导航 + Enter 激活。
 * 用于 SaaS 应用侧边导航（替代手写 nav-item 循环）。
 * 裁剪：不做子菜单展开/水平菜单栏（见 roadmap）。
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface MenuItem {
  key: string
  label: any
  icon?: any
  /** 分组标题（相邻同组项之间插分组头） */
  group?: string
  active?: boolean
  danger?: boolean
  onClick?: () => void
}

export interface MenuProps {
  items: MenuItem[]
  onSelect?: (key: string) => void
  activeKey?: string
  className?: string
}

export const Menu: Component<MenuProps> = (_init, ctx) => {
  let navEl: HTMLElement | null = null
  // 稳定 ref（mount 作用域）：仅保存容器，避免内联 ref 每渲染重建
  const navRef = (el: any) => { if (el) navEl = el }

  const onKeyDown = (e: KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const items = navEl ? Array.from(navEl.querySelectorAll<HTMLElement>('.wf-menu-item')) : []
    const idx = items.indexOf(document.activeElement as HTMLElement)
    if (idx < 0) return
    e.preventDefault()
    let next = idx
    if (e.key === 'ArrowDown') next = (idx + 1) % items.length
    else if (e.key === 'ArrowUp') next = (idx - 1 + items.length) % items.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = items.length - 1
    items[next].focus()
  }

  return (props: MenuProps) => {
    const { items, onSelect, activeKey, className } = props

    const nodes: any[] = []
    let lastGroup: string | undefined

    for (const item of items) {
      if (item.group !== lastGroup) {
        nodes.push(h('div', { class: 'wf-menu-group', key: `g-${item.group}` }, item.group))
        lastGroup = item.group
      }
      const isActive = item.active ?? (activeKey != null && item.key === activeKey)
      nodes.push(h('div', {
        key: item.key,
        'data-key': item.key,
        class: `wf-menu-item${isActive ? ' wf-menu-item--active' : ''}${item.danger ? ' wf-menu-item--danger' : ''}`,
        role: 'menuitem',
        tabIndex: isActive ? 0 : -1,
        'aria-current': isActive ? 'page' : undefined,
        onClick: () => { if (item.onClick) item.onClick(); else onSelect?.(item.key) },
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (item.onClick) item.onClick(); else onSelect?.(item.key) }
        },
      }, [
        item.icon ? h('span', { class: 'wf-menu-icon' }, item.icon) : null,
        h('span', { class: 'wf-menu-label' }, item.label),
      ].filter(Boolean)))
    }

    return h('nav', { class: `wf-menu${className ? ` ${className}` : ''}`, role: 'menu', ref: navRef, onKeyDown }, nodes)
  }
}
