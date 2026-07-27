import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export interface TagProps {
  closable?: boolean
  onClose?: () => void
  variant?: 'default' | 'primary' | 'success' | 'danger'
  children?: any
}

export const Tag: Component<TagProps> = (props, _ctx) => {
  const { closable, onClose, variant = 'default', children } = props

  const closeBtn = closable
    ? h('button', { class: 'wf-tag-close', onClick: onClose, type: 'button' }, '✕')
    : null

  return h('span', { class: `wf-tag wf-tag--${variant}` }, [
    h('span', { class: 'wf-tag-text' }, children),
    closeBtn,
  ].filter(Boolean))
}
