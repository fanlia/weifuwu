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

/** Hydrate a component into #root, reusing server-rendered DOM. */
export function hydrate(App: ComponentType, opts?: HydrateOptions) {
  const container = opts?.container ?? document.getElementById('root')
  if (!container) throw new Error('weifuwu/react: hydrate() — no #root element found.')
  const data = readInitialData()
  hydrateRoot(
    container,
    createElement(ServerDataContext.Provider, { value: data }, createElement(App)),
  )
}

export { useServerData } from './hooks.ts'
