import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface LoadingProps {
  text?: string
}

export const Loading: Component<LoadingProps> = async (_init, _ctx) =>
  (props) => {
  const { text = '加载中...' } = props

  return h('div', { class: 'wf-loading', role: 'status', 'aria-live': 'polite' }, [
    h('div', { class: 'wf-loading-spinner' }),
    h('span', { class: 'wf-loading-text' }, text),
  ])
}
