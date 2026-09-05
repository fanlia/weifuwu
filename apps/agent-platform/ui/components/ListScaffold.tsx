/**
 * 列表页骨架原语（web W2——>1 消费者入库：Agents/Departments 先例）
 *
 * 样板（PageHeader + 搜索区 + loading/empty 态 + 内容插槽）——各页差异在
 * 内容循环（render 插槽）——头部/状态区单点一致。框架已有 PageHeader/
 * EmptyState/Loading（weifuwu/components）——本原语组合它们（平台层——
 * 框架层无第二消费者——判负登记）。
 */
import type { Component } from 'weifuwu/vdom'
import { PageHeader, EmptyState, Loading } from 'weifuwu/components'

export type ListScaffoldProps = {
  title: string
  sub?: string
  /** header 右区（按钮组——JSX 子元素面——与框架 PageHeader children 同款 any） */
  actions?: any
  /** 搜索/筛选工具区 */
  toolbar?: any
  /** 加载中（null 区仍渲染 toolbar——搜索框可用） */
  loading?: boolean
  /** 空态（loading 后且无内容时） */
  empty?: { icon: string; text: string; hint?: string }
  /** 内容插槽（页面核心循环） */
  children?: any
}

export const ListScaffold: Component<ListScaffoldProps> = (init, _ctx) => {
  return (props) => (
    <div class="wf-stack wf-gap-lg">
      <PageHeader title={props.title} sub={props.sub}>
        {props.actions}
      </PageHeader>
      {props.toolbar}
      {props.loading && <Loading />}
      {!props.loading && props.empty && (
        <EmptyState icon={props.empty.icon} text={props.empty.text} hint={props.empty.hint}>
          {props.actions}
        </EmptyState>
      )}
      {props.children}
    </div>
  )
}
