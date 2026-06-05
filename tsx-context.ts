import { useSyncExternalStore, createContext } from 'react'

export interface CtxValue {
  params: Record<string, string>
  query: Record<string, string>
  user: { id?: string }
  parsed: Record<string, unknown>
  prefs: Record<string, string>
  t: (key: string, params?: Record<string, string>, fallback?: string) => string
  env: Record<string, string>
}

const fallbackT = (key: string, _params?: Record<string, string>, fallback?: string) => fallback ?? key

let _ctx: CtxValue = { params: {}, query: {}, parsed: {}, prefs: {}, env: {}, t: fallbackT, user: {} }
let _snapshot = { params: _ctx.params, query: _ctx.query, user: _ctx.user, parsed: _ctx.parsed, prefs: _ctx.prefs, env: _ctx.env }
const _listeners = new Set<() => void>()

const subscribe = (cb: () => void) => { _listeners.add(cb); return () => { _listeners.delete(cb) } }
const getSnapshot = () => _snapshot
const getServerSnapshot = getSnapshot

export function setCtx(value: Partial<CtxValue>) {
  _ctx = { ..._ctx, ...value }
  _snapshot = { params: _ctx.params, query: _ctx.query, user: _ctx.user, parsed: _ctx.parsed, prefs: _ctx.prefs, env: _ctx.env }
  _listeners.forEach(fn => fn())
}

function _buildT(): (key: string, params?: Record<string, string>, fallback?: string) => string {
  const messages = typeof window !== 'undefined'
    ? (window as any).__LOCALE_DATA__
    : (globalThis as any).__LOCALE_DATA__
  if (!messages) return fallbackT
  return (key: string, params?: Record<string, string>, fallback?: string) => {
    const msg = key.split('.').reduce((o: any, k: string) => o?.[k], messages as any)
    if (msg === undefined || msg === null) return fallback ?? key
    if (!params) return String(msg)
    let result = String(msg)
    for (const [k, v] of Object.entries(params)) result = result.replace(`{${k}}`, v)
    return result
  }
}

export function useCtx(): CtxValue {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const data = typeof window !== 'undefined' ? (window as any).__WEIFUWU_CTX : null
  const t = _ctx.t !== fallbackT ? _ctx.t : _buildT()
  return { ..._ctx, ...data, t }
}

export const TsxContext = createContext<CtxValue>({ params: {}, query: {}, parsed: {}, prefs: {}, env: {}, t: fallbackT, user: {} })
