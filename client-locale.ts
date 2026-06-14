import { addInterceptor } from './client-pref.ts'
import { useCtx, setCtx, addCtxRebuilder } from './tsx-context.ts'
import { navigate } from './client-router.ts'

// ── Function rebuilder — reconstruct t() from messages after setCtx ──

function buildT(
  messages: Record<string, unknown>,
): NonNullable<NonNullable<ReturnType<typeof useCtx>['i18n']>>['t'] {
  if (!messages || Object.keys(messages).length === 0) {
    return (key, _p, fb) => fb ?? key
  }
  return (key: string, params?: Record<string, string>, fallback?: string) => {
    const msg = key.split('.').reduce((o: any, k: string) => o?.[k], messages)
    if (msg === undefined || msg === null) return fallback ?? key
    if (!params) return String(msg)
    let result = String(msg)
    for (const [k, v] of Object.entries(params)) result = result.replace(`{${k}}`, v)
    return result
  }
}

addCtxRebuilder((value) => {
  if (value.i18n?.messages) {
    return { i18n: { ...value.i18n, t: buildT(value.i18n.messages) } }
  }
  return null
})

// ── Interceptor for /__lang/{locale} ──

addInterceptor(async (url) => {
  const m = url.pathname.match(/^\/__lang\/([\w-]+)$/)
  if (!m) return false
  try {
    const res = await fetch(url.pathname, {
      headers: { accept: 'application/json' },
    })
    const data = await res.json()
    setCtx({ i18n: { locale: data.locale, messages: data.messages || {} } as any })
  } catch {
    location.href = url.href
  }
  return true
})

// ── Hook ──

/**
 * React hook to read and change the locale on the client side.
 *
 * Changes are made via SPA navigation to `/__lang/{locale}`, which is
 * intercepted by the client router and applied without a full page reload.
 *
 * ```tsx
 * import { useLocale } from 'weifuwu/react'
 *
 * function LangSwitcher() {
 *   const { locale, setLocale, t } = useLocale()
 *   return (
 *     <>
 *       <p>{t('greeting')}</p>
 *       <button onClick={() => setLocale('zh')}>中文</button>
 *     </>
 *   )
 * }
 * ```
 */
export function useLocale() {
  const ctx = useCtx()
  return {
    locale: ctx.i18n?.locale,
    setLocale: (locale: string) => navigate('/__lang/' + locale),
    t: ctx.i18n?.t ?? ((key: string, _p?: any, fb?: string) => fb ?? key),
  }
}
