/**
 * weifuwu/client 应用 — createApp + ctx.ui.render
 *
 * createApp() → app.use(mw) → app.mount('#root', RootComponent)
 *
 * ctx.ui 在 mount 时注入：
 *   ctx.ui.render()    触发组件重渲染
 *   ctx.ui.$          组件级状态 Proxy（由 renderComponent 创建）
 *   ctx.ui.ready       首次执行标记（由渲染器管理）
 *
 * ctx.ui.$ 是组件级 Proxy（组件间隔离）：
 *   $.x = val              → 设置当前组件状态，自动触发渲染
 *   ctx.ui.dirty()         → 标记脏状态（仅深层突变时需要）
 */

import type { WfuiContext, AppMiddleware } from './types.ts'
import { render, patchValue } from './render.ts'
import type { VNode, Component } from './vnode.ts'

// 用于 RouteView 布局深度追踪
import { layoutDepth } from './router.ts'

// ── createApp ──────────────────────────────────────────

export function createApp() {
  const middlewares: AppMiddleware[] = []
  let ctx: WfuiContext = {} as WfuiContext
  let container: Element | null = null
  let rootComponent: Component | null = null
  let oldVNode: VNode | null = null
  let rendered = false

  const app = {
    get ctx() { return ctx },

    use(mw: AppMiddleware) {
      middlewares.push(mw)
      return app
    },

    async mount(rootSelector: string, RootComponent: Component) {
      rootComponent = RootComponent

      for (const mw of middlewares) {
        ctx = await mw(ctx)
      }

      const el = typeof rootSelector === 'string'
        ? document.querySelector(rootSelector)
        : rootSelector
      if (!el) throw new Error(`mount target not found: ${rootSelector}`)
      container = el as Element
      container.innerHTML = ''

      // 注入 ctx.ui
      // $ 是深度 Proxy：任何属性/数组/对象赋值自动 dirty
      let _dirty = false

      function scheduleRender() {
        if (_dirty) return
        _dirty = true
        queueMicrotask(() => {
          if (!_dirty) return
          _dirty = false
          ;(ctx as any).ui.render()
        })
      }

      ;(ctx as any).ui = {
        render: () => {
          if (!container || !rootComponent || !oldVNode) return
          _dirty = false
          // 重置 RouteView 布局深度
          layoutDepth.delete(ctx)
          const newVNode = wrapComponent(rootComponent, ctx)
          const oldNode = container.firstChild
          if (oldNode) {
            patchValue(container, oldNode, oldVNode, newVNode, ctx)
          }
          oldVNode = newVNode
        },
        /** 极少需要：仅当绕过 Proxy 直接操作底层对象时使用 */
        dirty: () => { scheduleRender() },
        /**
         * 组件级 $ — 在 renderComponent 中被覆盖为每个组件独立的 Proxy。
         * 这里保留占位，组件实际使用 ctx.ui.$ 时拿到的是 vnode._$ 上的 Proxy。
         */
        $: {} as Record<string, any>,
        ready: false,
      }

      // 首次渲染
      oldVNode = wrapComponent(RootComponent, ctx)
      const node = render(oldVNode, ctx)
      if (node instanceof Node) container.appendChild(node)
      // 重置 dirty 标志：mount 期间积累的微任务自动跳过
      _dirty = false
      rendered = true
    },

    destroy() {
      if (container) container.innerHTML = ''
      container = null
      ctx = {} as WfuiContext
    },
  }

  return app
}

function wrapComponent(Comp: Component, _ctx: WfuiContext): VNode {
  return { type: Comp, props: {}, key: undefined }
}
