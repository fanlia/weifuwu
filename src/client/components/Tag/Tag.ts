import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'
import { Icon } from '../Icon/Icon.ts'

export interface TagProps {
  closable?: boolean
  onClose?: () => void
  variant?: 'default' | 'primary' | 'success' | 'danger'
  children?: any
}

export const Tag: Component<TagProps> = async (_init, _ctx) =>
  async (props) => {
  const { closable, onClose, variant = 'default', children } = props

  const closeBtn = closable
    ? h('button', { class: 'wf-tag-close', onClick: onClose, type: 'button', 'aria-label': '移除' }, h(Icon, { name: 'close' }))
    : null

  return h('span', { class: `wf-tag wf-tag--${variant}` }, [
    h('span', { class: 'wf-tag-text' }, children),
    closeBtn,
  ].filter(Boolean))
}
