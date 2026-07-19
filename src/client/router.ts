/**
 * weifuwu/client router — 路由中间件 + RouteView 组件
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

  function matchRoute(path: string): { matched: { component: Component; params: Record<string, string>; title?: string; auth?: boolean }; routeDef: RouteDef } | null {
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
      // 用 window.CustomEvent 而非全局 CustomEvent，确保 JSDOM 下 dispatchEvent 能识别
      const Ctor = (window as any).CustomEvent || CustomEvent
      window.dispatchEvent(new Ctor('wefu:route', { detail: { path } }))
    }

    function resolve(path: string): { component: Component | null; routeDef: RouteDef | undefined } {
      const raw = mode === 'hash' ? path || '/' : path
      const [cleanPath, qs] = raw.split('?')
      ctx.route.query = Object.fromEntries(new URLSearchParams(qs ?? ''))
      ctx.route.path = cleanPath

      const r = matchRoute(cleanPath)
      if (!r) {
        ctx.route.component = opts.notFound ?? null
        ctx.route.data = {}
        ctx.route.transition = opts.transition
        return { component: null, routeDef: undefined }
      }

      ctx.route.params = r.matched.params
      ctx.route.component = r.matched.component
      ctx.route.title = r.matched.title
      ctx.route.auth = r.matched.auth
      ctx.route.transition = r.routeDef.transition ?? opts.transition
      if (r.matched.title) document.title = r.matched.title

      return { component: r.matched.component, routeDef: r.routeDef }
    }

    // 路由切换核心逻辑
    function navigateAndLoad(path: string) {
      const { routeDef } = resolve(path)

      // 有 loader：先设 loading=true 触发渲染，再异步加载
      if (routeDef?.loader) {
        ctx.route.loading = true
        emit(ctx.route.path)

        routeDef.loader(ctx).then(data => {
          ctx.route.data = data
          ctx.route.loading = false
          emit(ctx.route.path)
        }).catch(() => {
          ctx.route.data = {}
          ctx.route.loading = false
          emit(ctx.route.path)
        })
      } else {
        // 无 loader：直接渲染，loading=false
        ctx.route.loading = false
        emit(ctx.route.path)
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
 * 从 CSS transition-duration / animation-duration 中读取最大时长（ms）。
 * transition 优先于 animation，取两者中的最大值。
 */
function _getMaxDuration(el: Element): number {
  const style = getComputedStyle(el)
  let maxMs = 0

  // 解析 transition-duration
  const td = style.transitionDuration
  if (td && td !== '0s') {
    for (const val of td.split(',')) {
      const ms = _parseCssDuration(val.trim())
      if (ms > maxMs) maxMs = ms
    }
  }

  // 解析 animation-duration
  const ad = style.animationDuration
  if (ad && ad !== '0s') {
    for (const val of ad.split(',')) {
      const ms = _parseCssDuration(val.trim())
      if (ms > maxMs) maxMs = ms
    }
  }

  return maxMs || 300 // 最少 300ms 保证动画完成
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
 * - 同一组件 + 同一路径 + 同一 query → 跳过（避免 loader 二次 emit）
 * - query 变化 → 重新渲染（ctx.route.query 已更新）
 * - 路径/组件变化 → 替换 DOM
 *
 * 当 ctx.route.transition 设置了动画名时，页面切换带动画过渡。
 * 旧页面执行 leave 动画后移除，新页面执行 enter 动画后展示。
 * 动画时长从元素的 CSS transition-duration / animation-duration 自动读取。
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
    const Component = ctx.route.component
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

    // 同一组件 + 同一路径 + 同一 query → 跳过（避免 loader 二次 emit）
    if (Component === currentComponent && path === currentPath && queryStr === currentQuery) return

    // 路径/组件/query 任一发生变化 → 切换页面
    currentPath = path
    currentQuery = queryStr

    if (trans) {
      // 带过渡的页面切换
      // 1. 将当前页面标记为 leaving（执行离开动画）
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
        // 超时回退：从实际 CSS 读取动画时长
        const leaveDuration = _getMaxDuration(prev)
        setTimeout(onLeaveEnd, leaveDuration)
      }

      // 2. 创建新页面并添加 enter 动画
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
      // 无过渡：直接替换
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
