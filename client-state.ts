import { useSyncExternalStore, useCallback, useEffect, useRef, useState } from 'react'

// ── createStore ─────────────────────────────────────────────────────────────

type SetPartial<T> = Partial<T> | ((prev: T) => Partial<T>)

export interface StoreApi<T> {
  (): T
  <S>(selector: (state: T) => S): S
  getState: () => T
  setState: (partial: SetPartial<T>) => void
  subscribe: (listener: () => void) => () => void
}

export function createStore<T extends Record<string, unknown>>(initial: T): StoreApi<T> {
  let state: T = { ...initial }
  const listeners = new Set<() => void>()

  const getState = () => state
  const setState = (partial: SetPartial<T>) => {
    const next =
      typeof partial === 'function' ? (partial as (prev: T) => Partial<T>)(state) : partial
    state = { ...state, ...next }
    listeners.forEach((fn) => fn())
  }
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }

  const useStore = (<S>(selector?: (state: T) => S): T | S =>
    useSyncExternalStore(subscribe, () => (selector ? selector(state) : state))) as StoreApi<T>

  useStore.getState = getState
  useStore.setState = setState
  useStore.subscribe = subscribe

  return useStore
}

// ── useFetch ────────────────────────────────────────────────────────────────

interface UseFetchResult<T> {
  data: T | undefined
  error: Error | undefined
  loading: boolean
  mutate: (data?: T) => Promise<void>
}

interface UseFetchOptions<T> {
  fallback?: T
  ttl?: number
}

const dataCache = new Map<string, { data: unknown; error: unknown; timestamp: number }>()
const inflight = new Map<string, Promise<unknown>>()
const CACHE_TTL = 60_000

export function useFetch<T = unknown>(
  url: string | null,
  options?: UseFetchOptions<T>,
): UseFetchResult<T> {
  const ttl = options?.ttl ?? CACHE_TTL
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({
    data: options?.fallback,
    loading: !options?.fallback && !!url,
  })
  const urlRef = useRef(url)
  urlRef.current = url

  useEffect(() => {
    if (!url) {
      setState({ data: undefined, loading: false })
      return
    }
    if (typeof window === 'undefined') return

    const u: string = url
    let cancelled = false

    const cached = dataCache.get(u)
    if (cached && Date.now() - cached.timestamp < ttl) {
      if (!cancelled)
        setState({
          data: cached.data as T,
          error: cached.error as Error | undefined,
          loading: false,
        })
      return
    }

    async function doFetch() {
      if (!inflight.has(u)) {
        inflight.set(
          u,
          fetch(u).then((r) => {
            if (!r.ok) throw new Error(r.statusText || `HTTP ${r.status}`)
            return r.json()
          }),
        )
      }
      const promise = inflight.get(u)!
      try {
        const data = await promise
        dataCache.set(u, { data, error: null, timestamp: Date.now() })
        if (!cancelled) setState({ data: data as T, loading: false })
      } catch (err) {
        dataCache.set(u, { data: null, error: err, timestamp: Date.now() })
        if (!cancelled) setState({ error: err as Error, loading: false })
      }
    }

    doFetch()
    return () => {
      cancelled = true
    }
  }, [url, ttl])

  const mutate = useCallback(async (data?: T) => {
    const u = urlRef.current
    if (!u) return
    const uStr: string = u
    if (data !== undefined) {
      dataCache.set(uStr, { data, error: null, timestamp: Date.now() })
      setState({ data, loading: false, error: undefined })
      return
    }
    inflight.delete(uStr)
    try {
      const res = await fetch(uStr)
      if (!res.ok) throw new Error(res.statusText || `HTTP ${res.status}`)
      const newData = await res.json()
      dataCache.set(uStr, { data: newData, error: null, timestamp: Date.now() })
      setState({ data: newData as T, loading: false, error: undefined })
    } catch (err) {
      setState({ error: err as Error, loading: false })
    }
  }, [])

  return { data: state.data, error: state.error, loading: state.loading, mutate }
}

// ── useQueryState ───────────────────────────────────────────────────────────

function notifyQueryListeners() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function useQueryState(
  key: string,
  defaultValue = '',
): [string, (val: string | ((prev: string) => string)) => void] {
  function getSnapshot(): string {
    if (typeof window === 'undefined') return defaultValue
    const params = new URLSearchParams(window.location.search)
    return params.get(key) ?? defaultValue
  }

  const value = useSyncExternalStore(
    (cb) => {
      if (typeof window === 'undefined') return () => {}
      window.addEventListener('popstate', cb)
      return () => window.removeEventListener('popstate', cb)
    },
    getSnapshot,
    () => defaultValue,
  )

  const setValue = useCallback(
    (val: string | ((prev: string) => string)) => {
      if (typeof window === 'undefined') return
      const resolved =
        typeof val === 'function' ? (val as (prev: string) => string)(getSnapshot()) : val
      const url = new URL(window.location.href)
      if (resolved === defaultValue || resolved === '') {
        url.searchParams.delete(key)
      } else {
        url.searchParams.set(key, resolved)
      }
      window.history.replaceState(null, '', url.toString())
      notifyQueryListeners()
    },
    [key, defaultValue],
  )

  return [value, setValue]
}
