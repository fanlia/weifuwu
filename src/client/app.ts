/**
 * weifuwu/client 应用 — 创建 ctx + 中间件链 + 挂载组件
 *
 * ```tsx
 * import { createApp, api, auth, ws, router } from 'weifuwu/client'
 *
 * const app = createApp()
 * app.use(api())
 * app.use(auth())
 * app.use(ws())
 * app.use(router({ routes }))
 * app.mount('#root', AppShell)
 * ```
 */

import type { WfuiContext, AppMiddleware } from './types.ts'
import type { Component } from './jsx-runtime.ts'
import { setCtx, jsx, domMount } from './jsx-runtime.ts'

/**
 * 创建 weifuwu/client 应用
 */
export function createApp(): {
  ctx: WfuiContext
  use: (mw: AppMiddleware) => any
  mount: (rootSelector: string, RootComponent: Component) => Promise<void>
  /**
   * Hydrate 一个已由 SSR 渲染的区域。
   * 不清除目标容器内的内容，只附加组件输出。
   *
   * ```ts
   * const app = createApp()
   * app.use(api())
   * app.use(auth())
   * app.hydrate('#comments', CommentSection, { postId: '123' })
   * ```
   */
  hydrate: (
    selector: string,
    Component: Component,
    props?: Record<string, unknown>,
  ) => void
} {
  const middlewares: AppMiddleware[] = []
  const provides = new Map<string, unknown>()

  let ctx: WfuiContext = {
    route: {
      path: window.location.pathname,
      params: {},
      query: Object.fromEntries(new URLSearchParams(window.location.search)),
      hash: window.location.hash,
      component: null,
      data: {},
    },
    app: {
      navigate(path: string) {
        window.history.pushState({}, '', path)
        ctx.route.path = path
        ctx.route.query = Object.fromEntries(new URLSearchParams(window.location.search))
        ctx.route.hash = window.location.hash
        window.dispatchEvent(new CustomEvent('wefu:navigate', { detail: { path } }))
      },
    },
    user: null,
    token: null,
    isAuthenticated: false,
    login: async () => {},
    logout: () => {},
    register: async () => {},
    api: null as any,
    ws: null as any,
    provide<T>(key: string, value: T) {
      provides.set(key, value)
    },
    inject<T>(key: string): T | null {
      return (provides.get(key) as T) ?? null
    },
  }

  return {
    get ctx() { return ctx },

    use(mw: AppMiddleware) {
      middlewares.push(mw)
      return this
    },

    async mount(rootSelector: string, RootComponent: Component) {
      // 运行中间件链（支持异步）
      for (const mw of middlewares) {
        ctx = await mw(ctx)
      }

      // 渲染组件树
      setCtx(ctx)
      const app = jsx(RootComponent, {})
      domMount(rootSelector, app)
      setCtx(null)
    },

    hydrate(selector: string, Component: Component, props?: Record<string, unknown>) {
      const root = document.querySelector(selector)
      if (!root) {
        console.warn(`hydrate target not found: ${selector}`)
        return
      }

      const mergedProps = props ?? (window as any).__WFUI_PROPS__ ?? {}
      setCtx(ctx)
      const vnode = jsx(Component, mergedProps)
      root.appendChild(vnode)
      setCtx(null)
    },
  }
}
