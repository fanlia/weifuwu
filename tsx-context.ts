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

interface CtxStore {
  _ctx: CtxValue
  _snapshot: Omit<CtxValue, 't'>
  _listeners: Set<() => void>
  _alsGetStore: (() => CtxValue | undefined) | null
}

const KEY = '__WEIFUWU_CTX_STORE'

function getStore(): CtxStore {
  if (typeof globalThis !== 'undefined' && (globalThis as any)[KEY]) {
    return (globalThis as any)[KEY]
  }
  const s: CtxStore = {
    _ctx: DEFAULT_CTX,
    _snapshot: { params: DEFAULT_CTX.params, query: DEFAULT_CTX.query, user: DEFAULT_CTX.user, parsed: DEFAULT_CTX.parsed, prefs: DEFAULT_CTX.prefs, env: DEFAULT_CTX.env },
    _listeners: new Set<() => void>(),
    _alsGetStore: null,
  }
  if (typeof globalThis !== 'undefined') {
    (globalThis as any)[KEY] = s
  }
  return s
}

const store = getStore()

const subscribe = (cb: () => void) => { store._listeners.add(cb); return () => { store._listeners.delete(cb) } }
const getSnapshot = () => store._snapshot
const getServerSnapshot = getSnapshot

/** @internal Injected by tsx-instance.ts for async-safe context isolation */
export function __registerAls(getStore: () => CtxValue | undefined) {
  store._alsGetStore = getStore
}

export function setCtx(value: Partial<CtxValue>) {
  store._ctx = { ...store._ctx, ...value }
  store._snapshot = { params: store._ctx.params, query: store._ctx.query, user: store._ctx.user, parsed: store._ctx.parsed, prefs: store._ctx.prefs, env: store._ctx.env }
  store._listeners.forEach(fn => fn())
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

function _readCtx(): CtxValue {
  const alsStore = store._alsGetStore?.()
  const base = alsStore ?? store._ctx
  const data = typeof window !== 'undefined' ? (window as any).__WEIFUWU_CTX : null
  return { ...base, ...data, t: _buildT() }
}

export function useCtx(): CtxValue {
  useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
  return _readCtx()
}

export const TsxContext = createContext<CtxValue>(DEFAULT_CTX)
