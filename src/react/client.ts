/**
 * Client-side entry for React hydration.
 *
 * Usage (in a client bundle, e.g. client.ts):
 * ```ts
 * import { hydrate } from 'weifuwu/react/client'
 * import App from './App.js'
 * hydrate(App)
 * ```
 */

import { createElement, type ComponentType } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { ServerDataContext } from './context.ts'

export interface HydrateOptions {
  /** The DOM element to hydrate into. Default: document.getElementById('root') */
  container?: HTMLElement
}

/**
 * Hydrate a React app on the client.
 * Reads server data from the `__WEIFUWU_DATA__` script tag injected by ctx.render().
 * Wraps the App in ServerDataContext.Provider so useServerData() works on both sides.
 */
export function hydrate(App: ComponentType, opts?: HydrateOptions) {
  const container = opts?.container ?? document.getElementById('root')
  if (!container) {
    throw new Error(
      'weifuwu/react: hydrate() — no container element found. Add <div id="root"> to your layout.',
    )
  }

  // Read server-serialized data
  let serverData: Record<string, unknown> = {}
  const el = document.getElementById('__WEIFUWU_DATA__')
  if (el?.textContent) {
    try {
      serverData = JSON.parse(el.textContent)
    } catch {
      /* ignore invalid JSON */
    }
  }

  const wrapped = createElement(
    ServerDataContext.Provider,
    { value: serverData },
    createElement(App),
  )

  hydrateRoot(container, wrapped)
}

export { useServerData } from './hooks.ts'
