/**
 * weifuwu/client router — 路由中间件 + RouteView 组件
 *
 * RouteView 是所有层级的统一出口：
 * - 顶层（AppShell 中）→ 渲染 layout 或组件
 * - 嵌套层（layout 中）→ 渲染子路由组件
 * - 每个 RouteView 独立监听路由变化，只在其层级的组件变化时才重渲染
 *
 * ```tsx
 * const routes = [
 *   {
 *     path: '/dashboard',
 *     layout: DashboardLayout,   // 持久化布局
 *     children: [
 *       { path: '/overview', component: OverviewPage },
 *       { path: '/reports', component: ReportsPage },
 *     ],
 *   },
 *   { path: '/', component: HomePage },
 * ]
 *
 * function DashboardLayout(_props: {}, ctx: WfuiContext) {
 *   return (
 *     <div class="dashboard">
 *       <Sidebar />
 *       <main><RouteView /></main>   (嵌套出口，和根层级用同一组件)
 *     </div>
 *   )
 * }
 * ```
 */

import type { WfuiContext, AppMiddleware, RouteDef } from './types.ts'
import type { Component } from './jsx-runtime.ts'
import { jsx, setCtx, onCleanup } from './jsx-runtime.ts'

export interface RouterOptions {
  mode?: 'hash' | 'history'
  routes: RouteDef[]
  notFound?: Component
  /** 页面切换过渡动画名（可选），对应 CSS class 前缀 */
  transition?: string
  /** 是否启用滚动位置恢复（history 模式，默认 true） */
  scrollRestoration?: boolean
}

// ── 内部类型 ──────────────────────────────────────────────

interface FlatRoute {
  re: RegExp
  keys: string[]
  chain: ChainItem[]
  leafRoute: RouteDef
}

interface ChainItem {
  component?: Component
  layout?: Component
  params: Record<string, string>
  routeDef: RouteDef
  depth: number
}

const CHAIN_KEY = Symbol('routeChain')
const DEPTH_KEY = Symbol('routeDepth')

/**
 * 路由中间件 — 注入 ctx.route + 改写 ctx.app.navigate
 */
export function router(opts: RouterOptions): AppMiddleware {
  const mode = opts.mode ?? 'hash'

  const flatRoutes = flattenRoutes(opts.routes)

  function matchRoute(path: string): { chain: ChainItem[]; leafRoute: RouteDef } | null {
    for (const fr of flatRoutes) {
      const result = path.match(fr.re)
      if (!result) continue

      const isLeaf = (idx: number) => idx === fr.chain.length - 1
      const matchedChain: ChainItem[] = fr.chain.map((item, idx) => {
        const params: Record<string, string> = {}
        if (isLeaf(idx)) {
          fr.keys.forEach((k, i) => { params[k] = decodeURIComponent(result[i + 1]) })
        }
        return { ...item, params }
      })
      return { chain: matchedChain, leafRoute: fr.leafRoute }
    }
    return null
  }

  function resolve(ctx2: WfuiContext, path: string) {
    const raw = mode === 'hash' ? path || '/' : path
    const [cleanPath, qs] = raw.split('?')
    ctx2.route.query = Object.fromEntries(new URLSearchParams(qs ?? ''))
    ctx2.route.path = cleanPath

    const matched = matchRoute(cleanPath)
    if (!matched) {
      ctx2.route.component = opts.notFound ?? null
      ctx2.route.data = {}
      ctx2.route.transition = opts.transition
      ;(ctx2.route as any)[CHAIN_KEY] = []
      return
    }

    const leaf = matched.chain[matched.chain.length - 1]
    ctx2.route.params = { ...leaf.params }
    ctx2.route.component = leaf.component ?? leaf.routeDef.component ?? null
    ctx2.route.title = matched.leafRoute.title
    ctx2.route.auth = matched.leafRoute.auth
    ctx2.route.transition = matched.leafRoute.transition ?? opts.transition
    if (matched.leafRoute.title) document.title = matched.leafRoute.title

    ;(ctx2.route as any)[CHAIN_KEY] = matched.chain
    ;(ctx2.route as any)[DEPTH_KEY] = 0
  }

  return (ctx: WfuiContext): WfuiContext => {
    function emit(path: string) {
      const Ctor = (window as any).CustomEvent || CustomEvent
      window.dispatchEvent(new Ctor('wefu:route', { detail: { path } }))
    }

    function navigateAndLoad(path: string) {
      resolve(ctx, path)
      const leafChain = (ctx.route as any)[CHAIN_KEY] as ChainItem[] | undefined
      const leafLoader = leafChain?.[leafChain.length - 1]?.routeDef?.loader

      if (leafLoader) {
        ctx.route.loading = true
        emit(ctx.route.path)

        leafLoader(ctx).then((data: Record<string, unknown>) => {
          ctx.route.data = data
          ctx.route.loading = false
          emit(ctx.route.path)
        }).catch(() => {
          ctx.route.data = {}
          ctx.route.loading = false
          emit(ctx.route.path)
        })
      } else {
        ctx.route.loading = false
        emit(ctx.route.path)
      }
    }

    if (mode === 'hash') {
      ctx.app.navigate = (path: string) => {
        window.location.hash = '#' + path
      }

      window.addEventListener('hashchange', () => {
        navigateAndLoad(window.location.hash.slice(1) || '/')
      })
    } else {
      const scrollPositions = new Map<string, number>()

      ctx.app.navigate = (path: string) => {
        if (opts.scrollRestoration !== false) {
          scrollPositions.set(window.location.pathname, window.scrollY)
        }
        window.history.pushState({}, '', path)
        navigateAndLoad(path)
      }

      window.addEventListener('popstate', () => {
        if (opts.scrollRestoration !== false) {
          const savedY = scrollPositions.get(window.location.pathname)
          if (savedY !== undefined) {
            requestAnimationFrame(() => window.scrollTo(0, savedY))
          }
        }
        navigateAndLoad(window.location.pathname + window.location.search)
      })
    }

    const initialPath = mode === 'hash'
      ? window.location.hash.slice(1) || '/'
      : window.location.pathname + window.location.search
    navigateAndLoad(initialPath)

    return ctx
  }
}

