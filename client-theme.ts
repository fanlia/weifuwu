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
        if ((window as any).__WEIFUWU_CTX?.theme?.value === 'system') {
          document.documentElement.dataset.theme = e.matches ? 'dark' : 'light'
        }
      })
      _mqListener = mq
    }
  }
}

addInterceptor(async (url) => {
  const m = url.pathname.match(/^\/__theme\/([\w-]+)$/)
  if (!m) return false
  try {
    const res = await fetch(url.pathname, {
      headers: { accept: 'application/json' },
    })
    const data = await res.json()
    ;(window as any).__WEIFUWU_CTX = { ...(window as any).__WEIFUWU_CTX, theme: { value: data.theme } }
    setCtx({ theme: { value: data.theme } } as any)
    applyTheme(data.theme)
  } catch {
    location.href = url.href
  }
  return true
})

export function useTheme() {
  const ctx = useCtx()
  const theme = ctx.theme?.value ?? 'system'
  useEffect(() => { applyTheme(theme) }, [theme])
  return {
    theme,
    resolvedTheme: resolveTheme(theme),
    setTheme: (t: string) => navigate('/__theme/' + t),
  }
}

export { applyTheme }
