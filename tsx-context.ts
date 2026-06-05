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

const DEFAULT_CTX: CtxValue = { params: {}, query: {}, parsed: {}, prefs: {}, env: {}, t: fallbackT, user: {} }
let _ctx: CtxValue = DEFAULT_CTX
let _snapshot = { params: _ctx.params, query: _ctx.query, user: _ctx.user, parsed: _ctx.parsed, prefs: _ctx.prefs, env: _ctx.env }
const _listeners = new Set<() => void>()

const subscribe = (cb: () => void) => { _listeners.add(cb); return () => { _listeners.delete(cb) } }
const getSnapshot = () => _snapshot
const getServerSnapshot = getSnapshot

// ── Optional ALS integration (injected by tsx-instance.ts on server) ──
let _alsGetStore: (() => CtxValue | undefined) | null = null

/** @internal Injected by tsx-instance.ts for async-safe context isolation */
export function __registerAls(getStore: () => CtxValue | undefined) {
  _alsGetStore = getStore
}

export function setCtx(value: Partial<CtxValue>) {
  _ctx = { ..._ctx, ...value }
  _snapshot = { params: _ctx.params, query: _ctx.query, user: _ctx.user, parsed: _ctx.parsed, prefs: _ctx.prefs, env: _ctx.env }
  _listeners.forEach(fn => fn())
}

let _cachedT: ((key: string, params?: Record<string, string>, fallback?: string) => string) | null = null

function _buildT(): (key: string, params?: Record<string, string>, fallback?: string) => string {
  if (_cachedT) return _cachedT
  const messages = typeof window !== 'undefined'
    ? (window as any).__LOCALE_DATA__
    : (globalThis as any).__LOCALE_DATA__
  if (!messages) { _cachedT = fallbackT; return fallbackT }
  _cachedT = (key: string, params?: Record<string, string>, fallback?: string) => {
    const msg = key.split('.').reduce((o: any, k: string) => o?.[k], messages as any)
    if (msg === undefined || msg === null) return fallback ?? key
    if (!params) return String(msg)
    let result = String(msg)
    for (const [k, v] of Object.entries(params)) result = result.replace(`{${k}}`, v)
    return result
  }
  return _cachedT
}

function _readCtx(): CtxValue {
  // Prefer ALS store (async-safe, per-request isolation set by tsx-instance)
  const alsStore = _alsGetStore?.()
  const base = alsStore ?? _ctx

  const data = typeof window !== 'undefined' ? (window as any).__WEIFUWU_CTX : null
  const t = typeof base.t === 'function' && base.t !== fallbackT ? base.t : _buildT()
  return { ...base, ...data, t }
}

/**
 * React hook — returns the current request context.
 * Must be called from a React component or custom hook.
 */
export function useCtx(): CtxValue {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return _readCtx()
}

/**
 * Plain accessor — returns the current request context without calling any React hooks.
 * Safe to call from utility functions, route handlers, middleware, load functions, etc.
 */
export function getCtx(): CtxValue {
  return _readCtx()
}

export const TsxContext = createContext<CtxValue>(DEFAULT_CTX)
