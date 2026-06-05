import { useSyncExternalStore, createContext } from 'react'

export interface PageContext {
  params: Record<string, string>
  query: Record<string, string>
  user: { id?: string }
  parsed: Record<string, unknown>
  prefs: Record<string, string>
  loaderData: Record<string, unknown>
  env: Record<string, string>
}

const DEFAULT_CTX: PageContext = { params: {}, query: {}, parsed: {}, prefs: {}, loaderData: {}, env: {}, user: {} }

interface CtxStore {
  _ctx: PageContext
  _snapshot: Omit<PageContext, 'loaderData'>
  _listeners: Set<() => void>
  _alsGetStore: (() => PageContext | undefined) | null
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
export function __registerAls(getStore: () => PageContext | undefined) {
  store._alsGetStore = getStore
}

function setCtx(value: Partial<PageContext>) {
  store._ctx = { ...store._ctx, ...value }
  store._snapshot = { params: store._ctx.params, query: store._ctx.query, user: store._ctx.user, parsed: store._ctx.parsed, prefs: store._ctx.prefs, env: store._ctx.env }
  store._listeners.forEach(fn => fn())
}

function useCtx(): PageContext {
  const alsStore = store._alsGetStore?.()
  const base = alsStore ?? store._ctx
  const data = typeof window !== 'undefined' ? (window as any).__WEIFUWU_CTX : null
  return { ...base, ...data }
}

export function useLoaderData<T = Record<string, unknown>>(): T {
  const alsStore = store._alsGetStore?.()
  const base = alsStore ?? store._ctx
  const data = typeof window !== 'undefined' ? (window as any).__WEIFUWU_CTX : null
  return ({ ...base, ...data }).loaderData as T
}

export const TsxContext = createContext<PageContext>(DEFAULT_CTX)

export { useCtx, setCtx }
