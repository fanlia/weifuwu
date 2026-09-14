/** Loading：加载状态，支持自定义文字（showcase /components/loading） */
import type { Component } from '../../../../level6/client/vdom/index.ts'
import type { UIContext } from '../../../../level6/client/vdom/index.ts'
import { h } from '../../../../level6/client/vdom/index.ts'

export interface LoadingProps {
  text?: string
}

export const Loading: Component<LoadingProps> = (_init, _ctx)=>
  (props)=> {
  const { text = '加载中...' } = props

  return h('div', { class: 'wf-loading', role: 'status', 'aria-live': 'polite' }, [
    h('div', { class: 'wf-loading-spinner' }),
    h('span', { class: 'wf-loading-text' }, text),
  ])
}
