/**
 * weifuwu/client router — 路由中间件 + RouteView 组件
 *
 * ```tsx
 * import { createApp, router, RouteView } from 'weifuwu/client'
 *
 * const app = createApp()
 * app.use(router({
 *   routes: [
 *     { path: '/', component: HomePage },
 *     { path: '/chat/:id', component: ChatPage },
 *   ],
 * }))
 *
 * function AppShell(_, ctx) {
 *   return <div><Header /><RouteView /></div>
 * }
 * app.mount('#root', AppShell)
 * ```
 */

import type { WfuiContext, AppMiddleware, RouteDef } from './types.ts'
import type { Component } from './jsx-runtime.ts'
import { jsx, domMount, setCtx } from './jsx-runtime.ts'
import { effect } from './signal.ts'

export interface RouterOptions {
  /** 路由模式，默认 'hash' */
  mode?: 'hash' | 'history'
  /** 路由表 */
  routes: RouteDef[]
  /** 404 组件 */
  notFound?: Component
}

interface Matcher {
  re: RegExp
  keys: string[]
  route: RouteDef
}

/**
 * 路由中间件 — 注入 ctx.route.component + 改写 ctx.app.navigate
 */
export function router(opts: RouterOptions): AppMiddleware {
  const mode = opts.mode ?? 'hash'

  // 构建路由匹配器
  const matchers: Matcher[] = opts.routes.map(route => {
    const parts = route.path.split('/').filter(Boolean)
    const keys: string[] = []
    const reStr = '^/' + parts.map(p => {
      if (p.startsWith(':')) {
        keys.push(p.slice(1))
        return '([^/]+)'
      }
      return p
    }).join('/') + '$'
    return { re: new RegExp(reStr), keys, route }
  })

  function matchPath(path: string): { component: Component; params: Record<string, string>; title?: string; auth?: boolean } | null {
    for (const { re, keys, route } of matchers) {
      const m = path.match(re)
      if (m) {
        const params: Record<string, string> = {}
        keys.forEach((k, i) => { params[k] = decodeURIComponent(m[i + 1]) })
        return { component: route.component, params, title: route.title, auth: route.auth }
      }
    }
    return null
  }

  return (ctx: WfuiContext): WfuiContext => {
    function handleRoute() {
      const raw = mode === 'hash'
        ? window.location.hash.slice(1) || '/'
        : window.location.pathname + window.location.search

      const [path, qs] = raw.split('?')
      ctx.route.query = Object.fromEntries(new URLSearchParams(qs ?? ''))

      const matched = matchPath(path)

      if (matched) {
        ctx.route.path = path
        ctx.route.params = matched.params
        ctx.route.component = matched.component
        ctx.route.title = matched.title
        ctx.route.auth = matched.auth

        if (matched.title) document.title = matched.title

        // 鉴权守卫
        if (matched.auth && !ctx.user) {
          // 用 setTimeout 避免在路由处理中嵌套 navigate
          setTimeout(() => ctx.app.navigate('/login'), 0)
          return
        }
      } else {
        ctx.route.component = opts.notFound ?? null
      }

      // 触发 RouteView 重新渲染
      window.dispatchEvent(new CustomEvent('wefu:route', { detail: { path } }))
    }

    // 改写 navigate，支持 hash/history 模式
    const origNavigate = ctx.app.navigate
    ctx.app.navigate = (path: string) => {
      if (mode === 'hash') {
        window.location.hash = '#' + path
      } else {
        window.history.pushState({}, '', path)
        handleRoute()
      }
    }

    // 监听 URL 变化
    if (mode === 'hash') {
      window.addEventListener('hashchange', handleRoute)
    } else {
      window.addEventListener('popstate', handleRoute)
    }

    // 首次匹配
    handleRoute()

    return ctx
  }
}

/**
 * RouteView — 渲染当前路由匹配的组件
 *
 * 放在布局组件中，URL 变化时自动切换内容。
 *
 * ```tsx
 * function AppShell(_, ctx) {
 *   return (
 *     <div class="app">
 *       <Header user={ctx.user} />
 *       <main><RouteView /></main>
 *     </div>
 *   )
 * }
 * ```
 */
export function RouteView(_props: {}, ctx: WfuiContext): Node {
  const el = document.createElement('div')

  function render() {
    const Component = ctx.route.component
    if (!Component) {
      el.textContent = ''
      return
    }
    el.textContent = ''
    // 渲染匹配的页面组件（带 ctx）
    setCtx(ctx)
    const page = jsx(Component, {})
    el.appendChild(page)
    setCtx(null)
  }

  render()

  // URL 变化时重新渲染
  window.addEventListener('wefu:route', render)

  return el
}
