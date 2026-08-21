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
/**
 * 命令式中间件：ctx.notification()（队列式——聚合角落——自动消失）
 *
 * 真实 bug（2026-12 showcase QA）：NotificationInjected 契约定义了实现缺失
 * ——showcase Notification demo 静默失效（ctx.notification undefined）——
 * 补全：模块级队列 + 常驻容器 + diff 重渲染（Notification 组件真实实例）。
 */
import { renderToStream } from '../../vdom/core/build.ts'
import { diffStream } from '../../vdom/core/diff/index.ts'
import { CommandApplier } from '../../vdom/core/patch/index.ts'
import { createComponentRegistry } from '../../vdom/core/node/component.ts'
import type { ComponentRegistry } from '../../vdom/core/node/component.ts'

type NotifHost = {
  container: HTMLDivElement
  applier: CommandApplier
  registry: ComponentRegistry
  items: NotificationItem[]
  seq: number
  currentTree: VNode | null
  ctx: UIContext
}

let notifHost: NotifHost | null = null

function ensureHost(): NotifHost {
  if (notifHost) return notifHost
  const container = document.createElement('div')
  container.className = 'wf-notification-host'
  document.body.appendChild(container)
  const registry = createComponentRegistry()
  const applier = new CommandApplier(container, document, registry)
  const ctx = {
    render: async () => {},
    onUnmount: () => {},
    data: { get: async () => undefined, set: () => {}, has: () => false },
    browser,
  } as unknown as UIContext
  notifHost = { container, applier, registry, items: [], seq: 0, currentTree: null, ctx }
  return notifHost
}

function renderNotifs(host: NotifHost): void {
  const vnode = h(Notification, {
    items: host.items,
    onRemove: (id: string) => { removeNotif(id) },
  }) as VNode
  const stream = host.currentTree
    ? diffStream(host.currentTree, vnode, host.ctx, host.registry)
    : renderToStream(vnode, host.ctx, host.registry)
  host.currentTree = vnode
  stream.pipeTo(new WritableStream({ write(cmd) { host.applier.apply(cmd) } })).catch(() => {})
}

function removeNotif(id: string): void {
  if (!notifHost) return
  notifHost.items = notifHost.items.filter((t) => t.id !== id)
  if (notifHost.items.length === 0) {
    notifHost.applier.dispose()
    notifHost.container.remove()
    notifHost = null
  } else {
    renderNotifs(notifHost)
  }
}

function openNotif(opts: {
  type: NotificationType
  title: string
  description?: string
  duration?: number
  action?: NotificationItem['action']
}): void {
  const host = ensureHost()
  const item: NotificationItem = { id: `n${++host.seq}`, ...opts }
  host.items = [...host.items, item]
  renderNotifs(host)
  const dur = opts.duration ?? 4500
  if (dur > 0) {
    setTimeout(() => removeNotif(item.id), dur)
  }
}

/** 命令式入口（对齐 antd notification.open 风格——可调用可链式） */
export const notification: NotificationInjected['notification'] = Object.assign(
  (title: string, opts?: { type?: NotificationType; description?: string; duration?: number; action?: NotificationItem['action'] }): void =>
    openNotif({ type: opts?.type ?? 'info', title, description: opts?.description, duration: opts?.duration, action: opts?.action }),
  {
    open: (o: { type?: NotificationType; title: string; description?: string; duration?: number; action?: NotificationItem['action'] }) =>
      openNotif({ type: o.type ?? 'info', title: o.title, description: o.description, duration: o.duration, action: o.action }),
    success: (o: { title: string; description?: string; duration?: number }) => openNotif({ type: 'success', ...o }),
    error: (o: { title: string; description?: string; duration?: number }) => openNotif({ type: 'error', ...o }),
    info: (o: { title: string; description?: string; duration?: number }) => openNotif({ type: 'info', ...o }),
    warning: (o: { title: string; description?: string; duration?: number }) => openNotif({ type: 'warning', ...o }),
  },
)

/**
 * 命令式中间件：注入 ctx.notification()（AppMiddleware 形态——应用装配）
 */
export function notificationMiddleware<C extends Record<string, unknown>>(ctx: C): C & NotificationInjected {
  return Object.assign(ctx, { notification })
}

export const Notification: Component<NotificationProps> = async (_init, ctx) => {
  // 命令式弹窗（唯一形态 openPopup）：常驻容器（positioning 'none'——CSS 角落定位）
  /** 命令式句柄（唯一形态——openPopup——组件内部同步样板） */
  let handle: import('../../vdom/hooks/popup-manager.ts').PopupHandle | null = null

  return async (props) => {
    const { items = [], onRemove, position = 'top-right', duration = 4500, max = 0 } = props

    const visible = max > 0 && items.length > max ? items.slice(-max) : items
    if (visible.length === 0) {
      if (handle) { handle.close(); handle = null }
      return null
    }

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

    const container = h('div', {
      class: `wf-notification-container ${positionClass(position)}`,
      'data-max': max || undefined,
    }, cards)

    // 命令式同步（常驻容器——内容更新）
    if (!handle)
      handle = ctx.ui.openPopup({
        key: 'notification',
        positioning: 'none',
        closeOnOutside: false, closeOnEscape: false,
        content: () => container,
        onClose: () => { handle = null },
      })
    else handle.update(container)
    return null
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

