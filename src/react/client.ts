/**
 * Client-side entry for React hydration and SPA routing.
 *
 * Hydration:
 * ```ts
 * import { hydrate } from 'weifuwu/react/client'
 * hydrate(HomePage, { layout: PageShell })
 * ```
 *
 * Client-side router:
 * ```ts
 * import { createBrowserRouter } from 'weifuwu/react/client'
 * createBrowserRouter({
 *   layout: PageShell,
 *   routes: {
 *     '/': () => import('./pages/HomePage.tsx'),
 *     '/users/:id': () => import('./pages/UserPage.tsx'),
 *   },
 * })
 * ```
 */

import { createElement, type ComponentType, type ReactNode } from 'react'
import { hydrateRoot, createRoot } from 'react-dom/client'
import { ServerDataContext } from './context.ts'

// ═══════════════════════════════════════════════════════════════
// Data helpers
// ═══════════════════════════════════════════════════════════════

function readInitialData(): Record<string, unknown> {
  if (typeof document === 'undefined') return {}
  const el = document.getElementById('__WEIFUWU_DATA__')
  if (el?.textContent) {
    try { return JSON.parse(el.textContent) as Record<string, unknown> }
    catch { /* ignore */ }
  }
  return {}
}

async function fetchPageData(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(url)
  const html = await res.text()
  const match = html.match(/<script[^>]*id="__WEIFUWU_DATA__"[^>]*>([\s\S]*?)<\/script>/)
  if (match) {
    try { return JSON.parse(match[1]) as Record<string, unknown> }
    catch { /* ignore */ }
  }
  return {}
}

// ═══════════════════════════════════════════════════════════════
// Route matching
// ═══════════════════════════════════════════════════════════════

interface CompiledRoute {
  pattern: string
  regex: RegExp
  paramNames: string[]
  loader: () => Promise<Record<string, unknown>>
}

function compilePattern(pattern: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = []
  const regexStr = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // escape regex specials
    .replace(/:([^/]+)/g, (_: string, name: string) => {
      paramNames.push(name)
      return '([^/]+)'
    })
  return { regex: new RegExp(`^${regexStr}$`), paramNames }
}

function matchRoute(
  pathname: string,
  routes: CompiledRoute[],
): { route: CompiledRoute; params: Record<string, string> } | null {
  for (const route of routes) {
    const m = pathname.match(route.regex)
    if (m) {
      const params: Record<string, string> = {}
      route.paramNames.forEach((name, i) => { params[name] = m[i + 1] })
      return { route, params }
    }
  }
  return null
}

function extractComponent(mod: Record<string, unknown>): ComponentType {
  if (mod.default && typeof mod.default === 'function') return mod.default as ComponentType
  for (const val of Object.values(mod)) {
    if (typeof val === 'function') return val as ComponentType
  }
  throw new Error('No component export found in module')
}

// ═══════════════════════════════════════════════════════════════
// Hydrate (standalone, no router)
// ═══════════════════════════════════════════════════════════════

export interface HydrateOptions {
  /** Hydration target element. Default: document.getElementById('root'). */
  container?: HTMLElement
  /**
   * Layout component matching the server-side `react({ layout })` config.
   * Must accept `{ children: ReactNode }`.
   * When provided, wraps the page component before hydrating —
   * producing the same tree the server rendered.
   */
  layout?: ComponentType<{ children: ReactNode }>
}

/**
 * Hydrate a page component. When `layout` is provided, the hydration tree
 * matches the server-rendered structure: `<div id="root"><Layout><App /></Layout></div>`.
 */
export function hydrate(App: ComponentType, opts?: HydrateOptions) {
  const container = opts?.container ?? document.getElementById('root')!
  const data = readInitialData()
  let element = createElement(App)
  if (opts?.layout) {
    element = createElement(opts.layout, { children: element })
  }
  hydrateRoot(
    container,
    createElement(ServerDataContext.Provider, { value: data }, element),
  )
}

// ═══════════════════════════════════════════════════════════════
// Client-side router
// ═══════════════════════════════════════════════════════════════

