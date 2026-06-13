import { addInterceptor } from './client-pref.ts'
import { useCtx, setCtx } from './tsx-context.ts'
import { navigate } from './client-router.ts'

function buildT(): (key: string, params?: Record<string, string>, fallback?: string) => string {
  const messages = (globalThis as any).__LOCALE_DATA__
    || (typeof window !== 'undefined' ? (window as any).__LOCALE_DATA__ : null)
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
  const m = url.pathname.match(/^\/__lang\/([\w-]+)$/)
  if (!m) return false
  // Full page reload — SSR 重新渲染页面，避免客户端 context 同步问题
  location.href = url.href
  return true
})

export function useLocale() {
  const ctx = useCtx()
  return {
    locale: ctx.i18n?.locale,
    setLocale: (locale: string) => navigate('/__lang/' + locale),
    t: buildT(),
  }
}
