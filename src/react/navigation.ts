/**
 * Shared navigation primitives — usable on both server and client.
 *
 * - Link: renders <a> on server (no RouterContext), SPA <a> on client
 * - useParams / useNavigate: client hooks (throw friendly error on server)
 */

import {
  createElement,
  createContext,
  useContext,
  type ReactNode,
  type ReactElement,
  type MouseEvent,
} from 'react'

// ═══════════════════════════════════════════════════════════════
// Router context
// ═══════════════════════════════════════════════════════════════

export interface RouterContextValue {
  params: Record<string, string>
  navigate: (url: string) => Promise<void>
  revalidate: () => Promise<void>
  loading: boolean
}

export const RouterContext = createContext<RouterContextValue | null>(null)
RouterContext.displayName = 'ClientRouter'

/** Get current route params. Returns {} when no router context (SSR / outside router). */
export function useParams(): Record<string, string> {
  return useContext(RouterContext)?.params ?? {}
}

/** Programmatic navigation. Throws if used outside a client router. */
export function useNavigate(): (url: string) => Promise<void> {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error('useNavigate() must be used within a client router')
  return ctx.navigate
}

// ═══════════════════════════════════════════════════════════════
// Link component
// ═══════════════════════════════════════════════════════════════

export interface LinkProps {
  href: string
  children: ReactNode
  [key: string]: unknown
}

/**
 * Navigation link.
 *
 * When inside a client router context: intercepts clicks for SPA navigation.
 * When outside (SSR / plain React): renders a plain <a> tag.
 *
 * Both cases produce identical DOM output — safe for hydration.
 */
export function Link({ href, children, ...props }: LinkProps): ReactElement {
  const router = useContext(RouterContext)

  const isExternal =
    href.startsWith('http://') ||
    href.startsWith('https://') ||
    href.startsWith('//') ||
    href.startsWith('mailto:') ||
    href.startsWith('tel:')

  if (!router || isExternal || (props as Record<string, unknown>).target !== undefined) {
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
// Form component
// ═══════════════════════════════════════════════════════════════

export interface FormProps {
  method?: 'get' | 'post' | 'put' | 'delete' | 'patch'
  action?: string
  children: ReactNode
  [key: string]: unknown
}

/** Revalidate the current route's data. */
export function useRevalidate(): () => Promise<void> {
  const ctx = useContext(RouterContext)
  if (!ctx) throw new Error('useRevalidate() must be used within a client router')
  return ctx.revalidate
}

/**
 * SPA form — submits via fetch instead of full page reload.
 *
 * On submit:
 * 1. Serializes form data via FormData
 * 2. fetch(action, { method, body })
 * 3. On redirect (3xx): SPA-navigates to the Location header
 * 4. On success: revalidates the current route's loader
 *
 * On the server (no RouterContext): renders a plain <form>.
 */
export function Form({ method = 'post', action, children, ...props }: FormProps): ReactElement {
  const router = useContext(RouterContext)

  if (!router) {
    return createElement('form', { method, action, ...props }, children) as ReactElement
  }

  const handleSubmit = async (e: Event) => {
    e.preventDefault()
    const form = e.target as HTMLFormElement
    const formData = new FormData(form)
    const url = action || window.location.pathname

    const fetchMethod =
      method === 'get' ? 'GET' : method.toUpperCase()

    try {
      const res = await fetch(url, {
        method: fetchMethod,
        body: fetchMethod === 'GET' ? undefined : formData,
        redirect: 'manual',
      })

      // Handle redirect
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('Location')
        if (loc) {
          router.navigate(loc)
          return
        }
      }

      // Revalidate current route
      await router.revalidate()
    } catch (err) {
      console.error('[weifuwu/react] Form submit failed:', err)
    }
  }

  return createElement(
    'form',
    { method, action, ...props, onSubmit: handleSubmit as unknown as (e: React.FormEvent) => void },
    children,
  ) as ReactElement
}

// ═══════════════════════════════════════════════════════════════
// Route matching
// ═══════════════════════════════════════════════════════════════

export function matchPath(
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

// Re-export data primitives for convenience (both safe for server & client)
export { useServerData } from './hooks.ts'
export { ServerDataContext } from './context.ts'
export { ErrorBoundary } from './error-boundary.ts'
export type { ErrorBoundaryProps } from './error-boundary.ts'
