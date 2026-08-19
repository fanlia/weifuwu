/**
 * vdom — commands（命令式 API——toast/confirm/notification——P4 apps 迁移）
 *
 * 设计：vdom 无 createRoot（UIRouter 唯一入口——用户决策）——命令式
 * 浮层经 **vdom 引擎直接渲染**（renderToStream + CommandApplier 到 body
 * 容器——独立 mini-root——不依赖应用路由）——事件代理在 applier 内。
 *
 * 对应组件库：Toast/Confirm/Notification 组件（声明式）+ 本模块命令式
 * 入口（showcase 等应用用 ctx.toast/confirm/notification）。
 *
 * 使用：应用装配（main.tsx）注入 ctx——`ctx.toast('...')` 任意位置调用。
 */

import type { VNode, Component } from './core/vnode.ts'
import { renderToStream } from './core/build.ts'
import { CommandApplier } from './core/patch/index.ts'
import { createComponentRegistry } from './core/node/component.ts'
import type { UIContext } from './context/UIContext.ts'
import { h } from './core/vnode.ts'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

/** 命令式轻提示（vdom 引擎渲染——自动消失——独立容器） */
export function toast(message: string, type: ToastType = 'info', duration = 3000): void {
  const container = document.createElement('div')
  container.className = 'wf-toast-host'
  container.style.cssText = 'position:fixed;top:16px;right:16px;z-index:var(--wf-z-toast,9999)'
  document.body.appendChild(container)
  const registry = createComponentRegistry()
  const applier = new CommandApplier(container, document, registry)
  const ctx = { render: async () => {}, onUnmount: () => {}, data: { get: async () => undefined, set: () => {}, has: () => false } } as unknown as UIContext
  // 轻量 Host（不依赖 Toast 组件——其命令式面独立——样式类复用 wf-toast）
  const Host: Component = () => () =>
    h('div', { class: `wf-toast wf-toast--${type}` }, h('span', { class: 'wf-toast-msg' }, message))
  void renderToStream(h(Host, {}) as VNode, ctx, registry).pipeTo(new WritableStream({
    write(cmd) { applier.apply(cmd) },
  })).then(() => {
    setTimeout(() => {
      applier.dispose()
      container.remove()
    }, duration)
  })
}

/** 命令式注入（应用装配——ctx.toast） */
export function injectCommands<C extends Record<string, unknown>>(ctx: C): C & { toast: typeof toast } {
  return Object.assign(ctx, { toast })
}
