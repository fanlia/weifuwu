import type { Component } from '../../ui-dom/vnode.ts'
import { createClientBrowser } from '../../ui-dom/browser.ts'
import type { WfuiContext, AppMiddleware } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'
import { mountCommand } from '../../ui-dom/vdom/mount.ts'
import { animateOut } from '../../ui-dom/motion.ts'
import { Icon } from '../Icon/Icon.ts'
import type { IconName } from '../Icon/Icon.ts'

// 命令式 API：浏览器环境（SSR 不调用）
const browser = createClientBrowser()

export type ToastType = 'success' | 'error' | 'info' | 'warning'
export type ToastPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center'

export interface ToastItem {
  id: string
  type: ToastType
  message: string
  /** 此条目的自动消失时间（ms），覆盖 Toast 的默认 duration */
  duration?: number
  /** 操作按钮（如"撤销"）：点击不自动关闭，由回调自行移除 */
  action?: { label: string; onClick: () => void }
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

export const Toast: Component<ToastProps> = async (_init, ctx) =>
  async (props) => {
  const { toasts = [], onRemove, position = 'top-right', duration = 0, max = 0 } = props

  // 统一 usePopup：常驻容器（positioning 'none'——CSS class 角落定位）
  const popup = ctx.ui.usePopup?.({
    positioning: 'none',
    closeOnOutside: false, closeOnEscape: false,
    isOpen: () => true,   // 容器常驻（toast 内容动态增删）
    setOpen: () => {},
  })

  // 限制最大显示条数
  const visible = max > 0 && toasts.length > max ? toasts.slice(-max) : toasts

  if (visible.length === 0) return null

  const items = visible.map(t =>
    h('div', {
      class: `wf-toast wf-toast--${t.type}`,
      key: t.id,
      role: t.type === 'error' ? 'alert' : 'status',
      'aria-live': t.type === 'error' ? 'assertive' : 'polite',
      'data-id': t.id,
      'data-duration': (t.duration ?? duration) || undefined,
      onClick: onRemove ? () => onRemove(t.id) : undefined,
    }, [
      h('span', { class: 'wf-toast-icon' }, h(Icon, { name: iconFor(t.type) })),
      h('span', { class: 'wf-toast-msg' }, t.message),
      t.action
        ? h('button', {
            class: `wf-toast-action wf-toast-action--${t.type}`,
            type: 'button',
            onClick: (e: Event) => { e.stopPropagation(); t.action!.onClick() },
          }, t.action.label)
        : null,
    ].filter(Boolean))
  )

  return popup.portal(
    h('div', {
      class: `wf-toast-container ${positionClass(position)}`,
      'data-max': max || undefined,
    }, items),
    'toast',
  )
  }

function iconFor(type: ToastType): IconName {
  switch (type) {
    case 'success': return 'check'
    case 'error': return 'close'
    case 'warning': return 'alert'
    case 'info': return 'info'
  }
}

// ── 命令式中间件：ctx.toast() ────────────────────────
// 首次调用时惰性挂载 ToastHost 组件到独立容器。
// ToastHost 内部持有 $.toasts 状态（$ 赋值自动触发渲染），
// 中间件只负责桥接 add/remove + 自动消失定时器。

/** 命令式 ctx.toast 的注入类型（AppMiddleware<{}, ToastInjected>） */
export interface ToastInjected {
  toast: (message: string, type?: ToastType, duration?: number, action?: { label: string; onClick: () => void }) => void
}

export function toast(opts?: ToastOptions): AppMiddleware<{}, ToastInjected> {
  const defaults = {
    position: opts?.position ?? 'top-right',
    duration: opts?.duration ?? 3000,
    max: opts?.max ?? 3,
  }

  // ── 工厂闭包内状态（per app 隔离） ──
  let hostApi: { add: (item: ToastItem) => void; remove: (id: string) => void } | null = null
  let ctxRef: WfuiContext | null = null
  let seq = 0

  // ToastHost — 内部常驻组件：状态 let + 显式 render（render-only）
  const ToastHost: Component = async (_init, ctx) => {
    let toasts: ToastItem[] = []
    const render = () => ctx.ui.render()
    hostApi = {
      add: (item: ToastItem) => { toasts = [...toasts, item]; render() },
      remove: (id: string) => {
        // 退场：挂 wf-toast-out 类，有真实动画则播完再移除；无动画环境（jsdom/禁用）立即移除
        const el = browser.query(`.wf-toast[data-id="${id}"]`) as HTMLElement | null
        if (el) {
          el.classList.add('wf-toast-out')
          const anim = getComputedStyle(el).animationName
          if (anim && anim !== 'none') {
            animateOut(el, () => {
              toasts = toasts.filter((t: ToastItem) => t.id !== id); render()
            })
            return
          }
        }
        toasts = toasts.filter((t: ToastItem) => t.id !== id); render()
      },
    }
    // 总是返回包装 div（非 null）——保证 _refNode 有值，scope render 能定位本组件
    return async () => h('div', { class: 'wf-toast-host' }, [
        h(Toast, {
          toasts,
          position: defaults.position,
          duration: defaults.duration,
          max: defaults.max,
          onRemove: (id: string) => hostApi?.remove(id),
      }),
    ])
  }

  const ensureHost = () => {
    if (hostApi || !ctxRef) return
    const container = browser.createElement('div') as HTMLDivElement | null
    if (!container) return
    browser.bodyAppend(container)
    mountCommand(container, h(ToastHost, {}), ctxRef)
  }

  return (ctx: WfuiContext) => {
    ctxRef = ctx
    ;(ctx as any).toast = (message: string, type: ToastType = 'info', duration?: number, action?: { label: string; onClick: () => void }) => {
      ensureHost()
      const id = String(++seq)
      hostApi?.add({ id, type, message, duration, action })
      const t = duration ?? defaults.duration
      if (t > 0) {
        setTimeout(() => hostApi?.remove(id), t)
      }
    }
    return ctx as WfuiContext & ToastInjected
  }
}