/**
 * 扁平化路由树为一维匹配数组
 */
function flattenRoutes(routes: RouteDef[], parentPath = ''): FlatRoute[] {
  const result: FlatRoute[] = []

  for (const route of routes) {
    const fullPath = parentPath + route.path
    const parts = fullPath.split('/').filter(Boolean)
    const keys: string[] = []
    const reStr = '^/' + parts.map(p => {
      if (p.startsWith(':')) { keys.push(p.slice(1)); return '([^/]+)' }
      return p
    }).join('/') + '$'

    if (route.children && route.children.length > 0) {
      for (const child of route.children) {
        const childPath = fullPath + child.path
        const childParts = childPath.split('/').filter(Boolean)
        const childKeys: string[] = []
        const childReStr = '^/' + childParts.map(p => {
          if (p.startsWith(':')) { childKeys.push(p.slice(1)); return '([^/]+)' }
          return p
        }).join('/') + '$'

        const chain: ChainItem[] = [
          { layout: route.layout, params: {}, routeDef: route, depth: 0 },
          { component: child.component, params: {}, routeDef: child, depth: 1 },
        ]

        result.push({
          re: new RegExp(childReStr),
          keys: childKeys,
          chain,
          leafRoute: child,
        })
      }
    } else {
      const chain: ChainItem[] = [
        { component: route.component, params: {}, routeDef: route, depth: 0 },
      ]

      result.push({
        re: new RegExp(reStr),
        keys,
        chain,
        leafRoute: route,
      })
    }
  }

  return result
}

/**
 * RouteView — 统一路由出口
 *
 * 同时支持根层级和嵌套层级。每个 RouteView 独立监听路由变化：
 * - 若其层级的组件/layout 未变化 → 跳过重渲染（保持状态）
 * - 若其层级的组件/layout 变化 → 替换 DOM
 *
 * ```tsx
 * // 根层级（AppShell）
 * <main><RouteView /></main>
 *
 * // 嵌套层级（DashboardLayout）
 * <main><RouteView /></main>     // 同一组件，无需 Outlet
 * ```
 */
export function RouteView(_props: {}, ctx: WfuiContext): Node {
  const el = document.createElement('div')
  let currentItem: ChainItem | null = null

  function getCurrentDepth(): number {
    return (ctx.route as any)[DEPTH_KEY] ?? 0
  }

  function render() {
    const chain = (ctx.route as any)[CHAIN_KEY] as ChainItem[] | undefined
    let depth = getCurrentDepth()

    // 没有更多层级 → 清空
    if (!chain || depth >= chain.length) {
      if (el.children.length > 0) el.textContent = ''
      currentItem = null
      return
    }

    const item = chain[depth]

    // 同一层级同一组件 → 跳过（持久化 layout/组件状态）
    if (currentItem && currentItem.depth === item.depth) {
      const sameComp = (a?: Component, b?: Component) => a === b
      if (sameComp(currentItem.layout, item.layout) && sameComp(currentItem.component, item.component)) {
        return
      }
    }

    currentItem = item

    // 递增 depth 供下游 RouteView 使用
    ;(ctx.route as any)[DEPTH_KEY] = depth + 1

    // 渲染当前层级的组件
    const Comp = item.layout ?? item.component
    if (!Comp) return

    el.textContent = ''
    setCtx(ctx)
    const page = jsx(Comp, {})
    el.appendChild(page)
    setCtx(null)
  }

  render()
  window.addEventListener('wefu:route', render)
  onCleanup(() => window.removeEventListener('wefu:route', render))
  return el
}

/**
 * Outlet — RouteView 的别名
 *
 * 为了减少学习成本，推荐统一使用 RouteView。
 * Outlet 保留作为别名，向后兼容。
 */
export const Outlet = RouteView
