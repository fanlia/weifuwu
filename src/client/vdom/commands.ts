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
import { renderToStreamV2 } from './core/v2/integrate.ts' // v1 退役——v2 引擎（兼容桥形态）
import { CommandApplier } from './core/patch/index.ts'
import { createComponentRegistry } from './core/node/component.ts'
import type { UIContext } from './context/UIContext.ts'
import { h } from './core/vnode.ts'
import { create, delay, tap } from './observable/index.ts'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

/** 命令式轻提示（vdom 引擎渲染——自动消失——独立容器）
 *  **自动消失定时器上流（波次 6——隐式时序歼灭）**：setTimeout 裸调用 →
 *  create<number>((obs) => { obs.next(1); obs.complete(); return () => {} }).pipe(delay(duration))——生命周期在流上——不可达的裸
 *  timer 消除（未来 close 面可直接 takeUntil——取消语义就位） */
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
  void renderToStreamV2(h(Host, {}) as VNode, ctx, registry).pipeTo(new WritableStream({
    write(cmd) { applier.apply(cmd) },
  })).then(() => {
    // **自动消失（流上——delay 算子——订阅取消 = timer 取消——零泄漏）**
    create<number>((obs) => { obs.next(1); obs.complete(); return () => {} }).pipe(delay(duration),
      tap(() => {
        applier.dispose()
        container.remove()
      }),
    ).subscribe({ next: () => {} })
  })
}

/** 命令式注入（应用装配——ctx.toast） */
export function injectCommands<C extends Record<string, unknown>>(ctx: C): C & { toast: typeof toast } {
  return Object.assign(ctx, { toast })
}
