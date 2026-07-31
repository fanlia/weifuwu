import type { Component } from '../../client/vnode.ts'
import type { WfuiContext, AppMiddleware } from '../../client/types.ts'
import { h, createPortal } from '../../client/vnode.ts'
import { mountVNode } from '../../client/render.ts'

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

/** 命令式 ctx.toast 的全局配置 */
export interface ToastOptions {
  position?: ToastPosition
  /** 默认自动消失时间（ms），0 = 不消失，默认 3000 */
  duration?: number
  /** 最大显示条数，超出移除最早，默认 3 */
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

// ── 命令式中间件：ctx.toast() ────────────────────────
// 首次调用时惰性挂载 ToastHost 组件到独立容器。
// ToastHost 内部持有 $.toasts 状态（$ 赋值自动触发渲染），
// 中间件只负责桥接 add/remove + 自动消失定时器。

export function toast(opts?: ToastOptions): AppMiddleware {
  const defaults = {
    position: opts?.position ?? 'top-right',
    duration: opts?.duration ?? 3000,
    max: opts?.max ?? 3,
  }

  // ── 工厂闭包内状态（per app 隔离） ──
  let hostApi: { add: (item: ToastItem) => void; remove: (id: string) => void } | null = null
  let ctxRef: WfuiContext | null = null
  let seq = 0

  // ToastHost — 内部常驻组件：状态在 $ 里，赋值自动渲染
  const ToastHost: Component = (_init, ctx) => {
    const $ = ctx.ui.$()
    $.toasts = []
    hostApi = {
      add: (item: ToastItem) => { $.toasts = [...$.toasts, item] },
      remove: (id: string) => { $.toasts = $.toasts.filter((t: ToastItem) => t.id !== id) },
    }
    // 总是返回包装 div（非 null）——保证 _refNode 有值，scope render 能定位本组件
    return () => h('div', { class: 'wf-toast-host' }, [
      h(Toast, {
        toasts: $.toasts,
        position: defaults.position,
        duration: defaults.duration,
        max: defaults.max,
        onRemove: (id: string) => hostApi?.remove(id),
      }),
    ])
  }

  const ensureHost = () => {
    if (hostApi || !ctxRef) return
    const container = document.createElement('div')
    document.body.appendChild(container)
    mountVNode(container, h(ToastHost, {}), ctxRef)
  }

  return (ctx: WfuiContext) => {
    ctxRef = ctx
    ;(ctx as any).toast = (message: string, type: ToastType = 'info', duration?: number) => {
      ensureHost()
      const id = String(++seq)
      hostApi?.add({ id, type, message, duration })
      const t = duration ?? defaults.duration
      if (t > 0) {
        setTimeout(() => hostApi?.remove(id), t)
      }
    }
    return ctx
  }
}
