/**
 * vdom3 commands — 命令式中间件（confirm/toast——vdom2 mountCommand 的 vdom3 等价）
 *
 * vdom2 的 confirm()/toast()（组件库）用 mountCommand 挂载——依赖 vdom2 引擎。
 * vdom3 适配：复用 Confirm/Toast 组件（vdom2 组件——hooks shim 可跑）——
 * createRoot 挂载到命令式容器——resolve 时 handle.unmount 清理。
 */

import type { VNode, Component, V3Ctx } from './types.ts'
import { h } from './jsx.ts'
import { createRoot } from './root.ts'
import { Confirm } from '../../components/Confirm/Confirm.ts'

// ── confirm ──────────────────────────────────────────────

/** 命令式中间件注入类型（confirm/toast 挂到 ctx——中间件面） */
export interface V3CommandInjected {
  confirm(message: string, options?: Record<string, unknown>): Promise<boolean>
  toast(message: string, variant?: 'success' | 'error' | 'warning' | 'info'): void
}

/** 命令式确认（vdom3——createRoot 挂载 Confirm 组件——Modal portal 退场）
 *  泛型 ctx（兼容 UIRouter（WfuiContext）与 vdom3（V3Ctx）双入口） */
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
    const handle = createRoot(h(Host, {}), container, { ctx: { ..._ctx } })
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
  const handle = createRoot(h(Host, {}), container)
  // 自动消失（兜底清理）
  setTimeout(() => {
    handle.unmount()
    container.remove()
  }, 3000)
}
