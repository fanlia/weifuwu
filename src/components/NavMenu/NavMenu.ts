/**
 * weifuwu/components — NavMenu 顶部导航
 *
 * 三库等价：shadcn NavigationMenu（特有——antd/EP 用 Menu 横向模式）。
 * 顶部水平导航 + 多级 hover 弹出 + 键盘（→ 进入子菜单 / ← 返回 / Escape 关闭）：
 *
 *   <NavMenu items={[{ key, label, children: [...] }]} activeKey onSelect />
 *
 * 弹层纪律（AGENTS.md）：子菜单/嵌套子菜单全部经 usePopup 组合器
 * （createPortal + fixed + 视口夹紧 + Escape + 外部点击）——不 absolute 定位。
 *
 * 裁剪（CS-05，见 design/components-cuts.md）：不做 hover 延迟微调/子菜单动画曲线定制；
 * 折叠态交还 useBreakpoint 由用户驱动。
 */

import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

export interface NavMenuItem {
  key: string
  label?: any
  children?: NavMenuItem[]
  disabled?: boolean
}

export interface NavMenuProps {
  items: NavMenuItem[]
  activeKey?: string
  onSelect?: (key: string) => void
}

/** hover 关闭延迟：覆盖 pointer 穿越 trigger→面板 间隙（fixed 面板与触发项间 gap
 * 区域不属于面板——mouseout relatedTarget 是页面元素——进入面板前不误关） */
const HOVER_CLOSE_DELAY = 120

