import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'

export interface DividerProps {
  vertical?: boolean
  children?: any
}

export const Divider: Component<DividerProps> = async (_init, _ctx) =>
  async (props) => {
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
