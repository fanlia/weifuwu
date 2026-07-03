/**
 * Client-side entry for React hydration.
 *
 * Usage (in a client bundle):
 * ```ts
 * import { hydrate } from 'weifuwu/react/client'
 * import HomePage from './pages/HomePage.tsx'
 * hydrate(HomePage)
 * ```
 */

import { createElement, type ComponentType } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { ServerDataContext } from './context.ts'

function readInitialData(): Record<string, unknown> {
  if (typeof document === 'undefined') return {}
  const el = document.getElementById('__WEIFUWU_DATA__')
  if (el?.textContent) {
    try { return JSON.parse(el.textContent) as Record<string, unknown> }
    catch { /* ignore */ }
  }
  return {}
}

export interface HydrateOptions {
  container?: HTMLElement
}

/**
 * Hydrate a full-page component. Default container is document.documentElement
 * since the server renders <html> as root.
 */
export function hydrate(App: ComponentType, opts?: HydrateOptions) {
  const container = opts?.container ?? document.documentElement
  const data = readInitialData()
  hydrateRoot(
    container,
    createElement(ServerDataContext.Provider, { value: data }, createElement(App)),
  )
}

export { useServerData } from './hooks.ts'
