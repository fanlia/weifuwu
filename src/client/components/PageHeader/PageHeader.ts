import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface PageHeaderProps {
  title: string
  sub?: string
  /** 顶级页面大标题（display 档 30px），默认 21px */
  display?: boolean
  children?: any
}

export const PageHeader: Component<PageHeaderProps> = async (_init, _ctx) =>
  async (props) => {
  const { title, sub, display, children } = props

  return h('div', { class: 'wf-page-head' }, [
    h('div', { class: 'wf-page-head-left' }, [
      h('h2', { class: `wf-page-title${display ? ' wf-page-title--display' : ''}` }, title),
      sub ? h('p', { class: 'wf-page-sub' }, sub) : null,
    ].filter(Boolean)),
    children ? h('div', { class: 'wf-page-head-actions' }, children) : null,
  ].filter(Boolean))
}
