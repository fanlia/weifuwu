/**
 * weifuwu/components — Layout 布局外壳
 *
 * 三库等价：antd Layout / Element Plus Container / shadcn Sidebar。
 * 复合子组件模式（无命名空间——独立导出）：
 *
 *   <Layout>
 *     <LayoutSider collapsible collapsed onCollapse>导航</LayoutSider>
 *     <Layout>
 *       <LayoutHeader>顶部</LayoutHeader>
 *       <LayoutContent>主区</LayoutContent>
 *       <LayoutFooter>底部</LayoutFooter>
 *     </Layout>
 *   </Layout>
 *
 * - 含 LayoutSider → row（横向：侧栏 + 主区）；否则 column（纵向）
 * - Sider 折叠：collapsible + 受控 collapsed/onCollapse（非受控点击触发器内部切换）
 * - 响应式折叠交还用户：useBreakpoint 驱动 collapsed（裁剪：不自动抽屉化）
 * - 静态外壳见 layout `_app-shell.css`（wf-app-shell/wf-sidebar/wf-main）
 */

import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface LayoutProps {
  style?: any
  className?: string
  children?: any
}

export interface LayoutSiderProps {
  width?: number | string
  /** 折叠宽度（默认 64px——图标栏） */
  collapsedWidth?: number | string
  collapsed?: boolean
  /** 显示折叠触发器（底部条） */
  collapsible?: boolean
  onCollapse?: (collapsed: boolean) => void
  /** 触发器内容（默认 chevron Icon） */
  trigger?: any
  children?: any
}

export interface LayoutHeaderProps { children?: any; style?: any }
export interface LayoutContentProps { children?: any; style?: any }
export interface LayoutFooterProps { children?: any; style?: any }

const SIDER = Symbol('LayoutSider')

/** 布局容器：含 Sider → row（横向），否则 column（纵向） */
export const Layout: Component<LayoutProps> = async (_init) =>
  async (props) => {
    const kids = Array.isArray(props.children) ? props.children : [props.children]
    const hasSider = kids.some((c: any) => c?.type === LayoutSider)
    return h('div', {
      class: ['wf-layout', hasSider ? 'wf-layout--row' : 'wf-layout--column', props.className].filter(Boolean).join(' '),
      style: props.style,
      'data-layout': hasSider ? 'row' : 'column',
    }, props.children)
  }

/** 侧边栏（唯一可折叠部件） */
export const LayoutSider: Component<LayoutSiderProps> = async (_init, ctx: WfuiContext) => {
  // ── mount（只一次）──
  let collapsed = _init?.collapsed ?? false
  let latestCollapsed: boolean | undefined = _init?.collapsed
  let latestOnCollapse: ((v: boolean) => void) | undefined
  let latestCollapsible = false

  const toggle = () => {
    const next = !latestCollapsed
    if (latestOnCollapse) {
      latestOnCollapse(next) // 受控：回调由父组件更新 collapsed
    } else {
      collapsed = next // 非受控：内部切换
      ctx.ui.render()
    }
  }

  // ── render（每次 dirty/props 变化）──
  return async (props) => {
    latestCollapsed = props.collapsed
    latestOnCollapse = props.onCollapse
    latestCollapsible = !!props.collapsible
    // 受控优先（props.collapsed 定义）；否则内部态
    const isCollapsed = props.collapsed !== undefined ? !!props.collapsed : collapsed
    const width = isCollapsed
      ? props.collapsedWidth ?? 'var(--wf-layout-sider-collapsed-width, 64px)'
      : props.width ?? 'var(--wf-layout-sider-width, 240px)'

    const children: any[] = [
      h('div', { class: 'wf-layout-sider-body' }, props.children),
    ]
    if (latestCollapsible) {
      children.push(h('button', {
        class: 'wf-layout-sider-trigger',
        'aria-label': isCollapsed ? '展开侧边栏' : '折叠侧边栏',
        onClick: () => toggle(),
      }, props.trigger ?? h('span', { class: `wf-layout-sider-trigger-icon${isCollapsed ? ' is-collapsed' : ''}` }, '◂')))
    }
    return h('aside', {
      class: `wf-layout-sider${isCollapsed ? ' wf-layout-sider--collapsed' : ''}`,
      style: { width },
      'data-collapsed': isCollapsed ? 'true' : 'false',
    }, children)
  }
}
(LayoutSider as any)[SIDER] = true

/** 顶部栏 */
export const LayoutHeader: Component<LayoutHeaderProps> = async (_init) =>
  async (props) => h('header', { class: 'wf-layout-header', style: props.style }, props.children)

/** 主内容区（撑满剩余空间 + 可滚动） */
export const LayoutContent: Component<LayoutContentProps> = async (_init) =>
  async (props) => h('main', { class: 'wf-layout-content', style: props.style }, props.children)

/** 底部栏 */
export const LayoutFooter: Component<LayoutFooterProps> = async (_init) =>
  async (props) => h('footer', { class: 'wf-layout-footer', style: props.style }, props.children)
