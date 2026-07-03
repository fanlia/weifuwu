import { createElement, type ComponentType, type ReactNode } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { createContext, useContext } from 'react'

const CTX_KEY = Symbol.for('weifuwu.react.ServerDataContext')
const globalStore = globalThis as any
const ServerDataContext = globalStore[CTX_KEY] || (globalStore[CTX_KEY] = createContext({}))

export function useServerData<T = Record<string, unknown>>(): T {
  if (typeof document === 'undefined') return useContext(ServerDataContext) as T
  const el = document.getElementById('__WEIFUWU_DATA__')
  if (el?.textContent) { try { return JSON.parse(el.textContent) as T } catch { /* */ } }
  return {} as T
}

export function mount(App: ComponentType, layout?: ComponentType<{ children: ReactNode }>) {
  let element = createElement(App)
  if (layout) {
    element = createElement(layout, { children: element })
  }
  hydrateRoot(document.getElementById('root')!, element)
}
