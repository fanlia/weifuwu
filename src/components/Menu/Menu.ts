/**
 * weifuwu/components — Menu
 *
 * 导航菜单（侧栏导航）：分组项 + 图标 + 选中态 + 方向键导航 + Enter 激活 + 子菜单 + 折叠。
 * 用于 SaaS 应用侧边导航（替代手写 nav-item 循环）。
 * 裁剪：水平菜单栏（Menubar）、折叠时子菜单浮层（popup，见 roadmap）、子菜单自动互斥。
 */

import type { Component } from '../../client/vnode.ts'
import { createClientBrowser } from '../../client/browser.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

export interface MenuItem {
  key: string
  label: any
  icon?: any
  /** 分组标题（相邻同组项之间插分组头） */
  group?: string
  active?: boolean
  danger?: boolean
  onClick?: () => void
  /** 子菜单项（有 children 即渲染为可展开子菜单） */
  children?: MenuItem[]
}

export interface MenuProps {
  items: MenuItem[]
  onSelect?: (key: string) => void
  activeKey?: string
  className?: string
  /** 受控展开 key 列表（子菜单） */
  openKeys?: string[]
  onOpenChange?: (keys: string[]) => void
  /** 可折叠侧栏（宽度收窄 + label 隐藏） */
  collapsible?: boolean
  collapsed?: boolean
  onCollapseChange?: (collapsed: boolean) => void
}

