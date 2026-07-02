/**
 * Client-side entry for React hydration + SPA navigation.
 *
 * Usage (in a client bundle):
 * ```ts
 * import { hydrate, createClientRouter } from 'weifuwu/react/client'
 * import HomePage from './pages/HomePage.js'
 *
 * const router = createClientRouter([
 *   { path: '/', component: HomePage },
 *   { path: '/users/:id', component: UserPage, loader: ... },
 * ])
 * hydrate(router.App)
 * ```
 */

import {
  createElement,
  useContext,
  useEffect,
  useCallback,
  useSyncExternalStore,
  type ComponentType,
  type ReactElement,
} from 'react'
import { hydrateRoot, createRoot } from 'react-dom/client'
import { ServerDataContext } from './context.ts'
import {
  RouterContext,
  Link,
  useParams,
  matchPath,
  type RouterContextValue,
  type LinkProps,
  type NavigationState,
} from './navigation.ts'

// ═══════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════

export interface HydrateOptions {
  container?: HTMLElement
}

export interface ClientRoute {
  path: string
  /** Component function or a file path string (resolved via componentRegistry). */
  component: ComponentType | string
  loader?: (params: Record<string, string>) => Promise<Record<string, unknown>>
}

export interface ClientRouter {
  App: ComponentType
  Link: (props: LinkProps) => ReactElement
  useParams: () => Record<string, string>
  navigate: (url: string) => Promise<void>
}

// Re-export shared primitives for convenience
export { Link, useParams, useNavigate, useRevalidate, Form, useNavigation } from './navigation.ts'
export type { LinkProps, FormProps, NavigationState } from './navigation.ts'
export { ErrorBoundary } from './error-boundary.ts'
export type { ErrorBoundaryProps } from './error-boundary.ts'
export { defineRoute } from './route-utils.ts'

// ═══════════════════════════════════════════════════════════════
// Component registry — maps string paths to component functions
// ═══════════════════════════════════════════════════════════════

const registry = new Map<string, ComponentType>()

/** Register a component for string-based route resolution. */
export function registerComponent(path: string, component: ComponentType): void {
  registry.set(path, component)
}

function resolveComponent(spec: ComponentType | string): ComponentType {
  if (typeof spec === 'string') {
    const c = registry.get(spec)
    if (!c) throw new Error(`Component not registered: "${spec}". Use registerComponent() first.`)
    return c
  }
  return spec
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
// Client router
// ═══════════════════════════════════════════════════════════════

interface StoreState {
  location: string
  data: Record<string, unknown>
  navId: number
  state: NavigationState
}

export function createClientRouter(routes: ClientRoute[]): ClientRouter {
  function findRoute(pathname: string) {
    for (const route of routes) {
      const params = matchPath(pathname, route.path)
      if (params) return { route, params }
    }
    return null
  }

  let state: StoreState = {
    location:
      typeof window !== 'undefined' ? window.location.pathname : '/',
    data: readInitialData(),
    navId: 0,
    state: 'idle',
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
    state = { ...state, navId: id, state: match.route.loader ? 'loading' as NavigationState : 'idle' as NavigationState }
    emit()

    if (match.route.loader) {
      try {
        const newData = await match.route.loader(match.params)
        if (id < state.navId) return
        state = { ...state, data: newData, state: 'idle' as NavigationState }
      } catch (err) {
        console.error('[weifuwu/react] loader failed:', err)
        state = { ...state, state: 'idle' as NavigationState }
        emit()
        return
      }
    }

    if (push) history.pushState({ weifuwu: true }, '', url)
    state = { ...state, location: url, state: 'idle' as NavigationState }
    emit()
  }

  function RouterApp(): ReactElement {
    const { location, data, state: navState } = useSyncExternalStore(
      subscribe,
      getSnapshot,
    )

    const match = findRoute(location)

    useEffect(() => {
      const handler = () => navigate(window.location.pathname, { push: false })
      window.addEventListener('popstate', handler)
      return () => window.removeEventListener('popstate', handler)
    }, [])

    const ctxNavigate = useCallback(
      (url: string) => navigate(url, { push: true }),
      [],
    )

    const ctxRevalidate = useCallback(async () => {
      const currentMatch = findRoute(window.location.pathname)
      if (currentMatch?.route.loader) {
        state = { ...state, state: 'loading' as NavigationState }
        emit()
        try {
          const newData = await currentMatch.route.loader(currentMatch.params)
          state = { ...state, data: newData, state: 'idle' as NavigationState }
          emit()
        } catch (err) {
          console.error('[weifuwu/react] revalidate failed:', err)
          state = { ...state, state: 'idle' as NavigationState }
          emit()
        }
      }
    }, [])

    const ctxValue: RouterContextValue = {
      params: match?.params ?? {},
      navigate: ctxNavigate,
      revalidate: ctxRevalidate,
      state: navState,
    }

    const component = match ? resolveComponent(match.route.component) : null
    const content = component
      ? createElement(component)
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

  hydrateRoot(
    container,
    createElement(
      ServerDataContext.Provider,
      { value: serverData },
      createElement(App),
    ),
  )
}

/**
 * Client-side render (no hydration).
 * Replaces the server-rendered content with a fresh React render.
 * Use this if you prefer SPA-style rendering over SSR hydration.
 */
export function mount(App: ComponentType, opts?: HydrateOptions) {
  const container = opts?.container ?? document.getElementById('root')
  if (!container) {
    throw new Error(
      'weifuwu/react: mount() — no container element found.',
    )
  }

  const serverData = readInitialData()
  const root = createRoot(container)
  root.render(
    createElement(
      ServerDataContext.Provider,
      { value: serverData },
      createElement(App),
    ),
  )
}

export { useServerData } from './hooks.ts'