export const NavMenu: Component<NavMenuProps> = async (_init, ctx: WfuiContext) => {
  // ── mount（只一次）──
  let openKey: string | null = null
  let nestedKey: string | null = null
  const itemEls = new Map<string, HTMLElement>()
  const nestedEls = new Map<string, HTMLElement>()
  // 稳定 ref 缓存：ref 函数必须持久（内联 ref 每次渲染新引用 → ref 回调重复执行，
  // 违反 AGENTS.md ref 纪律）——按 key 缓存同一函数实例
  const itemRefCache = new Map<string, (el: HTMLElement | null) => void>()
  const itemRef = (key: string) => {
    let fn = itemRefCache.get(key)
    if (!fn) {
      fn = (el) => { if (el) itemEls.set(key, el) }
      itemRefCache.set(key, fn)
    }
    return fn
  }
  const nestedRefCache = new Map<string, (el: HTMLElement | null) => void>()
  const nestedRef = (key: string) => {
    let fn = nestedRefCache.get(key)
    if (!fn) {
      fn = (el) => { if (el) nestedEls.set(key, el) }
      nestedRefCache.set(key, fn)
    }
    return fn
  }

  // ── hover 自动关闭（shadcn NavigationMenu 行为）──
  // 菜单域 = 导航条 + 已展开面板（顶层 + 嵌套）。pointer 离开域 → 延迟关闭；
  // 延迟覆盖 trigger→panel 间隙穿越：fixed 面板与触发项之间有 gap，pointer 移入
  // 面板前会短暂落在页面元素上（mouseout relatedTarget 是页面元素而非面板）——
  // 即时关闭会误关，进入面板的 mouseenter 会 cancel。
  let navEl: HTMLElement | null = null
  let subPanelEl: HTMLElement | null = null
  let nestedPanelEl: HTMLElement | null = null
  let closeTimer: ReturnType<typeof setTimeout> | undefined
  const navRef = (el: HTMLElement | null) => { navEl = el }
  const subPanelRef = (el: HTMLElement | null) => { subPanelEl = el }
  const nestedPanelRef = (el: HTMLElement | null) => { nestedPanelEl = el }
  const inMenuDomain = (rt: unknown): boolean => {
    if (!rt || typeof rt !== 'object') return false
    const node = rt as Node
    return !!(
      (navEl && navEl.contains(node)) ||
      (subPanelEl && subPanelEl.contains(node)) ||
      (nestedPanelEl && nestedPanelEl.contains(node))
    )
  }
  const cancelClose = () => { clearTimeout(closeTimer); closeTimer = undefined }
  const scheduleClose = () => {
    if (closeTimer) return
    closeTimer = setTimeout(() => {
      closeTimer = undefined
      if (openKey !== null || nestedKey !== null) {
        openKey = null; nestedKey = null
        ctx.ui.render()
      }
    }, HOVER_CLOSE_DELAY)
  }
  const onDomainLeave = (e: any) => { if (!inMenuDomain(e?.relatedTarget ?? null)) scheduleClose() }
  const onDomainEnter = () => cancelClose()
  ctx.ui.onUnmount?.(() => { clearTimeout(closeTimer) })

  // 顶层子菜单：usePopup 组合器（portal + 定位 + Escape + 外部点击）
  const popup = ctx.ui.usePopup({
    trigger: () => 'hover',
    placement: () => 'bottom',
    center: false, // 子菜单左对齐触发项
    gap: 4,
    el: () => (openKey ? itemEls.get(openKey) ?? null : null),
    isOpen: () => !!openKey,
    setOpen: (v) => { if (!v) { openKey = null; nestedKey = null; ctx.ui.render() } },
  })

  // 嵌套子菜单（第二级）：独立 usePopup（portal + right 弹出）
  const nestedPopup = ctx.ui.usePopup({
    trigger: () => 'hover',
    placement: () => 'right',
    center: false,
    gap: 4,
    el: () => (nestedKey ? nestedEls.get(nestedKey) ?? null : null),
    isOpen: () => !!nestedKey,
    setOpen: (v) => { if (!v) { nestedKey = null; ctx.ui.render() } },
  })

  const renderSub = (
    items: NavMenuItem[],
    activeKey: string | undefined,
    onSelect: ((key: string) => void) | undefined,
    depth: number,
  ): any[] =>
    items.map(item => {
      const hasNested = !!item.children?.length
      const activate = () => {
        if (item.disabled) return
        if (hasNested) {
          // 嵌套 hover 已展开——点击收起（或直接选中）
          nestedKey = nestedKey === item.key ? null : item.key
          ctx.ui.render()
        } else {
          onSelect?.(item.key)
          popup.setOpen(false)
          nestedPopup.setOpen(false)
        }
      }
      return h('div', {
        class: `wf-navmenu-sub-item${item.disabled ? ' wf-navmenu-sub-item--disabled' : ''}${hasNested && nestedKey === item.key ? ' wf-navmenu-sub-item--open' : ''}`,
        key: item.key,
        role: 'menuitem',
        tabIndex: item.disabled ? undefined : 0, // P1：可聚焦才可操作（否则 keydown 死代码）
        'aria-haspopup': hasNested ? 'menu' : undefined,
        'aria-disabled': item.disabled ? 'true' : undefined,
        ref: nestedRef(item.key),
        onClick: activate,
        onKeyDown: (e: any) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault?.(); activate() }
        },
        onMouseEnter: () => {
          cancelClose() // 移回菜单域——取消延迟关闭
          if (item.disabled) return
          if (hasNested) {
            if (nestedKey !== item.key) { nestedKey = item.key; ctx.ui.render() }
          } else if (nestedKey !== null) {
            // 叶子子项 hover：关闭已展开的嵌套子菜单（shadcn NavigationMenu 行为）
            nestedKey = null
            ctx.ui.render()
          }
        },
      }, [
        h('span', { class: 'wf-navmenu-sub-label' }, item.label),
        hasNested
          ? h('span', { class: 'wf-navmenu-sub-arrow' }, h(Icon, { name: 'chevron-right' }))
          : null,
        (hasNested && nestedKey === item.key
          ? nestedPopup.portal(
              h('div', {
                class: 'wf-navmenu-sub wf-navmenu-sub--nested wf-navmenu-sub--open',
                role: 'menu',
                ref: nestedPanelRef,
                onMouseEnter: () => { cancelClose(); if (nestedKey !== item.key) { nestedKey = item.key; ctx.ui.render() } },
                onMouseLeave: onDomainLeave,
              }, renderSub(item.children || [], activeKey, onSelect, depth + 1)),
              'wf-navmenu-nested',
            )
          : null) ?? null,
      ].filter(x => x !== null && x !== undefined))
    })

  // ── render（每次 dirty/props 变化）──
  return async (props: NavMenuProps) => {
    const { items, activeKey, onSelect } = props

    return h('nav', {
      class: 'wf-navmenu',
      role: 'navigation',
      'aria-label': '主导航',
      ref: navRef,
      onMouseLeave: onDomainLeave,
    }, items.map(item => {
      const hasChildren = !!item.children?.length
      const isOpen = openKey === item.key
      return h('div', {
        class: `wf-navmenu-item${item.disabled ? ' wf-navmenu-item--disabled' : ''}${activeKey === item.key ? ' wf-navmenu-item--active' : ''}`,
        key: item.key,
        role: 'menuitem',
        'aria-haspopup': hasChildren ? 'menu' : undefined,
        'aria-expanded': hasChildren && isOpen ? 'true' : undefined,
        ref: itemRef(item.key),
        tabIndex: item.disabled ? undefined : 0, // P1：可聚焦才可操作
        onClick: () => {
          if (item.disabled) return
          if (hasChildren) {
            openKey = isOpen ? null : item.key
            nestedKey = null
            ctx.ui.render()
          } else {
            onSelect?.(item.key)
            // 点击叶子项：关闭已展开的子菜单（shadcn NavigationMenu 行为）
            popup.setOpen(false)
            nestedPopup.setOpen(false)
          }
        },
        onMouseEnter: () => {
          cancelClose() // 移回菜单域——取消延迟关闭
          // hover 打开子菜单（桌面主通道；移动端点击切换）
          if (item.disabled) return
          if (hasChildren) {
            if (openKey !== item.key) { openKey = item.key; nestedKey = null; ctx.ui.render() }
          } else if (openKey !== null || nestedKey !== null) {
            // 叶子项 hover：关闭已展开的子菜单（shadcn NavigationMenu 行为）
            openKey = null; nestedKey = null
            ctx.ui.render()
          }
        },
        onKeyDown: (e: any) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault?.()
            if (item.disabled) return
            if (hasChildren) { openKey = isOpen ? null : item.key; nestedKey = null; ctx.ui.render() }
            else { onSelect?.(item.key); popup.setOpen(false); nestedPopup.setOpen(false) }
          } else if (e.key === 'ArrowRight' && hasChildren) {
            openKey = item.key
            ctx.ui.render()
          } else if (e.key === 'Escape') {
            openKey = null
            nestedKey = null
            ctx.ui.render()
          }
        },
      }, [
        h('span', { class: 'wf-navmenu-label' }, item.label),
        hasChildren && h('span', { class: 'wf-navmenu-arrow' }, h(Icon, { name: 'chevron-down' })),
        hasChildren && isOpen
          ? popup.portal(
              h('div', {
                class: 'wf-navmenu-sub wf-navmenu-sub--open',
                role: 'menu',
                ref: subPanelRef,
                onMouseEnter: onDomainEnter,
                onMouseLeave: onDomainLeave,
              }, renderSub(item.children || [], activeKey, onSelect, 1)),
              'wf-navmenu-sub',
            )
          : null,
      ].filter(x => x !== false && x !== null && x !== undefined))
    }))
  }
}
