/**
 * vdom/middlewares/toast — 命令式 toast（vdom 引擎版）
 *
 * 注入 ctx.toast(msg, type?, duration?, action?)——常驻 ToastHost 组件驱动
 * $ 状态，vdom scheduler 精准刷新。中间件工厂闭包持有 host 状态（per app 隔离）。
 */

import type { WfuiContext } from '../../types.ts'
import { h, type VNode } from '../../vnode.ts'
import { Toast, type ToastItem, type ToastType } from '../../../components/Toast/Toast.ts'
import { createClientBrowser } from '../../browser.ts'
import { mountCommand, unmountCommand } from './host.ts'

/** 命令式 ctx.toast 的注入类型 */
export interface ToastInjected {
  toast: (message: string, type?: ToastType, duration?: number, action?: { label: string; onClick: () => void }) => void
}

export interface ToastOptions {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center'
  duration?: number
  max?: number
}

export function toast(opts?: ToastOptions): (ctx: WfuiContext) => WfuiContext & ToastInjected {
  const defaults = {
    position: opts?.position ?? 'top-right',
    duration: opts?.duration ?? 3000,
    max: opts?.max ?? 3,
  }

  // ── 工厂闭包内状态（per app 隔离） ──
  let hostApi: { add: (item: ToastItem) => void; remove: (id: string) => void } | null = null
  let ctxRef: WfuiContext | null = null
  let container: HTMLDivElement | null = null
  let hostVnode: VNode | null = null
  let seq = 0

  // ToastHost — 内部常驻组件：状态在 $ 里，赋值自动渲染（vdom scheduler）
  const ToastHost: any = async (_init: any, ctx: any) => {
    const $ = ctx.ui.$()
    $.toasts = []
    const browser = createClientBrowser()
    hostApi = {
      add: (item: ToastItem) => { $.toasts = [...$.toasts, item] },
      remove: (id: string) => {
        const el = browser.query(`.wf-toast[data-id="${id}"]`) as HTMLElement | null
        if (el) {
          el.classList.add('wf-toast-out')
          const anim = getComputedStyle(el).animationName
          if (anim && anim !== 'none') {
            // 退场动画播完再移除（兜底 300ms 防 animationend 丢失挂死）
            let done = false
            const finish = () => { if (done) return; done = true; $.toasts = $.toasts.filter((t: ToastItem) => t.id !== id) }
            el.addEventListener('animationend', finish, { once: true })
            setTimeout(finish, 300)
            return
          }
        }
        $.toasts = $.toasts.filter((t: ToastItem) => t.id !== id)
      },
    }
    // 总是返回包装 div（非 null）——保证 _refNode 有值，scope render 能定位
    return () => h('div', { class: 'wf-toast-host' }, [
      h(Toast, {
        toasts: $.toasts,
        position: defaults.position,
        duration: defaults.duration,
        max: defaults.max,
        onRemove: (id: string) => hostApi?.remove(id),
      } as any),
    ])
  }

  const ensureHost = () => {
    if (hostApi || !ctxRef) return
    container = createClientBrowser().createElement('div') as HTMLDivElement | null
    if (!container) return
    createClientBrowser().bodyAppend(container)
    hostVnode = h(ToastHost, {})
    mountCommand(container, hostVnode, ctxRef)
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
