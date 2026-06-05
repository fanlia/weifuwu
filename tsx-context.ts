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
}>({ params: {}, query: {} })

export function useCtx() {
  if (typeof window !== 'undefined') {
    const wc = (window as any).__WEIFUWU_CTX
    if (wc) {
      const messages = (window as any).__LOCALE_DATA__
      if (messages && !wc.t) {
        wc.t = (key: string, params?: Record<string, string>) => {
          let msg = messages[key] ?? key
          if (params) for (const [k, v] of Object.entries(params)) msg = msg.replace(`{${k}}`, v)
          return msg
        }
      }
      return wc
    }
  }
  return useContext(TsxContext)
}
