import type { Component } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'

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
