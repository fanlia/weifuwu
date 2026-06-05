import { addInterceptor } from './client-pref.ts'
import { useCtx, setCtx } from './tsx-context.ts'
import { navigate } from './client-router.ts'

function buildT(): (key: string, params?: Record<string, string>, fallback?: string) => string {
  const messages = typeof window !== 'undefined'
    ? (window as any).__LOCALE_DATA__
    : (globalThis as any).__LOCALE_DATA__
  if (!messages) return (key: string, _p?: Record<string, string>, fb?: string) => fb ?? key
  return (key: string, params?: Record<string, string>, fallback?: string) => {
    const msg = key.split('.').reduce((o: any, k: string) => o?.[k], messages as any)
    if (msg === undefined || msg === null) return fallback ?? key
    if (!params) return String(msg)
    let result = String(msg)
    for (const [k, v] of Object.entries(params)) result = result.replace(`{${k}}`, v)
    return result
  }
}

addInterceptor(async (url) => {
  const m = url.pathname.match(/^\/__lang\/(\w+)$/)
  if (!m) return false
  try {
    const res = await fetch(url.pathname, {
      headers: { accept: 'application/json' },
    })
    const data = await res.json()
    const ctx: any = { ...((window as any).__WEIFUWU_CTX || {}), params: {}, query: {} }
    ctx.prefs = { ...ctx.prefs, locale: data.locale }
    if (data.messages) (window as any).__LOCALE_DATA__ = data.messages
    ;(window as any).__WEIFUWU_CTX = ctx
    setCtx(ctx)
  } catch {
    location.href = url.href
  }
  return true
})

export function useLocale() {
  const ctx = useCtx()
  return {
    locale: ctx.prefs.locale,
    setLocale: (locale: string) => navigate('/__lang/' + locale),
    t: buildT(),
  }
}
