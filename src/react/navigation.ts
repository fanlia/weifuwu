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
