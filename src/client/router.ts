/**
 * weifuwu/client router — 路由中间件 + RouteView + Outlet 组件
 *
 * 支持嵌套布局：RouteDef.layout + RouteDef.children + <Outlet/>。
 *
 * ```tsx
 * const routes = [
 *   {
 *     path: '/dashboard',
 *     layout: DashboardLayout,   // 持久化布局
 *     children: [
 *       { path: '/overview', component: OverviewPage },  // 只替换 <Outlet/> 区域
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
 *       <main><Outlet /></main>
 *     </div>
 *   )
 * }
 * ```
 */

import type { WfuiContext, AppMiddleware, RouteDef } from './types.ts'
import type { Component } from './jsx-runtime.ts'
import { jsx, setCtx, onCleanup, getCtx } from './jsx-runtime.ts'

export interface RouterOptions {
  mode?: 'hash' | 'history'
  routes: RouteDef[]
  notFound?: Component
  /** 页面切换过渡动画名（可选），对应 CSS class 前缀 */
  transition?: string
  /** 是否启用滚动位置恢复（history 模式，默认 true） */
  scrollRestoration?: boolean
}

// ── 内部类型：扁平化后的匹配项 ──────────────────────────────

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

// Symbol 用于在 ctx.route 上存储内部链数据（不暴露给用户）
const CHAIN_KEY = Symbol('routeChain')
const DEPTH_KEY = Symbol('routeDepth')

/**
 * 路由中间件 — 注入 ctx.route + 改写 ctx.app.navigate
 */
