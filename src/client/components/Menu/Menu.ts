/**
 * weifuwu/components — Menu
 *
 * 导航菜单（侧栏导航）：分组项 + 图标 + 选中态 + 方向键导航 + Enter 激活 + 子菜单 + 折叠。
 * 用于 SaaS 应用侧边导航（替代手写 nav-item 循环）。
 * 裁剪（CS-05，见 docs/client.md）：水平菜单栏（Menubar，独立组件）、子菜单自动互斥。折叠态子菜单浮层已实现（openPopup 内核基座）。
 */

import type { Component } from '../../vdom/index.ts'
import { createClientBrowser } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
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
  // 浏览器环境（ctx.browser 优先，测试/无注入环境 fallback createClientBrowser——自研惰性防御）
  const _browser = ctx.browser ?? createClientBrowser()
  // ── mount（只一次）──
  let navEl: HTMLElement | null = null
  // 非受控内部状态（手动：闭包 let + render，不触发 Proxy 依赖）
  let internalOpen: string[] = []
  let internalCollapsed = false
  // 折叠态子菜单浮层（roadmap DO）：命令式弹窗（唯一形态 openPopup——外部点击/
  // Escape/定位——零 document/window 自建）
  let collapsedPopupKey: string | null = null
  let popupAnchor: HTMLElement | null = null
  /** 命令式句柄（唯一形态——openPopup——组件内部同步样板） */
  let handle: import('../../vdom/hooks/popup-manager.ts').PopupHandle | null = null
  const syncCollapsedPopup = (item: any, popupOpen: boolean, content: () => import('../../vdom/index.ts').VNode): void => {
    // 只对打开项生效（多折叠项共享 handle——非打开项调 else-if 会误关）
    if (popupOpen && !handle)
      handle = ctx.ui.openPopup({
        key: 'menu-popup',
        anchor: () => popupAnchor,
        placement: 'right',
        gap: 6,
        content,
        onClose: () => { handle = null; if (collapsedPopupKey) { collapsedPopupKey = null; ctx.render() } },
      })
    else if (handle && popupOpen) handle.update(content())
  }
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
      else { internalOpen = keys; ctx.render() }
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
      else { internalCollapsed = next; ctx.render() }
    }


    const renderSubmenu = (item: MenuItem): any => {
      const open = openSet.has(item.key) && !isCollapsed
      const isActive = item.active ?? (activeKey != null && item.key === activeKey)

      // 折叠态：图标标题 + 点击弹出子菜单浮层（roadmap DO，openPopup 内核基座）
      if (isCollapsed) {
        const popupOpen = collapsedPopupKey === item.key
        const titleEl = h('div', {
          'data-key': item.key,
          class: `wf-menu-submenu-title wf-menu-submenu-title--collapsed${isActive ? ' wf-menu-submenu-title--active' : ''}`,
          role: 'menuitem',
          tabIndex: isActive ? 0 : -1,
          'aria-haspopup': 'menu',
          'aria-expanded': popupOpen ? 'true' : 'false',
          onClick: (e: MouseEvent) => {
            if (popupOpen) { collapsedPopupKey = null; ctx.render() }
            else {
              popupAnchor = e.currentTarget as HTMLElement
              collapsedPopupKey = item.key
              ctx.render()
            }
          },
          onKeyDown: (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') { e.preventDefault(); if (!popupOpen) { popupAnchor = e.currentTarget as HTMLElement; collapsedPopupKey = item.key; ctx.render() } }
            else if (e.key === 'Escape') { e.preventDefault(); collapsedPopupKey = null; ctx.render() }
          },
        }, [
          item.icon ? h('span', { class: 'wf-menu-icon' }, item.icon) : null,
        ].filter(Boolean))
        // 浮层：命令式弹窗（openPopup——定位/外部点击/Escape 内置——只打开项调）
        if (popupOpen) syncCollapsedPopup(item, popupOpen, () => h('div', {
          class: 'wf-menu-popup',
        }, (item.children ?? []).map(child => renderItem(child, true, true))))
        return h('div', { key: item.key, 'data-key': item.key, class: 'wf-menu-submenu wf-menu-submenu--collapsed' }, [titleEl])
      }
      // 折叠态：icon-only 标题（无 label/无展开交互——浮层裁剪，见 docs/client.md）
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

    const renderItem = (item: MenuItem, isChild = false, forceLabel = false): any => {
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
        isCollapsed && !forceLabel ? null : h('span', { class: 'wf-menu-label' }, item.label),
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
        // 递归注入 _parentKey（浅处理一层——裁剪：多级子菜单）；仅非折叠分支有 content
        if (!isCollapsed && sub.props.children[1]) {
          sub.props.children[1].props.children = sub.props.children[1].props.children.map((c: any) =>
            c?.props ? { ...c, props: { ...c.props, _parentKey: item.key } } : c)
        }
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

    // 关闭兜底（条件 sync——内部关闭后 renderFn 不再调——handle 残留防漏）
    if (!collapsedPopupKey && handle) { handle.close(); handle = null }

    return h('nav', { class: cls, role: 'menu', ref: navRef, onKeyDown }, children)
  }
}
