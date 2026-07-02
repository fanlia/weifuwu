/**
 * Client-side entry for React hydration + SPA navigation.
 *
 * Usage (in a client bundle, e.g. client.ts):
 * ```ts
 * import { hydrate, createClientRouter } from 'weifuwu/react/client'
 * import HomePage from './pages/HomePage.js'
 * import UserPage from './pages/UserPage.js'
 *
 * const router = createClientRouter([
 *   { path: '/', component: HomePage },
 *   {
 *     path: '/users/:id',
 *     component: UserPage,
 *     loader: (params) => fetch(`/users/${params.id}?_data`).then(r => r.json()),
 *   },
 * ])
 *
 * hydrate(router.App)
 * ```
 */

import {
  createElement,
  createContext,
  useContext,
  useEffect,
  useCallback,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode,
  type ReactElement,
  type MouseEvent,
} from 'react'
import { hydrateRoot } from 'react-dom/client'
import { ServerDataContext } from './context.ts'

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface HydrateOptions {
  container?: HTMLElement
}

export interface ClientRoute {
  path: string
  component: ComponentType
  /** Called on client-side navigation. Returns data for useServerData(). */
  loader?: (params: Record<string, string>) => Promise<Record<string, unknown>>
}

export interface ClientRouter {
  App: ComponentType
  Link: (props: LinkProps) => ReactElement
  useParams: () => Record<string, string>
  navigate: (url: string) => Promise<void>
}

export interface LinkProps {
  href: string
  children: ReactNode
  [key: string]: unknown
}

// ═══════════════════════════════════════════════════════════════
// Route matching
// ═══════════════════════════════════════════════════════════════

function matchPath(
  pathname: string,
  pattern: string,
): Record<string, string> | null {
  const patParts = pattern.split('/').filter(Boolean)
  const pathParts = pathname.split('/').filter(Boolean)
  const hasWildcard = patParts[patParts.length - 1] === '*'

  if (!hasWildcard && patParts.length !== pathParts.length) return null
  if (hasWildcard && pathParts.length < patParts.length - 1) return null

  const params: Record<string, string> = {}
  for (let i = 0; i < patParts.length; i++) {
    if (patParts[i] === '*') {
      params['*'] = pathParts.slice(i).join('/')
      break
    }
    if (patParts[i].startsWith(':')) {
      params[patParts[i].slice(1)] = decodeURIComponent(pathParts[i])
    } else if (patParts[i] !== pathParts[i]) {
      return null
    }
  }
  return params
}

// ═══════════════════════════════════════════════════════════════
// Router context
// ═══════════════════════════════════════════════════════════════

interface RouterContextValue {
  params: Record<string, string>
  navigate: (url: string) => Promise<void>
  loading: boolean
}

const RouterContext = createContext<RouterContextValue | null>(null)
RouterContext.displayName = 'ClientRouter'

export function useParams(): Record<string, string> {
  return useContext(RouterContext)?.params ?? {}
}

export function useNavigate(): (url: string) => Promise<void> {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error('useNavigate() must be used within a client router')
  return ctx.navigate
}

// ═══════════════════════════════════════════════════════════════
// Link component
// ═══════════════════════════════════════════════════════════════

export function Link({ href, children, ...props }: LinkProps): ReactElement {
  const router = useContext(RouterContext)

  if (!router) {
    return createElement('a', { href, ...props }, children) as ReactElement
  }

  const isExternal =
    href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('//') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:')

  if (isExternal || (props as Record<string, unknown>).target !== undefined) {
    return createElement('a', { href, ...props }, children) as ReactElement
  }

  const handleClick = (e: MouseEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return
    if (e.button !== 0) return
    e.preventDefault()
    router.navigate(href)
  }

  return createElement('a', { href, onClick: handleClick, ...props }, children) as ReactElement
}

// ═══════════════════════════════════════════════════════════════
// Read server-injected data
// ═══════════════════════════════════════════════════════════════

function readInitialData(): Record<string, unknown> {
  if (typeof document === 'undefined') return {}
  const el = document.getElementById('__WEIFUWU_DATA__')
  if (el?.textContent) {
    try {
      return JSON.parse(el.textContent) as Record<string, unknown>
    } catch {
      /* ignore */
    }
  }
  return {}
}

// ═══════════════════════════════════════════════════════════════
// Client router (useSyncExternalStore)
// ═══════════════════════════════════════════════════════════════

interface StoreState {
  location: string
  data: Record<string, unknown>
  navId: number
  loading: boolean
}

export function createClientRouter(routes: ClientRoute[]): ClientRouter {
  function findRoute(pathname: string) {
    for (const route of routes) {
      const params = matchPath(pathname, route.path)
      if (params) return { route, params }
    }
    return null
  }

  // ── External store ────────────────────────────────────

  let state: StoreState = {
    location:
      typeof window !== 'undefined' ? window.location.pathname : '/',
    data: readInitialData(),
    navId: 0,
    loading: false,
  }

  const listeners = new Set<() => void>()

  function getSnapshot(): StoreState {
    return state
  }

  function subscribe(fn: () => void): () => void {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }

  function emit() {
    listeners.forEach((fn) => fn())
  }

  async function navigate(url: string, { push = true } = {}) {
    const match = findRoute(url)
    if (!match) {
      window.location.href = url
      return
    }

    const id = state.navId + 1
    state = { ...state, navId: id, loading: !!match.route.loader }
    emit()

    if (match.route.loader) {
      try {
        const newData = await match.route.loader(match.params)
        if (id < state.navId) return // stale
        state = { ...state, data: newData, loading: false }
      } catch (err) {
        console.error('[weifuwu/react] loader failed:', err)
        state = { ...state, loading: false }
        emit()
        return
      }
    }

    if (push) history.pushState({ weifuwu: true }, '', url)
    state = { ...state, location: url }
    emit()
  }

  // ── Router App component ──────────────────────────────

  function RouterApp(): ReactElement {
    const { location, data, loading } = useSyncExternalStore(
      subscribe,
      getSnapshot,
    )

    const match = findRoute(location)

    // Handle browser back/forward
    useEffect(() => {
      const handler = () => navigate(window.location.pathname, { push: false })
      window.addEventListener('popstate', handler)
      return () => window.removeEventListener('popstate', handler)
    }, [])

    const ctxNavigate = useCallback(
      (url: string) => navigate(url, { push: true }),
      [],
    )

    const ctxValue: RouterContextValue = {
      params: match?.params ?? {},
      navigate: ctxNavigate,
      loading,
    }

    const content = match
      ? createElement(match.route.component)
      : createElement('div', null, 'Page not found')

    return createElement(
      RouterContext.Provider,
      { value: ctxValue },
      createElement(
        ServerDataContext.Provider,
        { value: data },
        content,
      ),
    ) as ReactElement
  }

  function RouterLink(props: LinkProps): ReactElement {
    return createElement(Link, props) as ReactElement
  }

  return {
    App: RouterApp,
    Link: RouterLink,
    useParams,
    navigate: (url: string) => navigate(url, { push: true }),
  }
}

// ═══════════════════════════════════════════════════════════════
// Hydrate
// ═══════════════════════════════════════════════════════════════

export function hydrate(App: ComponentType, opts?: HydrateOptions) {
  const container = opts?.container ?? document.getElementById('root')
  if (!container) {
    throw new Error(
      'weifuwu/react: hydrate() — no container element found.',
    )
  }

  const serverData = readInitialData()

  const wrapped = createElement(
    ServerDataContext.Provider,
    { value: serverData },
    createElement(App),
  )

  hydrateRoot(container, wrapped)
}

export { useServerData } from './hooks.ts'
