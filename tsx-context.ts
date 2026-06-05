import { useSyncExternalStore, createContext } from 'react'

export interface CtxValue {
  params: Record<string, string>
  query: Record<string, string>
  user?: unknown
  parsed: Record<string, unknown>
  prefs: Record<string, string>
  locale?: string
  theme?: string
  t: (key: string, params?: Record<string, string>, fallback?: string) => string
  env: Record<string, string>
}

const fallbackT = (key: string, _params?: Record<string, string>, fallback?: string) => fallback ?? key

let _ctx: CtxValue = { params: {}, query: {}, parsed: {}, prefs: {}, env: {}, t: fallbackT }
const _listeners = new Set<() => void>()

export function setCtx(value: Partial<CtxValue>) {
  _ctx = { ..._ctx, ...value }
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
  useSyncExternalStore(
    (cb) => { _listeners.add(cb); return () => { _listeners.delete(cb) } },
    () => _ctx,
    () => _ctx,
  )

  const data = typeof window !== 'undefined' ? (window as any).__WEIFUWU_CTX : null
  const t = data?.t ?? _ctx.t ?? _buildT()
  return { ..._ctx, ...data, t }
}

// Keep for backward compatibility
export const TsxContext = createContext<CtxValue>({ params: {}, query: {}, parsed: {}, prefs: {}, env: {}, t: fallbackT })
