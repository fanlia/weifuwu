import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface LoadingProps {
  text?: string
}

export const Loading: Component<LoadingProps> = (props, _ctx) => {
  const { text = '加载中...' } = props

  return h('div', { class: 'wf-loading', role: 'status', 'aria-live': 'polite' }, [
    h('div', { class: 'wf-loading-spinner' }),
    h('span', { class: 'wf-loading-text' }, text),
  ])
}
