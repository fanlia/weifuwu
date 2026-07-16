/**
 * weifuwu/client router — 路由中间件 + RouteView 组件
 */

import type { WfuiContext, AppMiddleware, RouteDef } from './types.ts'
import type { Component } from './jsx-runtime.ts'
import { jsx, setCtx } from './jsx-runtime.ts'

export interface RouterOptions {
  mode?: 'hash' | 'history'
  routes: RouteDef[]
  notFound?: Component
}

/**
 * 路由中间件 — 注入 ctx.route + 改写 ctx.app.navigate
 */
export function router(opts: RouterOptions): AppMiddleware {
  const mode = opts.mode ?? 'hash'

  const matchers: { re: RegExp; keys: string[]; route: RouteDef }[] = opts.routes.map(route => {
    const parts = route.path.split('/').filter(Boolean)
    const keys: string[] = []
    const reStr = '^/' + parts.map(p => {
      if (p.startsWith(':')) { keys.push(p.slice(1)); return '([^/]+)' }
      return p
    }).join('/') + '$'
    return { re: new RegExp(reStr), keys, route }
  })

  function matchRoute(path: string): { matched: { component: Component; params: Record<string, string>; title?: string; auth?: boolean }; routeDef?: RouteDef } | null {
    for (const m of matchers) {
      const result = path.match(m.re)
      if (!result) continue
      const params: Record<string, string> = {}
      m.keys.forEach((k, i) => { params[k] = decodeURIComponent(result[i + 1]) })
      return {
        matched: { component: m.route.component, params, title: m.route.title, auth: m.route.auth },
        routeDef: m.route,
      }
    }
    return null
  }

  return (ctx: WfuiContext): WfuiContext => {
    function emit(path: string) {
      window.dispatchEvent(new CustomEvent('wefu:route', { detail: { path } }))
    }

    function resolve(path: string): { component: Component | null; routeDef?: RouteDef } {
      const raw = mode === 'hash' ? path || '/' : path
      const [cleanPath, qs] = raw.split('?')
      ctx.route.query = Object.fromEntries(new URLSearchParams(qs ?? ''))
      ctx.route.path = cleanPath

      const r = matchRoute(cleanPath)
      if (!r) {
        ctx.route.component = opts.notFound ?? null
        ctx.route.data = {}
        return { component: null }
      }

      ctx.route.params = r.matched.params
      ctx.route.component = r.matched.component
      ctx.route.title = r.matched.title
      ctx.route.auth = r.matched.auth
      if (r.matched.title) document.title = r.matched.title

      return { component: r.matched.component, routeDef: r.routeDef }
    }

    // 路由切换核心逻辑
    function navigateAndLoad(path: string) {
      const { routeDef } = resolve(path)

      // 鉴权守卫
      if (ctx.route.auth && !ctx.user) {
        setTimeout(() => ctx.app.navigate('/login'), 0)
        return
      }

      // 先触发渲染（组件内部显示 loading）
      emit(ctx.route.path)

      // 异步加载数据
      if (routeDef?.loader) {
        routeDef.loader(ctx).then(data => {
          ctx.route.data = data
          emit(ctx.route.path)
        }).catch(() => {
          ctx.route.data = {}
          emit(ctx.route.path)
        })
      }
    }

    // 改写 navigate
    ctx.app.navigate = (path: string) => {
      if (mode === 'hash') {
        window.location.hash = '#' + path
      } else {
        window.history.pushState({}, '', path)
        navigateAndLoad(path)
      }
    }

    if (mode === 'hash') {
      window.addEventListener('hashchange', () => {
        navigateAndLoad(window.location.hash.slice(1) || '/')
      })
    } else {
      window.addEventListener('popstate', () => {
        navigateAndLoad(window.location.pathname + window.location.search)
      })
    }

    // 初始渲染
    const initialPath = mode === 'hash'
      ? window.location.hash.slice(1) || '/'
      : window.location.pathname + window.location.search
    navigateAndLoad(initialPath)

    return ctx
  }
}

/**
 * RouteView — 渲染当前路由匹配的组件
 */
export function RouteView(_props: {}, ctx: WfuiContext): Node {
  const el = document.createElement('div')

  function render() {
    const Component = ctx.route.component
    if (!Component) { el.textContent = ''; return }
    el.textContent = ''
    setCtx(ctx)
    const page = jsx(Component, {})
    el.appendChild(page)
    setCtx(null)
  }

  render()
  window.addEventListener('wefu:route', render)
  return el
}