export const Menu: Component<MenuProps> = (_init, ctx) => {
  // 浏览器环境（ctx.browser 优先，测试/无注入环境 fallback jsdom）
  const _browser = ctx.browser ?? createClientBrowser()
  // ── mount（只一次）──
  let navEl: HTMLElement | null = null
  // 非受控内部状态（手动：闭包 let + render，不触发 Proxy 依赖）
  let internalOpen: string[] = []
  let internalCollapsed = false
  // 稳定 ref（mount 作用域）：仅保存容器，避免内联 ref 每渲染重建
  const navRef = (el: any) => { if (el) navEl = el }

  const onKeyDown = (e: KeyboardEvent) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return
    const items = navEl
      ? Array.from(navEl.querySelectorAll<HTMLElement>('.wf-menu-item, .wf-menu-submenu-title'))
      : []
    const idx = items.indexOf((_browser?.activeElement() ?? null) as HTMLElement)
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
    const {
      items, onSelect, activeKey, className,
      openKeys, onOpenChange, collapsible, collapsed, onCollapseChange,
    } = props

    const isOpenControlled = openKeys !== undefined
    const isCollapsedControlled = collapsed !== undefined
    const openSet = new Set(isOpenControlled ? openKeys : internalOpen)
    const isCollapsed = isCollapsedControlled ? !!collapsed : internalCollapsed

    const setOpen = (keys: string[]) => {
      if (isOpenControlled) onOpenChange?.(keys)
      else { internalOpen = keys; ctx.ui.render() }
    }
    const toggleOpen = (key: string, force?: boolean) => {
      const next = force != null
        ? (force ? [...openSet, key] : [...openSet].filter(k => k !== key))
        : (openSet.has(key) ? [...openSet].filter(k => k !== key) : [...openSet, key])
      // 去重（子菜单只允许一个 key 出现在 openSet）
      setOpen([...new Set(next)])
    }
    const toggleCollapse = () => {
      const next = !isCollapsed
      if (isCollapsedControlled) onCollapseChange?.(next)
      else { internalCollapsed = next; ctx.ui.render() }
    }

    const renderSubmenu = (item: MenuItem): any => {
      const open = openSet.has(item.key) && !isCollapsed
      const isActive = item.active ?? (activeKey != null && item.key === activeKey)
      // 折叠态：icon-only 标题（无 label/无展开交互——浮层裁剪，见 roadmap）
      const titleChildren = [
        item.icon ? h('span', { class: 'wf-menu-icon' }, item.icon) : null,
        isCollapsed ? null : h('span', { class: 'wf-menu-label' }, item.label),
        isCollapsed ? null : h('span', { class: 'wf-menu-arrow' }, h(Icon, { name: 'chevron-right', size: 12 })),
      ].filter(Boolean)
      const title = h('div', {
        'data-key': item.key,
        class: `wf-menu-submenu-title${isActive ? ' wf-menu-submenu-title--active' : ''}`,
        role: 'menuitem',
        tabIndex: isActive ? 0 : -1,
        'aria-expanded': open ? 'true' : 'false',
        onClick: () => toggleOpen(item.key),
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
            e.preventDefault()
            if (!open) toggleOpen(item.key, true)
          } else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
            if (open) { e.preventDefault(); toggleOpen(item.key, false) }
          }
        },
      }, titleChildren)

      const content = h('div', {
        class: 'wf-menu-submenu-content',
        role: 'group',
      }, (item.children ?? []).map(child => renderItem(child, true)))

      return h('div', {
        key: item.key,
        'data-key': item.key,
        class: `wf-menu-submenu${open ? ' wf-menu-submenu--open' : ''}`,
      }, [title, content])
    }

    const renderItem = (item: MenuItem, isChild = false): any => {
      if (item.children && item.children.length > 0 && !isCollapsed) return renderSubmenu(item)
      const isActive = item.active ?? (activeKey != null && item.key === activeKey)
      return h('div', {
        key: item.key,
        'data-key': item.key,
        class: `wf-menu-item${isActive ? ' wf-menu-item--active' : ''}${item.danger ? ' wf-menu-item--danger' : ''}${isChild ? ' wf-menu-item--child' : ''}`,
        role: 'menuitem',
        tabIndex: isActive ? 0 : -1,
        'aria-current': isActive ? 'page' : undefined,
        onClick: () => { if (item.onClick) item.onClick(); else onSelect?.(item.key) },
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (item.onClick) item.onClick(); else onSelect?.(item.key) }
          else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
            // 子级：收回父级（焦点回父标题）
            if (isChild) {
              e.preventDefault()
              const parentKey = (item as any)._parentKey
              if (parentKey && openSet.has(parentKey)) toggleOpen(parentKey, false)
            }
          }
        },
      }, [
        item.icon ? h('span', { class: 'wf-menu-icon' }, item.icon) : null,
        isCollapsed ? null : h('span', { class: 'wf-menu-label' }, item.label),
      ].filter(Boolean))
    }

    // 子级项注入父 key（供 Escape/← 收回父级）
    const nodes: any[] = []
    let lastGroup: string | undefined
    for (const item of items) {
      if (item.group !== lastGroup) {
        nodes.push(h('div', { class: 'wf-menu-group', key: `g-${item.group}` }, item.group))
        lastGroup = item.group
      }
      if (item.children && item.children.length > 0) {
        const sub = renderSubmenu(item)
        // 递归注入 _parentKey（浅处理一层——裁剪：多级子菜单）
        sub.props.children[1].props.children = sub.props.children[1].props.children.map((c: any) =>
          c?.props ? { ...c, props: { ...c.props, _parentKey: item.key } } : c)
        nodes.push(sub)
      } else {
        nodes.push(renderItem(item))
      }
    }

    const cls = [
      'wf-menu',
      isCollapsed ? 'wf-menu--collapsed' : '',
      className ?? '',
    ].filter(Boolean).join(' ')

    const children = [
      ...nodes,
      collapsible ? h('div', {
        class: 'wf-menu-collapse-btn',
        role: 'button',
        tabIndex: 0,
        'aria-label': isCollapsed ? '展开菜单' : '折叠菜单',
        onClick: toggleCollapse,
        onKeyDown: (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCollapse() }
        },
      }, isCollapsed ? h(Icon, { name: 'chevron-right', size: 14 }) : h(Icon, { name: 'chevron-left', size: 14 })) : null,
    ].filter(Boolean)

    return h('nav', { class: cls, role: 'menu', ref: navRef, onKeyDown }, children)
  }
}
