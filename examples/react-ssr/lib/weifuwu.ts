import { createElement } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { createContext, useContext } from 'react'

const CTX_KEY = Symbol.for('weifuwu.react.ServerDataContext')
const globalStore = globalThis as any
const ServerDataContext = globalStore[CTX_KEY] || (globalStore[CTX_KEY] = createContext({}))

export function useServerData<T = Record<string, unknown>>(): T {
  // Server: React Context (set by framework's ServerDataContext.Provider)
  if (typeof document === 'undefined') return useContext(ServerDataContext) as T
  // Client: read from __WEIFUWU_DATA__ script (Layout renders it)
  const el = document.getElementById('__WEIFUWU_DATA__')
  if (el?.textContent) { try { return JSON.parse(el.textContent) as T } catch { /* */ } }
  return {} as T
}

export function hydrate(App: any) {
  const el = document.getElementById('root')
  if (!el) throw new Error('No #root element')
  hydrateRoot(el, createElement(App))
}
