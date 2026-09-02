/**
 * weifuwu/components — NavBar 移动端顶栏（antd-mobile NavBar / MUI AppBar 对位）
 *
 * 移动端 App 应用外壳顶栏：left 槽（返回/菜单按钮）+ 标题（单行截断）+ right 槽
 * （操作按钮）——消费侧手搓实证 agent-platform `ap-topbar`
 * （apps/agent-platform/ui/components/AppLayout.tsx:142——汉堡 + 品牌 + 设置）。
 *
 * 与近义组件区分（易混对照——components-map）：
 * - PageHeader = 桌面**页内容**标题 + 操作区（页面内）；NavBar = 移动端**外壳**顶栏
 * - AppShell/Layout = 整壳（侧栏+内容）；NavBar 独立组件——应用层组合
 *   （与 TabBar 独立同构——顶部对位）
 *
 * 纪律：
 * - 纯展示壳——无内部状态（交互全在调用方 VNode——组合式）
 * - fixed = position:sticky（滚动常驻——ap-topbar 实证）+ safe-area-inset-top 避让
 * - 标题对齐：align='center'（iOS 语义——默认）/ 'left'（品牌左对齐——ap-topbar 实证）
 */
import type { Component } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

export interface NavBarProps {
  /** 标题（单行截断——不传 = 纯工具栏） */
  title?: string
  /** 左区任意 VNode（返回/菜单按钮——组合式） */
  left?: any
  /** 右区任意 VNode（操作按钮） */
  right?: any
  /** 标题对齐（默认 'center'——iOS 语义；'left'——品牌左对齐） */
  align?: 'left' | 'center'
  /** sticky 常驻（position:sticky top:0 + safe-area-inset-top——移动端 App 顶栏） */
  fixed?: boolean
  className?: string
}

export const NavBar: Component<NavBarProps> = (_init, _ctx) => (props) => {
  const { title, left, right, align = 'center', fixed, className } = props
  return h('header', {
    class: ['wf-nav-bar', fixed ? 'wf-nav-bar--fixed' : '', className ?? ''].filter(Boolean).join(' '),
  }, [
    left ? h('div', { class: 'wf-nav-bar-side' }, left) : null,
    title !== undefined && title !== null
      ? h('div', { class: `wf-nav-bar-title${align === 'left' ? ' wf-nav-bar-title--left' : ''}` }, title)
      : null,
    right ? h('div', { class: 'wf-nav-bar-side' }, right) : null,
  ].filter(Boolean))
}
