/**
 * weifuwu/client router — 路由中间件 + RouteView
 *
 * 路由变化时调用 ctx.ui.render() 触发重渲染。
 */

import type { WfuiContext, AppMiddleware, RouteDef } from './types.ts'
import type { VNode } from './vnode.ts'
import { clearAsyncComponentCache } from './render.ts'

export interface RouterOptions {
  mode?: 'hash' | 'history'
  routes: RouteDef[]
  notFound?: (props: any, ctx: WfuiContext) => any
}

function flattenRoutes(routes: RouteDef[], basePath = '', chain: RouteDef[] = []): FlattenedRoute[] {
  const result: FlattenedRoute[] = []
  for (const route of routes) {
    const fullPath = joinPaths(basePath, route.path)
    const { re, keys } = compilePath(fullPath)
    const fullChain = [...chain, route]
    result.push({ re, keys, def: route, chain: fullChain })
    if (route.children) {
      result.push(...flattenRoutes(route.children, fullPath, fullChain))
    }
  }
  return result
}

interface FlattenedRoute {
  re: RegExp
  keys: string[]
  def: RouteDef
  chain: RouteDef[]
}

function joinPaths(a: string, b: string): string {
  if (!b || b === '/') return a || '/'
  const left = a.endsWith('/') ? a.slice(0, -1) : a
  const right = b.startsWith('/') ? b : '/' + b
  return left + right
}

function compilePath(path: string): { re: RegExp; keys: string[] } {
  const keys: string[] = []
  const reStr = path.replace(/:(\w+)/g, (_, key) => { keys.push(key); return '([^/]+)' }).replace(/\*/g, '.*')
  return { re: new RegExp(`^${reStr}$`), keys }
}

function matchRoute(path: string, routes: FlattenedRoute[]): FlattenedRoute | null {
  let best: FlattenedRoute | null = null
  for (const fr of routes) {
    if (path.match(fr.re)) {
      if (!best || fr.chain.length > best.chain.length) best = fr
    }
  }
  return best
}

/** router 中间件注入到 ctx 的字段 */
export interface RouteInjected {
  route: {
    path: string
    params: Record<string, string>
    query: Record<string, string>
    title?: string
  }
  /** 编程式导航 */
  app: {
    navigate: (path: string) => void
  }
}

export function router(opts: RouterOptions): AppMiddleware<{}, RouteInjected> {
  const flatRoutes = flattenRoutes(opts.routes)
  const mode = opts.mode || 'history'

  function getPath(): string {
    if (mode === 'hash') {
      const hash = window.location.hash.replace(/^#/, '') || '/'
      return hash
    }
    return window.location.pathname
  }

  function resolve(path: string) {
    const match = matchRoute(path, flatRoutes)
    if (match) {
      const params: Record<string, string> = {}
      const m = path.match(match.re)
      if (m) {
        for (let i = 0; i < match.keys.length; i++) {
          params[match.keys[i]] = decodeURIComponent(m[i + 1])
        }
      }
      const last = match.chain[match.chain.length - 1]
      return {
        path: match.def.path,
        params,
        query: Object.fromEntries(new URLSearchParams(window.location.search)),
        chain: match.chain,
        title: last?.title ?? '',
      }
    }
    // 未匹配：链上挂 notFound 组件（RouteView 渲染），无 notFound 则空白
    return {
      path,
      params: {},
      query: Object.fromEntries(new URLSearchParams(window.location.search)),
      chain: opts.notFound ? [{ component: opts.notFound, title: 'Not Found' }] : [],
      title: '',
    }
  }

  return (ctx: WfuiContext) => {
    const resolved = resolve(getPath())
    ;(ctx as any).route = resolved
    if (resolved.title) document.title = resolved.title

    if (!ctx.app) ctx.app = {} as any
    ctx.app!.navigate = (path: string) => {
      // 页面上下文切换：async 工厂缓存失效（工厂内 ctx.data 的 key 依赖旧 ctx）
      clearAsyncComponentCache()
      if (mode === 'hash') {
        window.location.hash = '#' + path
        const resolved = resolve(path)
        ;(ctx as any).route = resolved
      } else {
        window.history.pushState({}, '', path)
        const resolved = resolve(path)
        ;(ctx as any).route = resolved
      }
      if (ctx.route?.title) document.title = ctx.route.title
      // 路由变化是 ctx 变化：bump 版本使 RouteView 等 ctx 消费者跳过 skip
      ;(ctx as any).ui?.bumpCtxVersion?.()
      ctx.ui?.render()
    }

    const onPop = () => {
      clearAsyncComponentCache()
      const resolved = resolve(getPath())
      ;(ctx as any).route = resolved
      if (ctx.route?.title) document.title = ctx.route.title
      ;(ctx as any).ui?.bumpCtxVersion?.()
      ctx.ui?.render()
    }
    window.addEventListener('popstate', onPop)
    if (mode === 'hash') {
      window.addEventListener('hashchange', onPop)
    }

    return ctx as WfuiContext & RouteInjected
  }
}

export function RouteView(_props: {}, ctx: WfuiContext) {
  // mount 时从 route._rvDepth 读取深度（由父 RouteView 的 render 设置）
  // route 对象是所有 RouteView 共享的（通过 ctx 原型链访问），
  // 且 mount 在 render 的同一次同步执行流中发生，值一定正确
  const _depth = ((ctx as any).route?._rvDepth as number) ?? 0

  return (): any => {
    const route = (ctx as any).route
    if (!route?.chain?.length || _depth >= route.chain.length) return null

    const def = route.chain[_depth]
    const Comp = def.layout ?? def.component
    if (!Comp) return null

    if (def.layout) {
      route._rvDepth = _depth + 1
    }

    return { type: Comp, props: {}, key: undefined }
  }
}
