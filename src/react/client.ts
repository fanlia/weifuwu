/**
 * Client-side entry for React hydration.
 *
 * Usage (in a client bundle):
 * ```ts
 * import { hydrate } from 'weifuwu/react/client'
 * import PageShell from './components/PageShell.tsx'
 * import HomePage from './pages/HomePage.tsx'
 * hydrate(HomePage, { layout: PageShell })
 * ```
 */

import { createElement, type ComponentType, type ReactNode } from 'react'
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

export { useServerData } from './hooks.ts'
