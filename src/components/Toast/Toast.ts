import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, createPortal } from '../../client/vnode.ts'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface ToastItem {
  id: string
  type: ToastType
  message: string
}

export interface ToastProps {
  toasts?: ToastItem[]
  onRemove?: (id: string) => void
}

export const Toast: Component<ToastProps> = (props, _ctx) => {
  const { toasts = [], onRemove } = props

  if (toasts.length === 0) return null

  const items = toasts.map(t =>
    h('div', {
      class: `wf-toast wf-toast--${t.type}`,
      key: t.id,
      onClick: onRemove ? () => onRemove(t.id) : undefined,
    }, [
      h('span', { class: 'wf-toast-icon' }, iconFor(t.type)),
      h('span', { class: 'wf-toast-msg' }, t.message),
    ])
  )

  return createPortal(
    h('div', { class: 'wf-toast-container' }, items),
    'toast',
  )
}

function iconFor(type: ToastType): string {
  switch (type) {
    case 'success': return '✓'
    case 'error': return '✕'
    case 'warning': return '⚠'
    case 'info': return 'ℹ'
  }
}
