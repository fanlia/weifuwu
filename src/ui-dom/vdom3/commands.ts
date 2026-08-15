/**
 * vdom3 commands — 命令式中间件（confirm/toast——vdom2 mountCommand 的 vdom3 等价）
 *
 * vdom2 的 confirm()/toast()（组件库）用 mountCommand 挂载——依赖 vdom2 引擎。
 * vdom3 适配：复用 Confirm/Toast 组件（vdom2 组件——hooks shim 可跑）——
 * createRoot 挂载到命令式容器——resolve 时 handle.unmount 清理。
 */

import type { VNode } from './types.ts'
import type { Component } from './types.ts'
import { h } from './jsx.ts'
import { createRoot } from './root.ts'
import { Confirm } from '../../components/Confirm/Confirm.ts'
import { Toast as ToastComp } from '../../components/Toast/Toast.ts'

// ── confirm ──────────────────────────────────────────────

/** 命令式确认（vdom3——createRoot 挂载 Confirm 组件——Modal portal 退场） */
export function v3Confirm(): any {
  return (ctx: any) => {
    ;(ctx as any).confirm = (message: string, options?: any) => createV3Confirm(message, options ?? {}, ctx)
    return ctx
  }
}

function createV3Confirm(message: string, options: any, ctx: any): Promise<boolean> {
  return new Promise((resolve) => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    let settled = false
    let open = true
    // 包装组件（open 状态驱动——Modal 退场状态机自播动画）
    const Host = async (_init: any, c: any) => {
      return async () => {
        return h('div', { class: 'wf-confirm-host' }, h(Confirm as unknown as Component, {
          open,
          title: options.title,
          onClose: () => { if (!settled) { settled = true; open = false; resolve(false); c.ui.render() } },
          onConfirm: () => { if (!settled) { settled = true; open = false; resolve(true); c.ui.render() } },
          message,
        }))
      }
    }
    const handle = createRoot(h(Host, {}), container, { ctx: { ...ctx } })
    // 退场后清理（animationend 或兜底）
    const cleanup = () => {
      handle.unmount()
      container.remove()
    }
    const el = document.querySelector('#__wf_portal .wf-modal')
    if (el && typeof el.addEventListener === 'function') {
      let done = false
      const once = () => { if (!done) { done = true; cleanup() } }
      el.addEventListener('animationend', once, { once: true })
      setTimeout(once, 600)
    } else {
      cleanup()
    }
  })
}

// ── toast ────────────────────────────────────────────────

/** 命令式轻提示（vdom3——createRoot 挂载 Toast 组件——自动消失） */
export function v3Toast(): any {
  return (ctx: any) => {
    ;(ctx as any).toast = (message: string, variant: 'success' | 'error' | 'warning' | 'info' = 'info') =>
      createV3Toast(message, variant)
    return ctx
  }
}

function createV3Toast(message: string, variant: string): void {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const Host = async (_init: any, _c: any) => async () =>
    h('div', { class: 'wf-toast-host' }, h(ToastComp as unknown as Component, { message, variant }))
  const handle = createRoot(h(Host, {}), container)
  // 自动消失（Toast 组件自身动画——兜底清理）
  setTimeout(() => {
    handle.unmount()
    container.remove()
  }, 3000)
}