export interface ClientRouterOptions {
  /** Layout component shared across all routes. */
  layout?: ComponentType<{ children: ReactNode }>
  /**
   * Route map: URL pattern → lazy component loader.
   * Patterns support `:param` segments (e.g. `/users/:id`).
   */
  routes: Record<string, () => Promise<Record<string, unknown>>>
  /**
   * Fallback component for unmatched routes.
   * When omitted, unmatched routes do a full page navigation.
   */
  fallback?: () => Promise<Record<string, unknown>>
  /** Target element. Default: document.getElementById('root'). */
  container?: HTMLElement
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _root: any = null

function renderPage(
  container: HTMLElement,
  layout: ComponentType<{ children: ReactNode }> | undefined,
  Component: ComponentType,
  data: Record<string, unknown>,
  isInitial: boolean,
) {
  let element = createElement(Component)
  if (layout) {
    element = createElement(layout, { children: element })
  }
  const wrapped = createElement(ServerDataContext.Provider, { value: data }, element)

  if (isInitial) {
    _root = hydrateRoot(container, wrapped)
  } else {
    if (!_root) _root = createRoot(container)
    _root.render(wrapped)
  }
}

interface RouterHandle {
  navigate(url: string): Promise<void>
  renderPath(pathname: string, isInitial: boolean, data?: Record<string, unknown>): Promise<void>
}

let _router: RouterHandle | null = null

/**
 * Initialise the client-side router.
 *
 * On the initial page load, it hydrates the matching route from the
 * server-rendered HTML.  Subsequent in-app navigations fetch fresh
 * server data and render the new page client-side.
 */
export function createBrowserRouter(opts: ClientRouterOptions) {
  if (_router) return _router

  const container = opts.container ?? document.getElementById('root')!
  const layout = opts.layout
  const routes: CompiledRoute[] = Object.entries(opts.routes).map(([pattern, loader]) => {
    const { regex, paramNames } = compilePattern(pattern)
    return { pattern, regex, paramNames, loader }
  })
  let fallback: CompiledRoute | null = null
  if (opts.fallback) {
    const { regex, paramNames } = compilePattern('*')
    fallback = { pattern: '*', regex, paramNames, loader: opts.fallback }
  }

  /** Render the matched page for a given pathname. */
  async function renderPath(pathname: string, isInitial: boolean, data?: Record<string, unknown>) {
    const matched = matchRoute(pathname, routes)
    const route = matched?.route ?? fallback

    if (!route) {
      // No match and no fallback: do a full page load
      window.location.href = pathname
      return
    }

    try {
      const mod = await route.loader()
      const Component = extractComponent(mod)
      const pageData = data ?? (isInitial ? readInitialData() : await fetchPageData(pathname))
      renderPage(container, layout, Component, pageData, isInitial)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[weifuwu] router error:', err)
      if (fallback && route !== fallback) {
        try {
          const fallbackMod = await fallback.loader()
          const FallbackComponent = extractComponent(fallbackMod)
          renderPage(container, layout, FallbackComponent, { error: String(err) }, false)
        } catch {
          container.innerHTML = '<h1>Something went wrong</h1>'
        }
      } else {
        container.innerHTML = '<h1>Something went wrong</h1>'
      }
    }
  }

  /** Navigate to a URL (client-side if same-origin internal link). */
  async function navigate(url: string) {
    const u = new URL(url, window.location.origin)
    if (u.origin !== window.location.origin || u.pathname === window.location.pathname) {
      // Same page or external: let browser handle it
      return
    }
    history.pushState({}, '', url)
    scrollTo(0, 0)
    await renderPath(u.pathname, false)
  }

  // Handle back/forward
  window.addEventListener('popstate', () => {
    renderPath(window.location.pathname, false)
  })

  // Intercept <a> clicks for internal navigation
  document.addEventListener('click', (e) => {
    const target = (e.target as HTMLElement).closest('a') as HTMLAnchorElement | null
    if (!target) return
    const href = target.getAttribute('href')
    if (!href) return

    // Skip external links, hash links, download links, new-tab links
    const u = new URL(href, window.location.origin)
    if (
      u.origin !== window.location.origin ||
      target.hasAttribute('download') ||
      target.target === '_blank' ||
      target.getAttribute('rel') === 'external'
    ) return

    e.preventDefault()
    navigate(href)
  })

  // Initial render: hydrate from server HTML
  const initialData = readInitialData()
  renderPath(window.location.pathname, true, initialData)

  _router = { navigate, renderPath }
  return _router
}

/**
 * Programmatic navigation (call from anywhere).
 * Falls back to `window.location.href = url` if the router hasn't been initialised.
 */
export function navigate(url: string) {
  if (_router) {
    _router.navigate(url)
  } else {
    window.location.href = url
  }
}

export { useServerData } from './hooks.ts'