export function router(opts: RouterOptions): AppMiddleware {
  const mode = opts.mode ?? 'hash'

  // 递归扁平化路由树 → 一维 matcher 数组
  const flatRoutes = flattenRoutes(opts.routes)

  function matchRoute(path: string): { chain: ChainItem[]; leafRoute: RouteDef } | null {
    for (const fr of flatRoutes) {
      const result = path.match(fr.re)
      if (!result) continue

      // 构建完整链，注入实际参数
      // 只有叶子节点才需要从正则提取参数
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
      // 清空链
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

    // 存储链用于 Outlet
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
      const routeDef = ctx.route.component ? undefined : undefined
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
      // 滚动位置缓存（用于 scrollRestoration）
      const scrollPositions = new Map<string, number>()

      ctx.app.navigate = (path: string) => {
        if (opts.scrollRestoration !== false) {
          scrollPositions.set(window.location.pathname, window.scrollY)
        }
        window.history.pushState({}, '', path)
        navigateAndLoad(path)
      }

      window.addEventListener('popstate', () => {
        // 恢复滚动位置
        if (opts.scrollRestoration !== false) {
          const savedY = scrollPositions.get(window.location.pathname)
          if (savedY !== undefined) {
            requestAnimationFrame(() => window.scrollTo(0, savedY))
          }
        }
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

    // 有 children → 递归展开，同时收集 chain
    if (route.children && route.children.length > 0) {
      // 为每个子路由构建 chain
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
      // 无 children → 普通路由，chain 只有自身
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
 * Outlet — 嵌套路由出口
 *
 * 在 layout 组件中使用，渲染当前路由的子路由组件。
 *
 * ```tsx
 * function DashboardLayout(_props: {}, ctx: WfuiContext) {
 *   return (
 *     <div class="flex">
 *       <Sidebar />
 *       <main><Outlet /></main>
 *     </div>
 *   )
 * }
 * ```
 */
export function Outlet(_props: {}, ctx: WfuiContext): Node {
  const chain = (ctx.route as any)[CHAIN_KEY] as ChainItem[] | undefined
  let depth = (ctx.route as any)[DEPTH_KEY] as number | undefined
  if (depth === undefined) depth = 0

  if (!chain || depth >= chain.length) {
    // 没有更多子路由 → 空
    return document.createComment(' no outlet ')
  }

  const item = chain[depth]

  // 递增 depth 供下游 Outlet 使用
  ;(ctx.route as any)[DEPTH_KEY] = depth + 1

  if (item.layout) {
    // 有 layout → 递归渲染 layout，其内部的 Outlet 会渲染下一级
    setCtx(ctx)
    const node = jsx(item.layout, {})
    setCtx(null)
    return node
  }

  if (item.component) {
    // 叶子节点 → 渲染组件
    setCtx(ctx)
    const node = jsx(item.component, {})
    setCtx(null)
    // 渲染完成后复位 depth（供下次路由切换使用）
    setTimeout(() => { (ctx.route as any)[DEPTH_KEY] = 0 }, 0)
    return node
  }

  return document.createComment(' no component ')
}

/**
 * 从 CSS transition-duration / animation-duration 中读取最大时长（ms）。
 * transition 优先于 animation，取两者中的最大值。
 */
function _getMaxDuration(el: Element): number {
  const style = getComputedStyle(el)
  let maxMs = 0

  const td = style.transitionDuration
  if (td && td !== '0s') {
    for (const val of td.split(',')) {
      const ms = _parseCssDuration(val.trim())
      if (ms > maxMs) maxMs = ms
    }
  }

  const ad = style.animationDuration
  if (ad && ad !== '0s') {
    for (const val of ad.split(',')) {
      const ms = _parseCssDuration(val.trim())
      if (ms > maxMs) maxMs = ms
    }
  }

  return maxMs || 300
}

function _parseCssDuration(s: string): number {
  if (s.endsWith('ms')) return parseFloat(s) || 0
  if (s.endsWith('s')) return (parseFloat(s) || 0) * 1000
  return 0
}

/**
 * RouteView — 渲染当前路由匹配的组件
 *
 * 智能切换逻辑：
 * - 同一组件 + 同一路径 + 同一 query → 跳过
 * - query 变化 → 重新渲染
 * - 路径/组件变化 → 替换 DOM
 *
 * 支持嵌套布局：如果路由有 layout，RouteView 渲染最外层 layout，
 * layout 内部的 <Outlet/> 递归渲染子路由。
 */
export function RouteView(_props: {}, ctx: WfuiContext): Node {
  const el = document.createElement('div')
  el.style.position = 'relative'
  let currentPath = ''
  let currentQuery = ''
  let currentComponent: Component | null = null
  let leavingPage: HTMLElement | null = null

  function removeLeaving() {
    if (leavingPage && el.contains(leavingPage)) {
      el.removeChild(leavingPage)
    }
    leavingPage = null
  }

  function render() {
    // 从 chain 取顶层组件
    const chain = (ctx.route as any)[CHAIN_KEY] as ChainItem[] | undefined
    const topItem = chain?.[0]
    const Component = topItem?.layout ?? ctx.route.component
    const path = ctx.route.path
    const queryStr = JSON.stringify(ctx.route.query)
    const trans = ctx.route.transition

    if (!Component) {
      if (el.children.length > 0) el.textContent = ''
      currentPath = ''
      currentQuery = ''
      currentComponent = null
      return
    }

    if (Component === currentComponent && path === currentPath && queryStr === currentQuery) return

    currentPath = path
    currentQuery = queryStr

    // 重置 Outlet depth
    ;(ctx.route as any)[DEPTH_KEY] = 0

    if (trans) {
      const prev = currentComponent ? el.lastElementChild : null
      if (prev instanceof HTMLElement) {
        prev.classList.add(`${trans}-leave`, `${trans}-leave-active`)
        leavingPage = prev

        const onLeaveEnd = () => {
          prev.classList.remove(`${trans}-leave`, `${trans}-leave-active`)
          removeLeaving()
          prev.removeEventListener('transitionend', onLeaveEnd)
          prev.removeEventListener('animationend', onLeaveEnd)
        }
        prev.addEventListener('transitionend', onLeaveEnd)
        prev.addEventListener('animationend', onLeaveEnd)
        const leaveDuration = _getMaxDuration(prev)
        setTimeout(onLeaveEnd, leaveDuration)
      }

      currentComponent = Component
      setCtx(ctx)
      const page = jsx(Component, {})
      setCtx(null)

      if (page instanceof HTMLElement) {
        page.style.position = 'absolute'
        page.style.top = '0'
        page.style.left = '0'
        page.style.width = '100%'
        page.classList.add(`${trans}-enter`)
        el.appendChild(page)

        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            page.classList.add(`${trans}-enter-active`)
            page.classList.remove(`${trans}-enter`)

            const onEnterEnd = () => {
              page.style.position = ''
              page.style.top = ''
              page.style.left = ''
              page.style.width = ''
              page.classList.remove(`${trans}-enter-active`)
              page.removeEventListener('transitionend', onEnterEnd)
              page.removeEventListener('animationend', onEnterEnd)
            }
            page.addEventListener('transitionend', onEnterEnd)
            page.addEventListener('animationend', onEnterEnd)
            const enterDuration = _getMaxDuration(page)
            setTimeout(onEnterEnd, enterDuration)
          })
        })
      } else {
        el.appendChild(page)
      }
    } else {
      currentComponent = Component
      el.textContent = ''
      setCtx(ctx)
      const page = jsx(Component, {})
      el.appendChild(page)
      setCtx(null)
    }
  }

  render()
  window.addEventListener('wefu:route', render)
  onCleanup(() => window.removeEventListener('wefu:route', render))
  return el
}
