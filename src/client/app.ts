/**
 * weifuwu/client 应用 — createApp + ctx.ui.render
 *
 * createApp() → app.use(mw) → app.mount('#root', RootComponent)
 *
 * ctx.ui 在 mount 时注入：
 *   ctx.ui.render()    触发组件重渲染
 *   ctx.ui.$          持久化组件状态（由渲染器管理）
 *   ctx.ui.ready       首次执行标记（由渲染器管理）
 *
 * ctx.ui.$ 是深度 Proxy：
 *   $.x = val              → 自动渲染（顶层属性赋值）
 *   $.items.push(val)      → 自动渲染（数组突变方法）
 *   $.items[0].x = val     → 自动渲染（对象属性突变）
 *   $.items.push({x: 1})   → 新对象自动深度包装
 *   ctx.ui.dirty()         → 极少需要（仅当绕过 Proxy 直接操作底层对象）
 */

import type { WfuiContext, AppMiddleware } from './types.ts'
import { render, patchValue } from './render.ts'
import type { VNode, Component } from './vnode.ts'

// 用于 RouteView 布局深度追踪
import { layoutDepth } from './router.ts'

// ── 深层 Proxy 包装 ───────────────────────────────────

const mutationMethods = ['push', 'pop', 'splice', 'shift', 'unshift', 'sort', 'reverse']
const wrappedCache = new WeakMap<object, object>()

function wrapDeep(val: any, dirty: () => void): any {
  if (val === null || typeof val !== 'object') return val
  if (val instanceof Node) return val
  if (wrappedCache.has(val)) return wrappedCache.get(val)

  let proxy: object
  if (Array.isArray(val)) {
    proxy = new Proxy(val, {
      get(target, key, receiver) {
        const v = Reflect.get(target, key, receiver)
        if (typeof key === 'string' && mutationMethods.includes(key) && typeof v === 'function') {
          return function (this: any, ...args: any[]) {
            const r = v.apply(target, args)
            dirty()
            return r
          }
        }
        return wrapDeep(v, dirty)
      },
      set(target, key, val) {
        target[key as string] = wrapDeep(val, dirty)
        dirty()
        return true
      },
    })
  } else {
    proxy = new Proxy(val, {
      get(_target, key, receiver) {
        const v = Reflect.get(_target, key, receiver)
        return wrapDeep(v, dirty)
      },
      set(target, key, val) {
        target[key as string] = wrapDeep(val, dirty)
        dirty()
        return true
      },
    })
  }

  wrappedCache.set(val, proxy)
  return proxy
}

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

      const $target: Record<string, any> = {}
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
        $: new Proxy($target, {
          set(_target, key, val) {
            _target[key as string] = wrapDeep(val, scheduleRender)
            scheduleRender()
            return true
          },
        }),
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
