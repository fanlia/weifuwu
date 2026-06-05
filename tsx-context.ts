import { createContext, useContext } from 'react'

export const TsxContext = createContext<{
  params: Record<string, string>
  query: Record<string, string>
  user?: unknown
  parsed?: Record<string, unknown>
  prefs?: Record<string, string>
  locale?: string
  theme?: string
  t?: (key: string, params?: Record<string, string>) => string
  env?: Record<string, string>
}>({ params: {}, query: {} })

export function useCtx() {
  const wc = typeof window !== 'undefined'
    ? (window as any).__WEIFUWU_CTX
    : (globalThis as any).__WEIFUWU_CTX
  if (wc) {
    const messages = typeof window !== 'undefined'
      ? (window as any).__LOCALE_DATA__
      : (globalThis as any).__LOCALE_DATA__
    if (messages && typeof wc.t !== 'function') {
      wc.t = (key: string, params?: Record<string, string>) => {
        const msg = key.split('.').reduce((o: any, k: string) => o?.[k], messages as any)
        if (msg === undefined || msg === null) return key
        if (!params) return String(msg)
        let result = String(msg)
        for (const [k, v] of Object.entries(params)) result = result.replace(`{${k}}`, v)
        return result
      }
    }
    return wc
  }
  return useContext(TsxContext)
}
