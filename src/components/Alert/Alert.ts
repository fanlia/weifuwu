import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'
import { Icon } from '../Icon/Icon.ts'
import type { IconName } from '../Icon/Icon.ts'

export type AlertVariant = 'info' | 'success' | 'warning' | 'error'

export interface AlertProps {
  variant?: AlertVariant
  closable?: boolean
  onClose?: () => void
  children?: any
}

export const Alert: Component<AlertProps> = (_init, _ctx) =>
  (props) => {
  const { variant = 'info', closable, onClose, children } = props

  if (!children) return null

  const icon = h('span', { class: 'wf-alert-icon' }, h(Icon, { name: iconFor(variant) }))

  const closeBtn = closable
    ? h('button', { class: 'wf-alert-close', onClick: onClose, type: 'button', 'aria-label': '关闭' }, h(Icon, { name: 'close' }))
    : null

  const msg = h('span', { class: 'wf-alert-msg' }, children)

  return h('div', { class: `wf-alert wf-alert--${variant}`, role: 'alert' }, [icon, msg, closeBtn].filter(Boolean))
}

function iconFor(variant: AlertVariant): IconName {
  switch (variant) {
    case 'success': return 'check'
    case 'error': return 'close'
    case 'warning': return 'alert'
    case 'info': return 'info'
  }
}
