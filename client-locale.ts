import { addInterceptor } from './client-pref.ts'
import { setCtx, useCtx } from './tsx-context.ts'
import { navigate } from './client-router.ts'

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
    t: ctx.t,
  }
}
