import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

export interface LoadingProps {
  text?: string
}

export const Loading: Component<LoadingProps> = async (_init, _ctx) =>
  async (props) => {
  const { text = '加载中...' } = props

  return h('div', { class: 'wf-loading', role: 'status', 'aria-live': 'polite' }, [
    h('div', { class: 'wf-loading-spinner' }),
    h('span', { class: 'wf-loading-text' }, text),
  ])
}
