import { createElement, useCallback } from 'react'

export async function navigate(href: string): Promise<void> {
  if (typeof document === 'undefined') return

  const url = new URL(href, location.origin)
  if (url.origin !== location.origin) {
    location.href = href
    return
  }

  const html = await fetch(url.pathname + url.search, {
    headers: { accept: 'text/html' },
  }).then(r => r.text())

  const doc = new DOMParser().parseFromString(html, 'text/html')

  const rootEl = doc.getElementById('__weifuwu_root')
  if (!rootEl) {
    location.href = href
    return
  }
  const newHtml = rootEl.innerHTML

  const propsMatch = html.match(/window\.__WEIFUWU_PROPS=(.+?)<\/script>/)
  if (!propsMatch) {
    location.href = href
    return
  }

  const bundleMatch = html.match(/src="(\/__wfw\/client\/[^"]+\.js)"/)
  const bundleUrl = bundleMatch ? bundleMatch[1] : null

  const currentRoot = document.getElementById('__weifuwu_root')
  if (!currentRoot) {
    location.href = href
    return
  }

  ;(window as any).__WEIFUWU_ROOT?.unmount()
  currentRoot.innerHTML = newHtml
  ;(window as any).__WEIFUWU_PROPS = JSON.parse(propsMatch[1])
  history.pushState(null, '', url.pathname + url.search)

  if (bundleUrl) {
    const cacheBust = bundleUrl.includes('?') ? '&_t=' : '?_t='
    try {
      await import(/* @vite-ignore */ `${bundleUrl}${cacheBust}${Date.now()}`)
    } catch (e) {
      console.error('[weifuwu/router] hydration failed:', e)
    }
  }
}

export function useNavigate(): (href: string) => Promise<void> {
  return useCallback((href: string) => navigate(href), [])
}

interface LinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string
  children: React.ReactNode
}

export function Link({ href, children, onClick, ...props }: LinkProps) {
  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigate(href)
    onClick?.(e)
  }, [href, onClick])

  return createElement('a', { href, onClick: handleClick, ...props }, children)
}
