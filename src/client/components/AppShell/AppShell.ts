/**
 * weifuwu/components — AppShell
 *
 * 应用壳（SaaS 侧栏布局）：品牌区 + 导航菜单 + 用户区 + 主内容区——
 * 认证守卫/导航/用户数据由父层驱动（受控——组件零 fetch 零路由依赖）。
 *
 * 来源：agent-platform AppLayout（侧栏壳——Menu/Avatar/Button 组装样板）
 * 沉淀——每个 SPA 应用的重复样板：品牌 + 分组菜单 + 用户信息 + 设置/
 * 退出操作 + 守卫加载态。样式复用 weifuwu/layout 的 app-shell 原语
 * （wf-app-shell + wf-sidebar 系列 + wf-main——grid 栅格 + 移动端降级），
 * 组件只补品牌区/用户区细节（AppShell.css）。
 *
 * 状态约定（父层驱动）：
 * - nav/path：菜单数据与当前路由（activeKey 计算）
 * - user：用户信息（null = 未登录——父层守卫跳登录）
 * - onNavigate/onLogout/onSettings：回调上抛
 * - loading：守卫加载态（骨架占位）
 */

import type { Component } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Avatar } from '../Avatar/Avatar.ts'
import { Button } from '../Button/Button.ts'
import { Icon } from '../Icon/Icon.ts'
import { Menu, type MenuItem } from '../Menu/Menu.ts'

export interface AppShellNavItem {
  key: string
  label: string
  icon?: any
  group?: string
}

export interface AppShellProps {
  /** 导航菜单项（Menu items——key/label/icon/group） */
  nav?: AppShellNavItem[]
  /** 当前路由路径（activeKey 匹配——'/' 精确，其余前缀） */
  path?: string
  /** 品牌区（name/subtitle/logo 文本） */
  brand?: { name?: string; subtitle?: string; logo?: string }
  /** 用户信息（null = 未登录——父层守卫） */
  user?: { name?: string; email?: string } | null
  /** 导航回调（菜单选择 → 父层 navigate） */
  onNavigate?: (key: string) => void
  onLogout?: () => void
  onSettings?: () => void
  /** 守卫加载态（骨架占位——不渲染菜单/用户） */
  loading?: boolean
  /** 主内容区 */
  children?: any
  /** 自定义底部（覆盖用户区——高级场景） */
  footer?: any
  /** 侧栏宽度（layout 变量——默认 240px） */
  sidebarWidth?: string
}

const activeOf = (nav: AppShellNavItem[], path: string): string => {
  const p = path || '/'
  const hit = nav.find((n) => n.key === '/' ? p === '/' : p.startsWith(n.key))
  return hit?.key ?? ''
}

export const AppShell: Component<AppShellProps> = async (_init, _ctx) => {
  return async (props) => {
    const {
      nav = [], path = '', user = null, brand = {},
      onNavigate, onLogout, onSettings, loading = false,
      sidebarWidth = '240px',
    } = props
    const items: MenuItem[] = nav.map((n) => ({ key: n.key, label: n.label, icon: n.icon, group: n.group }))
    const name = brand.name ?? 'App'
    const subtitle = brand.subtitle ?? ''

    return h('div', { class: 'wf-app-shell', style: { '--wf-sidebar-width': sidebarWidth } }, [
      // 侧栏（layout 原语类）
      h('aside', { class: 'wf-sidebar' }, [
        // 品牌区
        h('div', { class: 'wf-sidebar-header' }, [
          h(Avatar, { name: brand.logo ?? name.slice(0, 1), size: 'lg' }),
          h('div', { class: 'wf-app-shell-brand-text' }, [
            h('span', { class: 'wf-app-shell-brand-name' }, name),
            subtitle ? h('small', { class: 'wf-app-shell-brand-sub' }, subtitle) : null,
          ]),
        ]),
        // 导航（Menu 组件——分组/选中态/方向键）
        h('div', { class: 'wf-sidebar-body' }, [
          h(Menu, {
            items,
            activeKey: activeOf(nav, path),
            onSelect: (k) => onNavigate?.(k),
          }),
        ]),
        // 用户区（loading = 骨架占位）
        props.footer ?? (
          loading
            ? h('div', { class: 'wf-sidebar-footer' }, [h('div', { class: 'wf-app-shell-skel' }), h('div', { class: 'wf-app-shell-skel wf-app-shell-skel--sm' })])
            : h('div', { class: 'wf-sidebar-footer' }, [
              h('div', { class: 'wf-app-shell-user' }, [
                h('div', { class: 'wf-app-shell-user-info' }, [
                  h(Avatar, { name: user?.name ?? '?', size: 'sm' }),
                  h('div', { class: 'wf-app-shell-user-meta' }, [
                    h('div', { class: 'wf-app-shell-user-name' }, user?.name ?? '未登录'),
                    user?.email ? h('div', { class: 'wf-app-shell-user-mail' }, user.email) : null,
                  ]),
                ]),
                h('div', { class: 'wf-app-shell-user-actions' }, [
                  onSettings ? h(Button, { size: 'sm', variant: 'ghost', title: '设置', onClick: onSettings }, [h(Icon, { name: 'settings', size: 16 })]) : null,
                  onLogout ? h(Button, { size: 'sm', variant: 'ghost', title: '退出登录', onClick: onLogout }, [h(Icon, { name: 'log-out', size: 16 })]) : null,
                ]),
              ]),
            ])
        ),
      ]),
      // 主内容区
      h('main', { class: 'wf-main' }, props.children),
    ])
  }
}
