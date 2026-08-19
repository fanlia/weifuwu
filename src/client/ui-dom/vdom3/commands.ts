/**
 * vdom3 commands — 命令式中间件（confirm/toast——vdom2 mountCommand 的 vdom3 等价）
 *
 * vdom2 的 confirm()/toast()（组件库）用 mountCommand 挂载——依赖 vdom2 引擎。
 * vdom3 适配：复用 Confirm/Toast 组件（vdom2 组件——hooks shim 可跑）——
 * createRoot 挂载到命令式容器——resolve 时 handle.unmount 清理。
 */

import type { VNode, Component, V3Ctx } from './types.ts'
import { h } from './jsx.ts'
import { getRenderer } from '../services/render-service.ts'
import '../engines/vdom3/adapter.ts' // 引擎自注册（命令式挂载依赖渲染服务——子路径/测试直接加载）
import { bindElementListener } from './delegate.ts'
import { Confirm } from '../../components/Confirm/Confirm.ts'
import { Notification } from '../../components/Notification/Notification.ts'
import type { NotificationItem, NotificationPosition, NotificationType } from '../../components/Notification/Notification.ts'

// ── confirm ──────────────────────────────────────────────

/** 命令式中间件注入类型（confirm/toast 挂到 ctx——中间件面） */
export interface V3CommandInjected {
  confirm(message: string, options?: Record<string, unknown>): Promise<boolean>
  toast(message: string, variant?: 'success' | 'error' | 'warning' | 'info'): void
}

/** 命令式确认（vdom3——createRoot 挂载 Confirm 组件——Modal portal 退场）
 *  泛型 ctx（兼容 UIRouter（UIContext）与 vdom3（V3Ctx）双入口） */
export function v3Confirm<C extends { [key: string]: unknown }>(): (ctx: C) => C & V3CommandInjected {
  return (ctx: C) => {
    ;(ctx as C & V3CommandInjected).confirm = (message: string, options?: Record<string, unknown>) =>
      createV3Confirm(message, options ?? {}, ctx as unknown as V3Ctx)
    return ctx as C & V3CommandInjected
  }
}

function createV3Confirm(message: string, options: Record<string, unknown>, _ctx: V3Ctx): Promise<boolean> {
  return new Promise((resolve) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    let settled = false
    let open = true
    // 包装组件（open 状态驱动——Modal 退场状态机自播动画）
    const Host: Component = async (_init, c) => {
      return async () => {
        return h('div', { class: 'wf-confirm-host' }, h(Confirm as unknown as Component, {
          open,
          title: options.title,
          // 取消/关闭统一走 onCancel（Confirm 组件内部 Modal 的 onClose 映射到
          // onCancel——此前只传 onClose → 取消按钮回调丢失 → 点击取消不关闭）
          onCancel: () => { if (!settled) { settled = true; open = false; resolve(false); c.ui.render() } },
          onConfirm: () => { if (!settled) { settled = true; open = false; resolve(true); c.ui.render() } },
          message,
        }))
      }
    }
    const handle = getRenderer().mountCommand(h(Host, {}), container, { ctx: { ..._ctx } })
    // 退场后清理（animationend 或兜底）
    const cleanup = () => {
      handle.unmount()
      container.remove()
    }
    const el = document.querySelector('#__wf_portal .wf-modal')
    if (el && typeof el.addEventListener === 'function') {
      let done = false
      const once = () => { if (!done) { done = true; cleanup() } }
      // 动画监听统一走事件代理（once 自动解绑——EVENT_UNBIND 可观测）
      bindElementListener(el, 'animationend', once as EventListener, true)
      setTimeout(once, 600)
    } else {
      cleanup()
    }
  })
}

// ── toast ────────────────────────────────────────────────

/** 命令式轻提示（vdom3——createRoot 挂载 Toast 组件——自动消失） */
export function v3Toast<C extends { [key: string]: unknown }>(): (ctx: C) => C & V3CommandInjected {
  return (ctx: C) => {
    ;(ctx as C & V3CommandInjected).toast = (message: string, variant: 'success' | 'error' | 'warning' | 'info' = 'info') =>
      createV3Toast(message, variant)
    return ctx as C & V3CommandInjected
  }
}

/** v3 toast：轻量自实现（不依赖 Toast 组件——其 import 链含 vdom2 context）
 *  portal 渲染 + wf-toast 样式类 + 自动消失 */
function createV3Toast(message: string, variant: 'success' | 'error' | 'warning' | 'info'): void {
  const container = document.createElement('div')
  container.className = 'wf-toast-host'
  container.style.cssText = 'position:fixed;top:16px;right:16px;z-index:var(--wf-z-toast,9999)'
  document.body.appendChild(container)
  const Host: Component = async () => async () =>
    h('div', { class: `wf-toast wf-toast--${variant}` }, h('span', { class: 'wf-toast-msg' }, message))
  const handle = getRenderer().mountCommand(h(Host, {}), container)
  // 自动消失（兜底清理）
  setTimeout(() => {
    handle.unmount()
    container.remove()
  }, 3000)
}

