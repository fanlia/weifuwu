import type { Component, VNode } from '../../vdom/index.ts'
import { createClientBrowser } from '../../vdom/index.ts'
import type { UIContext, AppMiddleware } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Icon } from '../Icon/Icon.ts'
import type { IconName } from '../Icon/Icon.ts'

// 命令式 API：浏览器环境（SSR 不调用）
const browser = createClientBrowser()

export type NotificationType = 'success' | 'error' | 'info' | 'warning'
export type NotificationPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left'

export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  description?: string
  /** 自动关闭时间（ms），0 = 不自动关闭，默认 4500 */
  duration?: number
  action?: { label: string; onClick: () => void }
}

export interface NotificationProps {
  items?: NotificationItem[]
  onRemove?: (id: string) => void
  position?: NotificationPosition
  /** 全局默认自动关闭时间（ms），默认 4500 */
  duration?: number
  /** 最大显示条数，超出移除最早，默认 0 = 不限制 */
  max?: number
}

export interface NotificationOptions {
  position?: NotificationPosition
  duration?: number
  max?: number
}

function positionClass(pos: NotificationPosition): string {
  const map: Record<NotificationPosition, string> = {
    'top-right': 'wf-notification--tr',
    'top-left': 'wf-notification--tl',
    'bottom-right': 'wf-notification--br',
    'bottom-left': 'wf-notification--bl',
  }
  return map[pos] ?? 'wf-notification--tr'
}

function iconFor(type: NotificationType): IconName {
  switch (type) {
    case 'success': return 'check'
    case 'error': return 'close'
    case 'warning': return 'alert'
    case 'info': return 'info'
  }
}

/** 通知（对应 antd/EP Notification 队列式）：title + description + icon + 操作，聚合角落 */
export const Notification: Component<NotificationProps> = async (_init, ctx) => {
  // 统一 usePopup：常驻容器（positioning 'none'——CSS class 角落定位）
  const popup = ctx.ui.usePopup?.({
    positioning: 'none',
    closeOnOutside: false, closeOnEscape: false,
    isOpen: () => true,
    setOpen: () => {},
  })

  return async (props) => {
    const { items = [], onRemove, position = 'top-right', duration = 4500, max = 0 } = props

    const visible = max > 0 && items.length > max ? items.slice(-max) : items
    if (visible.length === 0) return null

    const cards = visible.map(t =>
      h('div', {
        class: `wf-notification wf-notification--${t.type}`,
        key: t.id,
        role: t.type === 'error' ? 'alert' : 'status',
        'aria-live': t.type === 'error' ? 'assertive' : 'polite',
        'data-id': t.id,
        'data-duration': (t.duration ?? duration) || undefined,
      }, [
        h('span', { class: 'wf-notification-icon' }, h(Icon, { name: iconFor(t.type) })),
        h('div', { class: 'wf-notification-body' }, [
          h('div', { class: 'wf-notification-title' }, t.title),
          t.description ? h('div', { class: 'wf-notification-desc' }, t.description) : null,
          t.action ? h('button', {
            class: 'wf-notification-action',
            type: 'button',
            onClick: (e: Event) => { e.stopPropagation(); t.action!.onClick() },
          }, t.action.label) : null,
        ].filter(Boolean)),
        h('button', {
          type: 'button',
          class: 'wf-notification-close',
          'aria-label': '关闭通知',
          onClick: () => onRemove?.(t.id),
        }, h(Icon, { name: 'close', size: 12 })),
      ].filter(Boolean))
    )

    return popup.portal(
      h('div', {
        class: `wf-notification-container ${positionClass(position)}`,
        'data-max': max || undefined,
      }, cards),
      'notification',
    )
  }
}

// ── 命令式中间件：ctx.notification() ──────────────────
// 对齐 antd notification.open / EP ElNotification 风格

export interface NotificationInjected {
  notification: {
    (title: string, opts?: { type?: NotificationType; description?: string; duration?: number; action?: NotificationItem['action'] }): void
    open: (opts: { type?: NotificationType; title: string; description?: string; duration?: number; action?: NotificationItem['action'] }) => void
    success: (opts: { title: string; description?: string; duration?: number }) => void
    error: (opts: { title: string; description?: string; duration?: number }) => void
    info: (opts: { title: string; description?: string; duration?: number }) => void
    warning: (opts: { title: string; description?: string; duration?: number }) => void
  }
}

