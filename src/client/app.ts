/**
 * weifuwu/client 应用 — createApp + ctx.ui.render
 *
 * createApp() → app.use(mw) → app.mount('#root', RootComponent)
 *
 * ctx.ui 在 mount 时注入：
 *   ctx.ui.render()    触发组件重渲染
 *   ctx.ui.$          持久化组件状态（由渲染器管理）
 *   ctx.ui.ready       首次执行标记（由渲染器管理）
 */

import type { WfuiContext, AppMiddleware } from './types.ts'
import { render, patchValue } from './render.ts'
import type { VNode, Component } from './vnode.ts'

// 用于 RouteView 布局深度追踪
import { layoutDepth } from './router.ts'

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
      // $ 是 Proxy：任何属性赋值自动 dirty
      // 数组自动包装为 Proxy：push/pop/splice 等自动 dirty
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

      /** 包装数组：突变方法自动 dirty */
      function wrapArray<T>(arr: T[]): T[] {
        return new Proxy(arr, {
          get(target, key, receiver) {
            const val = Reflect.get(target, key, receiver)
            if (typeof val === 'function' && typeof key === 'string' && ['push', 'pop', 'splice', 'shift', 'unshift', 'sort', 'reverse'].includes(key as string)) {
              return function (...args: any[]) {
                const result = val.apply(target, args)
                scheduleRender()
                return result
              }
            }
            return val
          },
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
        /** 显式标记脏（用于对象属性突变如 arr[i].x = y） */
        dirty: () => { scheduleRender() },
        $: new Proxy($target, {
          set(_target, key, val) {
            _target[key as string] = Array.isArray(val) ? wrapArray(val) : val
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
