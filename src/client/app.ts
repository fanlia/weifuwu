/**
 * weifuwu/client 应用 — createApp + ctx.ui.render
 *
 * createApp() → app.use(mw) → app.mount('#root', RootComponent)
 *
 * ctx.ui 在 mount 时注入：
 *   ctx.ui.render()    触发组件重渲染
 *   ctx.ui.dirty()     标记脏状态，下个微任务批量渲染
 *   ctx.ui.$()         创建响应式状态容器（$.x = val 自动 dirty）
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
      let _dirty = false
      let _rendering = false

      const doRender = () => {
        if (_rendering || !container || !rootComponent || !oldVNode) return
        _rendering = true
        layoutDepth.delete(ctx)
        const newVNode = wrapComponent(rootComponent, ctx)
        const oldNode = container.firstChild
        if (oldNode) {
          patchValue(container, oldNode, oldVNode, newVNode, ctx)
        }
        oldVNode = newVNode
        _rendering = false
      }
      const scheduleRender = () => {
        if (_dirty || _rendering) return
        _dirty = true
        queueMicrotask(() => {
          if (!_dirty) return
          _dirty = false
          doRender()
        })
      }
      ;(ctx as any).ui = {
        /** 立即同步渲染 */
        render: doRender,
        /** 标记脏状态，下个微任务批量渲染 */
        dirty: scheduleRender,
        /** 创建响应式状态容器：$.x = val 自动触发 dirty()（仅事件/timer 中生效） */
        $: () => createReactiveState(scheduleRender),
      }

      // 首次渲染（mount/render/update 中的 $.x = val 不触发新渲染）
      _rendering = true
      oldVNode = wrapComponent(RootComponent, ctx)
      const node = render(oldVNode, ctx)
      if (node instanceof Node) container.appendChild(node)
      _rendering = false
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

/** 创建响应式状态容器：深度 Proxy，任意层级属性赋值自动触发 render */
function createReactiveState(dirty: () => void): Record<string, any> {
  const proxyCache = new WeakMap()

  const reactive = (target: any): any => {
    if (target === null || typeof target !== 'object') return target

    // 相同底层对象返回同一 Proxy 实例，保证引用稳定、减少 GC
    if (proxyCache.has(target)) return proxyCache.get(target)

    const proxy = new Proxy(target, {
      set(target, key, value) {
        const old = Reflect.get(target, key)
        if (old === value) return true
        Reflect.set(target, key, value)
        dirty()
        return true
      },
      get(target, key) {
        const value = Reflect.get(target, key)
        // 返回深度包装的 Proxy，确保深层赋值也能触发 dirty
        if (typeof value === 'object' && value !== null) return reactive(value)
        return value
      },
      deleteProperty(target, key) {
        if (Reflect.has(target, key)) {
          Reflect.deleteProperty(target, key)
          dirty()
        }
        return true
      },
    })

    proxyCache.set(target, proxy)
    return proxy
  }

  return reactive({})
}
