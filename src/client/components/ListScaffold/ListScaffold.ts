/** ListScaffold：列表页骨架（PageHeader + 工具栏 + loading/empty + 内容插槽）（showcase /components/listscaffold） */
import type { Component, VNodeChild } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { PageHeader } from '../PageHeader/PageHeader.ts'
import { EmptyState } from '../EmptyState/EmptyState.ts'
import { Loading } from '../Loading/Loading.ts'

/**
 * weifuwu/components — ListScaffold
 *
 * 列表页骨架原语：PageHeader + 搜索/工具区 + loading/empty 态 + 内容插槽。
 * 各页面差异在内容循环（render 插槽）——头部/状态区单点一致。
 * 组合 PageHeader/EmptyState/Loading（库内组合——无自有样式——布局类单源）。
 *
 * **empty 显式契约**（agent-platform ListScaffold 空态与列表并存 bug 修复——
 * 2027-09 沉淀入库）：empty 仅在 `isEmpty` 时渲染——**有数据也显示空态**
 * 的空态/列表并存已消除（原实现 empty 条件缺失 isEmpty——双段显示）。
 * loading 优先于 empty（加载中不闪空态）——空态在 loading 后判断。
 *
 * 来源：agent-platform ListScaffold（>1 消费者 Agents/Departments——
 * 入库判负登记已推翻：用户指令 = 框架层第二消费面确立）。
 */

export interface ListScaffoldProps {
  /** 页面标题（PageHeader title） */
  title: string
  /** 标题副文案 */
  sub?: string
  /** header 右区（按钮组——JSX 子元素面） */
  actions?: VNodeChild
  /** 搜索/筛选工具区（loading 时仍渲染——搜索框可用） */
  toolbar?: VNodeChild
  /** 加载中（loading 优先于 empty——不闪空态） */
  loading?: boolean
  /** 空态定义（图标/文案/提示） */
  empty?: { icon?: string | null; text?: string; hint?: string }
  /** 内容空（empty 仅在 isEmpty 时显示） */
  isEmpty?: boolean
  /** 内容插槽（页面核心循环——children 在 empty 之后——有数据时渲染） */
  children?: VNodeChild
}

export const ListScaffold: Component<ListScaffoldProps> = (_init, _ctx)=>
  (props)=> {
    const { title, sub, actions, toolbar, loading = false, empty, isEmpty = false, children } = props

    return h('div', { class: 'wf-stack wf-gap-lg' }, [
      h(PageHeader, { title, sub }, actions),
      toolbar,
      loading ? h(Loading) : null,
      !loading && empty && isEmpty
        ? h(EmptyState, { icon: empty.icon, text: empty.text, hint: empty.hint }, actions)
        : null,
      children,
    ])
  }
