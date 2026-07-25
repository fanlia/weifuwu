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
      // $ 是 Proxy：任何属性赋值自动 dirty，无需手动调 render/dirty
      // 嵌套对象/数组的突变（push、content+=）需显式调 dirty()
      let _dirty = false
      const $target: Record<string, any> = {}
      ;(ctx as any).ui = {
        render: () => {
          if (!container || !rootComponent || !oldVNode) return
          _dirty = false
          ;(ctx as any)._rvDepth = 0
          const newVNode = wrapComponent(rootComponent, ctx)
          const oldNode = container.firstChild
          if (oldNode) {
            patchValue(container, oldNode, oldVNode, newVNode, ctx)
          }
          oldVNode = newVNode
        },
        /** 显式标记脏（用于嵌套突变如 push、arr[i].x +=） */
        dirty: () => {
          if (_dirty) return
          _dirty = true
          queueMicrotask(() => {
            if (!_dirty) return
            _dirty = false
            ;(ctx as any).ui.render()
          })
        },
        $: new Proxy($target, {
          set(_target, key, val) {
            _target[key as string] = val
            if (!_dirty) {
              _dirty = true
              queueMicrotask(() => {
                if (!_dirty) return
                _dirty = false
                ;(ctx as any).ui.render()
              })
            }
            return true
          },
        }),
        ready: false,
      }

      // 首次渲染
      oldVNode = wrapComponent(RootComponent, ctx)
      const node = render(oldVNode, ctx)
      if (node instanceof Node) container.appendChild(node)
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
