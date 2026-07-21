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
/** RouteView 渲染栈 — 渲染子树时压入自身深度，嵌套 RouteView 从栈顶推导自身深度 */
const RV_STACK_KEY = Symbol('routeRvStack')

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
  // 当前 RouteView 在 chain 中的层级索引
  // 0 = 根层级，1 = 第一层嵌套，以此类推
  // 首次渲染时从父 RouteView 的渲染栈推导（与导航重置无关，天然正确）
  let myDepth: number | null = null
  let cachedComp: Component | null = null

  function render() {
    const chain = (ctx.route as any)[CHAIN_KEY] as ChainItem[] | undefined

    // 首次渲染时确定自己的层级：父 RouteView 渲染子树时会把自身深度压栈，
    // 因此栈顶 + 1 即当前 RouteView 的深度；栈为空则为根层级 0。
    if (myDepth === null) {
      const stack = (ctx.route as any)[RV_STACK_KEY] as number[] | undefined
      myDepth = stack && stack.length > 0 ? stack[stack.length - 1] + 1 : 0
    }

    const depth = myDepth as number

    if (!chain || depth >= chain.length) {
      if (el.children.length > 0) el.textContent = ''
      cachedComp = null
      return
    }

    const item = chain[depth]
    const Comp = item.layout ?? item.component

    if (!Comp) return

    // 同一组件 → 跳过重渲染（持久化 layout/组件状态）
    if (cachedComp === Comp) return

    cachedComp = Comp

    el.textContent = ''
    setCtx(ctx)
    // 压栈：子树中同步创建的嵌套 RouteView 依此推导深度
    let stack = (ctx.route as any)[RV_STACK_KEY] as number[] | undefined
    if (!stack) {
      stack = []
      ;(ctx.route as any)[RV_STACK_KEY] = stack
    }
    stack.push(depth)
    try {
      const page = jsx(Comp, {})
      el.appendChild(page)
    } finally {
      stack.pop()
      setCtx(null)
    }
  }

  // 初始渲染
  render()

  // 监听路由变化
  window.addEventListener('wefu:route', render)
  onCleanup(() => window.removeEventListener('wefu:route', render))
  return el
}


