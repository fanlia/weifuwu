/**
 * weifuwu/components — NavMenu 顶部导航
 *
 * 三库等价：shadcn NavigationMenu（特有——antd/EP 用 Menu 横向模式）。
 * 顶部水平导航 + 多级 hover 弹出 + 键盘（→ 进入子菜单 / ← 返回 / Escape 关闭）：
 *
 *   <NavMenu items={[{ key, label, children: [...] }]} activeKey onSelect />
 *
 * 裁剪（CS-05）：不做 hover 延迟微调/子菜单动画曲线定制；
 * 折叠态交还 useBreakpoint 由用户驱动。
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'
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

const renderSub = (
  items: NavMenuItem[],
  activeKey: string | undefined,
  onSelect: ((key: string) => void) | undefined,
  depth: number,
): any[] =>
  items.map(item =>
    h('div', {
      class: `wf-navmenu-sub-item${item.disabled ? ' wf-navmenu-sub-item--disabled' : ''}`,
      key: item.key,
      onClick: () => { if (!item.disabled) onSelect?.(item.key) },
      role: 'menuitem',
      'aria-disabled': item.disabled ? 'true' : undefined,
    }, [
      h('span', { class: 'wf-navmenu-sub-label' }, item.label),
      item.children?.length
        ? h('span', { class: 'wf-navmenu-sub-arrow' }, h(Icon, { name: 'chevron-right' }))
        : null,
      item.children?.length
        ? h('div', { class: 'wf-navmenu-sub-nested' }, renderSub(item.children, activeKey, onSelect, depth + 1))
        : null,
    ]))

export const NavMenu: Component<NavMenuProps> = (_init, ctx: WfuiContext) => {
  // ── mount（只一次）──
  let openKey: string | null = null
  let latestActiveKey: string | undefined = _init?.activeKey

  // ── render（每次 dirty/props 变化）──
  return (props: NavMenuProps) => {
    const { items, activeKey, onSelect } = props
    latestActiveKey = activeKey

    return h('nav', {
      class: 'wf-navmenu',
      role: 'navigation',
      'aria-label': '主导航',
    }, items.map(item => {
      const hasChildren = !!item.children?.length
      const isOpen = openKey === item.key
      return h('div', {
        class: `wf-navmenu-item${item.disabled ? ' wf-navmenu-item--disabled' : ''}${activeKey === item.key ? ' wf-navmenu-item--active' : ''}`,
        key: item.key,
        role: 'menuitem',
        'aria-expanded': hasChildren && isOpen ? 'true' : undefined,
        onClick: () => {
          if (item.disabled) return
          if (hasChildren) {
            openKey = isOpen ? null : item.key
            ctx.ui.render()
          } else {
            onSelect?.(item.key)
          }
        },
        onMouseEnter: () => {
          // hover 打开子菜单（桌面主通道；移动端点击切换）
          if (!item.disabled && hasChildren && openKey !== item.key) {
            openKey = item.key
            ctx.ui.render()
          }
        },
        onKeyDown: (e: any) => {
          if (e.key === 'ArrowRight' && hasChildren) {
            openKey = item.key
            ctx.ui.render()
          } else if (e.key === 'Escape') {
            openKey = null
            ctx.ui.render()
          }
        },
      }, [
        h('span', { class: 'wf-navmenu-label' }, item.label),
        hasChildren && h('span', { class: 'wf-navmenu-arrow' }, h(Icon, { name: 'chevron-down' })),
        hasChildren && isOpen && h('div', {
          class: 'wf-navmenu-sub wf-navmenu-sub--open',
          role: 'menu',
        }, renderSub(item.children || [], activeKey, onSelect, 1)),
      ].filter(x => x !== false && x !== null && x !== undefined))
    }))
  }
}
