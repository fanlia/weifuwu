import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface DividerProps {
  vertical?: boolean
  children?: any
}

export const Divider: Component<DividerProps> = (_init, _ctx) =>
  (props) => {
  const { vertical, children } = props

  if (vertical) {
    return h('div', { class: 'wf-divider wf-divider--vertical', role: 'separator' })
  }

  const cls = children ? 'wf-divider wf-divider--with-text' : 'wf-divider'

  return h('div', { class: cls, role: 'separator' }, children
    ? h('span', { class: 'wf-divider-text' }, children)
    : undefined
  )
}