// ── notification ──────────────────────────────────────────

/** 命令式通知注入类型（vdom3——createRoot 挂载 Notification 组件） */
export interface V3NotificationInjected {
  notification: {
    (title: string, opts?: { type?: NotificationType; description?: string; duration?: number; action?: NotificationItem['action'] }): void
    open: (opts: { type?: NotificationType; title: string; description?: string; duration?: number; action?: NotificationItem['action'] }) => void
    success: (opts: { title: string; description?: string; duration?: number }) => void
    error: (opts: { title: string; description?: string; duration?: number }) => void
    info: (opts: { title: string; description?: string; duration?: number }) => void
    warning: (opts: { title: string; description?: string; duration?: number }) => void
  }
}

/** 通知全局默认配置（位置/时长/最大条数——antd notification.config 等价） */
export interface V3NotificationOptions {
  position?: NotificationPosition
  duration?: number
  max?: number
}

/** 命令式通知（vdom3——createRoot 挂载 Notification 组件——队列 + 自动消失）
 *  v2 的 notification() 中间件依赖 mountVNode/$——vdom2 删除后 demo 的
 *  ctx.notification 变静默 no-op（真实事故）——本实现为 vdom3 等价 */
export function v3Notification<C extends { [key: string]: unknown }>(
  opts?: V3NotificationOptions,
): (ctx: C) => C & V3NotificationInjected {
  const defaults = {
    position: opts?.position ?? 'top-right',
    duration: opts?.duration ?? 4500,
    max: opts?.max ?? 5,
  }
  // 队列状态（中间件实例级——惰性挂载首个通知时创建 host）
  let host: { add: (item: NotificationItem) => void } | null = null
  let seq = 0
  const emit = (item: Omit<NotificationItem, 'id'>) => {
    if (!host) host = createV3NotificationHost(defaults)
    host.add({ ...item, id: String(++seq) })
  }
  return (ctx: C) => {
    const api: V3NotificationInjected['notification'] = Object.assign(
      (title: string, item?: { type?: NotificationType; description?: string; duration?: number; action?: NotificationItem['action'] }) =>
        emit({ type: item?.type ?? 'info', title, description: item?.description, duration: item?.duration ?? defaults.duration, action: item?.action }),
      {
        open: (o: { type?: NotificationType; title: string; description?: string; duration?: number; action?: NotificationItem['action'] }) =>
          emit({ type: o.type ?? 'info', title: o.title, description: o.description, duration: o.duration ?? defaults.duration, action: o.action }),
        success: (o: { title: string; description?: string; duration?: number }) =>
          emit({ type: 'success', title: o.title, description: o.description, duration: o.duration ?? defaults.duration }),
        error: (o: { title: string; description?: string; duration?: number }) =>
          emit({ type: 'error', title: o.title, description: o.description, duration: o.duration ?? defaults.duration }),
        info: (o: { title: string; description?: string; duration?: number }) =>
          emit({ type: 'info', title: o.title, description: o.description, duration: o.duration ?? defaults.duration }),
        warning: (o: { title: string; description?: string; duration?: number }) =>
          emit({ type: 'warning', title: o.title, description: o.description, duration: o.duration ?? defaults.duration }),
      },
    )
    ;(ctx as C & V3NotificationInjected).notification = api
    return ctx as C & V3NotificationInjected
  }
}

/** v3 notification host：持久挂载 Notification 组件（items 队列状态驱动） */
function createV3NotificationHost(defaults: { position: NotificationPosition; duration: number; max: number }): {
  add: (item: NotificationItem) => void
} {
  const container = document.createElement('div')
  container.className = 'wf-notification-host'
  document.body.appendChild(container)
  let items: NotificationItem[] = []
  const timers = new Map<string, ReturnType<typeof setTimeout>>()
  const remove = (id: string) => {
    const t = timers.get(id)
    if (t) { clearTimeout(t); timers.delete(id) }
    items = items.filter((i) => i.id !== id)
    handle.rerender()
  }
  const Host: Component = async () => async () =>
    h('div', { class: 'wf-notification-host' }, h(Notification as unknown as Component, {
      items,
      position: defaults.position,
      duration: defaults.duration,
      max: defaults.max,
      onRemove: (id: string) => remove(id),
    }))
  const handle = getRenderer().mountCommand(h(Host, {}), container)
  return {
    add: (item: NotificationItem) => {
      items = [...items, item]
      handle.rerender()
      if (item.duration && item.duration > 0) {
        timers.set(item.id, setTimeout(() => remove(item.id), item.duration))
      }
    },
  }
}
