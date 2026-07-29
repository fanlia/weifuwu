import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, createPortal } from '../../client/vnode.ts'

export type ToastType = 'success' | 'error' | 'info' | 'warning'
export type ToastPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center'

export interface ToastItem {
  id: string
  type: ToastType
  message: string
  /** 此条目的自动消失时间（ms），覆盖 Toast 的默认 duration */
  duration?: number
}

export interface ToastProps {
  toasts?: ToastItem[]
  onRemove?: (id: string) => void
  /** 容器位置，默认 top-right */
  position?: ToastPosition
  /** 全局默认自动消失时间（ms），0 = 不自动消失，默认 0 */
  duration?: number
  /** 最大显示条数，超出时移除最早条目，默认 0 = 不限制 */
  max?: number
}

function positionClass(pos: ToastPosition): string {
  const map: Record<ToastPosition, string> = {
    'top-right': 'wf-toast--tr',
    'top-left': 'wf-toast--tl',
    'bottom-right': 'wf-toast--br',
    'bottom-left': 'wf-toast--bl',
    'top-center': 'wf-toast--tc',
  }
  return map[pos] ?? 'wf-toast--tr'
}

export const Toast: Component<ToastProps> = (_init, ctx) =>
  (props) => {
  const { toasts = [], onRemove, position = 'top-right', duration = 0, max = 0 } = props

  // 限制最大显示条数
  const visible = max > 0 && toasts.length > max ? toasts.slice(-max) : toasts

  if (visible.length === 0) return null

  const items = visible.map(t =>
    h('div', {
      class: `wf-toast wf-toast--${t.type}`,
      key: t.id,
      'data-duration': (t.duration ?? duration) || undefined,
      onClick: onRemove ? () => onRemove(t.id) : undefined,
    }, [
      h('span', { class: 'wf-toast-icon' }, iconFor(t.type)),
      h('span', { class: 'wf-toast-msg' }, t.message),
    ])
  )

  return createPortal(
    h('div', {
      class: `wf-toast-container ${positionClass(position)}`,
      'data-max': max || undefined,
    }, items),
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
