/** AppShell：应用壳——品牌 + 分组导航 + 用户区 + 主内容（受控——父层驱动）（showcase /components/appshell） */
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
 * **移动抽屉（W2——AppLayout 功能面入库）**：`mobile` prop 父层驱动
 * （useBreakpoint 交还用户——库惯例同 Layout/NavMenu「响应式折叠交还用户」；
 * 零 breakpoint 内建保证 SSR 首帧确定性——node 无 matchMedia 时 useBreakpoint
 * 恒返回基档（mobile）导致 SSR≡SPA 首帧不一致（absorb 违例——实证））。
 * <768 侧栏转抽屉（translateX 滑入——layout 堆叠降级被替换）+ 遮罩 + 移动
 * 顶栏（NavBar——汉堡开抽屉 · 右侧设置）+ aside 头部关闭按钮。
 *
 * **导航徽标（W2）**：nav[].badge → Menu badge 胶囊（Badge count——
 * 99+ 溢出内建）——审批待办计数场景。
 *
 * 状态约定（父层驱动）：
 * - nav/path：菜单数据与当前路由（activeKey 计算）
 * - user：用户信息（null = 未登录——父层守卫跳登录）
 * - onNavigate/onLogout/onSettings：回调上抛
 * - loading：守卫加载态（骨架占位）
 * - mobile：移动模式（父层 breakpoint 判定）——抽屉/顶栏分支
 */

import type {Component, VNodeChild} from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Avatar } from '../Avatar/Avatar.ts'
import { Button } from '../Button/Button.ts'
import { Icon } from '../Icon/Icon.ts'
import { Menu, type MenuItem } from '../Menu/Menu.ts'
import { NavBar } from '../NavBar/NavBar.ts'

export interface AppShellNavItem {
  key: string
  label: string
  icon?: VNodeChild
  group?: string
  /** 导航徽标（数字 → Badge count 胶囊——99+ 溢出内建） */
  badge?: string | number
}

export interface AppShellProps {
  /** 导航菜单项（Menu items——key/label/icon/group/badge） */
  nav?: AppShellNavItem[]
  /** 当前路由路径（activeKey 匹配——'/' 精确，其余前缀） */
  path?: string
  /** 品牌区（name/subtitle/logo 文本） */
  brand?: { name?: string; subtitle?: string; logo?: string }
  /** 用户信息（null = 未登录——父层守卫） */
  user?: { name?: string; email?: string } | null
  /** 导航回调（菜单选择 → 父层 navigate） */
  onNavigate?: (key: string)=> void
  onLogout?: ()=> void
  onSettings?: ()=> void
  /** 守卫加载态（骨架占位——不渲染菜单/用户） */
  loading?: boolean
  /** 主内容区 */
  children?: VNodeChild
  /** 自定义底部（覆盖用户区——高级场景） */
  footer?: VNodeChild
  /** 侧栏宽度（layout 变量——默认 240px） */
  sidebarWidth?: string
  /** 移动顶栏标题（默认 brand.name） */
  mobileTitle?: string
  /** 移动模式（父层 breakpoint 判定——抽屉/顶栏分支；SSR 一致性：默认 false） */
  mobile?: boolean
}

const activeOf = (nav: AppShellNavItem[], path: string): string => {
  const p = path || '/'
  const hit = nav.find((n)=> n.key === '/' ? p === '/' : p.startsWith(n.key))
  return hit?.key ?? ''
}

export const AppShell: Component<AppShellProps> = (_init, ctx)=> {
  // 移动抽屉状态（mount 闭包——AppLayout 同款）
  let drawerOpen = false
  const closeDrawer = ()=> { if (drawerOpen) { drawerOpen = false; ctx.render() } }
  const toggleDrawer = ()=> { drawerOpen = !drawerOpen; ctx.render() }

  return (props)=> {
    const {
      nav = [], path = '', user = null, brand = {},
      onNavigate, onLogout, onSettings, loading = false,
      sidebarWidth = '240px', mobileTitle, mobile = false,
    } = props
    const items: MenuItem[] = nav.map((n)=> ({ key: n.key, label: n.label, icon: n.icon, group: n.group, badge: n.badge }))
    const name = brand.name ?? 'App'
    const subtitle = brand.subtitle ?? ''
    const isMobile = mobile
    const appName = mobileTitle ?? name

    return h('div', { class: 'wf-app-shell' }, [
      // 侧栏（layout 原语类 + 抽屉开启态）
      h('aside', { class: `wf-sidebar${isMobile && drawerOpen ? ' wf-app-shell-drawer--open' : ''}` }, [
        // 品牌区（移动端：关闭按钮追加）
        h('div', { class: 'wf-sidebar-header' }, [
          h(Avatar, { name: brand.logo ?? name.slice(0, 1), size: 'lg' }),
          h('div', { class: 'wf-app-shell-brand-text' }, [
            h('span', { class: 'wf-app-shell-brand-name' }, name),
            subtitle ? h('small', { class: 'wf-app-shell-brand-sub' }, subtitle) : null,
          ]),
          isMobile ? h(Button, { size: 'sm', variant: 'ghost', title: '关闭菜单', 'aria-label': '关闭菜单', onClick: closeDrawer }, [h(Icon, { name: 'close', size: 16 })]) : null,
        ]),
        h('div', { class: 'wf-sidebar-body' }, [
          loading
            ? h('div', { class: 'wf-app-shell-skel' })
            : h(Menu, {
                items,
                activeKey: activeOf(nav, path),
                onSelect: (k: string)=> { onNavigate?.(k); closeDrawer() },
              }),
        ]),
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
                  onSettings ? h(Button, { size: 'sm', variant: 'ghost', title: ctx?.i18n?.components?.AppShell?.settings ?? '设置', onClick: onSettings }, [h(Icon, { name: 'settings', size: 16 })]) : null,
                  onLogout ? h(Button, { size: 'sm', variant: 'ghost', title: ctx?.i18n?.components?.AppShell?.logout ?? '退出登录', onClick: onLogout }, [h(Icon, { name: 'log-out', size: 16 })]) : null,
                ]),
              ]),
            ])
        ),
      ]),
      // 遮罩（抽屉开启——点击关闭）
      isMobile && drawerOpen ? h('div', { class: 'wf-app-shell-overlay', onClick: closeDrawer }) : null,
      // 右列（移动顶栏 + 主内容——AppLayout ap-body 对应）
      h('div', { class: 'wf-app-shell-body' }, [
        // 移动顶栏（<768——汉堡开抽屉 + 品牌 + 右侧设置）
        isMobile
          ? h(NavBar, {
              title: appName,
              align: 'left',
              fixed: true,
              left: h(Button, { size: 'sm', variant: 'ghost', title: '打开菜单', 'aria-label': '打开菜单', onClick: toggleDrawer }, [h(Icon, { name: 'menu', size: 20 })]),
              right: onSettings ? h(Button, { size: 'sm', variant: 'ghost', title: ctx?.i18n?.components?.AppShell?.settings ?? '设置', onClick: onSettings }, [h(Icon, { name: 'settings', size: 16 })]) : null,
            })
          : null,
        h('main', { class: 'wf-main' }, props.children),
      ]),
    ])
  }
}
