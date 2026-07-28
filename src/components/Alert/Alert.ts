import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

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

  const icon = h('span', { class: 'wf-alert-icon' }, iconFor(variant))

  const closeBtn = closable
    ? h('button', { class: 'wf-alert-close', onClick: onClose, type: 'button' }, '✕')
    : null

  const msg = h('span', { class: 'wf-alert-msg' }, children)

  return h('div', { class: `wf-alert wf-alert--${variant}`, role: 'alert' }, [icon, msg, closeBtn].filter(Boolean))
}

function iconFor(variant: AlertVariant): string {
  switch (variant) {
    case 'success': return '✓'
    case 'error': return '✕'
    case 'warning': return '⚠'
    case 'info': return 'ℹ'
  }
}
