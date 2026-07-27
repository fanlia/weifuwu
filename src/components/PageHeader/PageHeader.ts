import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface PageHeaderProps {
  title: string
  sub?: string
  children?: any
}

export const PageHeader: Component<PageHeaderProps> = (props, _ctx) => {
  const { title, sub, children } = props

  return h('div', { class: 'wf-page-head' }, [
    h('div', { class: 'wf-page-head-left' }, [
      h('h2', { class: 'wf-page-title' }, title),
      sub ? h('p', { class: 'wf-page-sub' }, sub) : null,
    ].filter(Boolean)),
    children ? h('div', { class: 'wf-page-head-actions' }, children) : null,
  ].filter(Boolean))
}
