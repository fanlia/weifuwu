import { useSyncExternalStore, createContext } from 'react'

export interface PageContext {
  params: Record<string, string>
  query: Record<string, string>
  user: { id?: string }
  parsed: Record<string, unknown>
  theme?: { value: string; set?: (value: string, loc?: string) => Response }
  i18n?: { locale: string; messages?: Record<string, unknown>; t: (key: string, params?: Record<string, string>, fallback?: string) => string }
  flash?: { value?: string; set?: (data: any, loc?: string) => Response }
  loaderData: Record<string, unknown>
  env: Record<string, string>
}

const DEFAULT_CTX: PageContext = { params: {}, query: {}, parsed: {}, loaderData: {}, env: {}, user: {}, flash: {} }

interface CtxStore {
  _ctx: PageContext
  _snapshot: PageContext
  _listeners: Set<() => void>
  _rebuilders: Array<(value: Partial<PageContext>) => Partial<PageContext> | null>
  _alsGetStore: (() => PageContext | undefined) | null
}

const KEY = '__WEIFUWU_CTX_STORE'

function getStore(): CtxStore {
  if (typeof globalThis !== 'undefined' && (globalThis as any)[KEY]) {
    return (globalThis as any)[KEY]
  }
  const s: CtxStore = {
    _ctx: DEFAULT_CTX,
    _snapshot: { params: DEFAULT_CTX.params, query: DEFAULT_CTX.query, user: DEFAULT_CTX.user, parsed: DEFAULT_CTX.parsed, theme: DEFAULT_CTX.theme, i18n: DEFAULT_CTX.i18n, loaderData: DEFAULT_CTX.loaderData, env: DEFAULT_CTX.env },
    _listeners: new Set<() => void>(),
    _rebuilders: [],
    _alsGetStore: null,
  }
  if (typeof globalThis !== 'undefined') {
    (globalThis as any)[KEY] = s
  }
  return s
}

const store = getStore()

// ── Function rebuilders (reconstruct non-serializable values after setCtx) ──

type Rebuilder = (value: Partial<PageContext>) => Partial<PageContext> | null
export function addCtxRebuilder(fn: Rebuilder) {
  store._rebuilders.push(fn)
}

const subscribe = (cb: () => void) => { store._listeners.add(cb); return () => { store._listeners.delete(cb) } }
const getSnapshot = () => store._snapshot
const getServerSnapshot = getSnapshot

/** @internal Injected by tsx-instance.ts for async-safe context isolation */
export function __registerAls(getStore: () => PageContext | undefined) {
  store._alsGetStore = getStore
}

function setCtx(value: Partial<PageContext>) {
  if (typeof window !== 'undefined') {
    for (const r of store._rebuilders) {
      const rebuilt = r(value)
      if (rebuilt) Object.assign(value, rebuilt)
    }
  }
  store._ctx = { ...store._ctx, ...value }
  store._snapshot = { params: store._ctx.params, query: store._ctx.query, user: store._ctx.user, parsed: store._ctx.parsed, theme: store._ctx.theme, i18n: store._ctx.i18n, loaderData: store._ctx.loaderData, env: store._ctx.env }
  if (typeof window !== 'undefined') {
    ;(window as any).__WEIFUWU_CTX = { ...(window as any).__WEIFUWU_CTX, ...value }
  }
  store._listeners.forEach(fn => fn())
}

function useCtx(): PageContext {
  if (typeof window !== 'undefined') {
    return useSyncExternalStore(subscribe, getSnapshot)
  }
  const alsStore = store._alsGetStore?.()
  return alsStore ?? store._ctx
}

export function useLoaderData<T = Record<string, unknown>>(): T {
  const ctx = useCtx()
  return ctx.loaderData as T
}

export const TsxContext = createContext<PageContext>(DEFAULT_CTX)

export { useCtx, setCtx }
