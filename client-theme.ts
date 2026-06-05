import { useEffect } from 'react'
import { addInterceptor } from './client-pref.ts'
import { setCtx, useCtx } from './tsx-context.ts'
import { navigate } from './client-router.ts'

function resolveTheme(theme: string): string {
  if (theme === 'system') {
    if (typeof window === 'undefined') return 'light'
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

let _mqListener: MediaQueryList | null = null

function applyTheme(theme: string) {
  if (typeof document === 'undefined') return
  const resolved = resolveTheme(theme)
  document.documentElement.dataset.theme = resolved

  if (theme === 'system') {
    if (!_mqListener) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      mq.addEventListener('change', (e) => {
        if ((window as any).__WEIFUWU_CTX?.prefs?.theme === 'system') {
          document.documentElement.dataset.theme = e.matches ? 'dark' : 'light'
        }
      })
      _mqListener = mq
    }
  }
}

addInterceptor(async (url) => {
  const m = url.pathname.match(/^\/__theme\/(\w+)$/)
  if (!m) return false
  try {
    const res = await fetch(url.pathname, {
      headers: { accept: 'application/json' },
    })
    const data = await res.json()
    const ctx: any = { ...((window as any).__WEIFUWU_CTX || {}), params: {}, query: {} }
    ctx.prefs = { ...ctx.prefs, theme: data.theme }
    ;(window as any).__WEIFUWU_CTX = ctx
    applyTheme(data.theme)
    setCtx(ctx)
  } catch {
    location.href = url.href
  }
  return true
})

export function useTheme() {
  const ctx = useCtx()
  const theme = ctx.prefs.theme ?? 'system'
  useEffect(() => { applyTheme(theme) }, [theme])
  return {
    theme,
    resolvedTheme: resolveTheme(theme),
    setTheme: (t: string) => navigate('/__theme/' + t),
  }
}

export { applyTheme }
