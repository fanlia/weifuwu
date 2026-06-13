import { useSyncExternalStore, createContext } from 'react'

export interface PageContext {
  params: Record<string, string>
  query: Record<string, string>
  user: { id?: string }
  parsed: Record<string, unknown>
  theme?: string
  i18n?: { locale: string; t: (key: string, params?: Record<string, string>, fallback?: string) => string }
  loaderData: Record<string, unknown>
  env: Record<string, string>
}

const DEFAULT_CTX: PageContext = { params: {}, query: {}, parsed: {}, loaderData: {}, env: {}, user: {} }

interface CtxStore {
  _ctx: PageContext
  _snapshot: PageContext
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
    _snapshot: { params: DEFAULT_CTX.params, query: DEFAULT_CTX.query, user: DEFAULT_CTX.user, parsed: DEFAULT_CTX.parsed, theme: DEFAULT_CTX.theme, i18n: DEFAULT_CTX.i18n, loaderData: DEFAULT_CTX.loaderData, env: DEFAULT_CTX.env },
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
  store._snapshot = { params: store._ctx.params, query: store._ctx.query, user: store._ctx.user, parsed: store._ctx.parsed, theme: store._ctx.theme, i18n: store._ctx.i18n, loaderData: store._ctx.loaderData, env: store._ctx.env }
  store._listeners.forEach(fn => fn())
}

function useCtx(): PageContext {
  if (typeof window !== 'undefined') {
    const snapshot = useSyncExternalStore(subscribe, getSnapshot)
    return { ...snapshot, ...(window as any).__WEIFUWU_CTX }
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
