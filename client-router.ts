import { createElement, useCallback, useState, useEffect } from 'react'
import { runInterceptors } from './client-pref.ts'

export { addInterceptor } from './client-pref.ts'

import { setCtx } from './tsx-context.ts'

let _navigating = false
let _listeners: Array<(v: boolean) => void> = []

export function isNavigating(): boolean {
  return _navigating
}

export function onNavigate(fn: (v: boolean) => void): () => void {
  _listeners.push(fn)
  return () => { _listeners = _listeners.filter(l => l !== fn) }
}

function setNavigating(v: boolean) {
  _navigating = v
  for (const fn of _listeners) fn(v)
}

export async function navigate(href: string): Promise<void> {
  if (typeof document === 'undefined') return

  const url = new URL(href, location.origin)
  if (url.origin !== location.origin) {
    location.href = href
    return
  }

  // Preference interceptors handle /__lang/ and /__theme/ URLs
  if (await runInterceptors(url)) return

  // Save scroll position
  const scrollPos = [window.scrollX, window.scrollY]

  setNavigating(true)

  try {
    const html = await fetch(url.pathname + url.search, {
      headers: { accept: 'text/html' },
    }).then(r => r.text())

    const doc = new DOMParser().parseFromString(html, 'text/html')

    const rootEl = doc.getElementById('__weifuwu_root')
    if (!rootEl) { location.href = href; return }
    const newHtml = rootEl.innerHTML

    const propsMatch = html.match(/window\.__WEIFUWU_PROPS=(.+?)<\/script>/)
    if (!propsMatch) { location.href = href; return }

    const bundleMatch = html.match(/src="(\/__wfw\/client\/[^"]+\.js)"/)
    const bundleUrl = bundleMatch ? bundleMatch[1] : null

    // Update head from new page
    applyHead(html)

    const currentRoot = document.getElementById('__weifuwu_root')
    if (!currentRoot) { location.href = href; return }

    ;(window as any).__WEIFUWU_PROPS = JSON.parse(propsMatch[1])
    history.pushState(null, '', url.pathname + url.search)
    currentRoot.innerHTML = newHtml

    // Update globals from the new page
    const ctxMatch = html.match(/window\.__WEIFUWU_CTX=(.+?)<\/script>/)
    if (ctxMatch) {
      try { (window as any).__WEIFUWU_CTX = JSON.parse(ctxMatch[1]) } catch {}
    }
    const localeMatch = html.match(/window\.__LOCALE_DATA__=(.+?)<\/script>/)
    if (localeMatch) {
      try { (window as any).__LOCALE_DATA__ = JSON.parse(localeMatch[1]) } catch {}
    }

    if (bundleUrl) {
      try {
        await import(/* @vite-ignore */ `${bundleUrl}`)
      } catch (e) {
        console.error('[weifuwu/router] hydration failed:', e)
        // Fallback: full navigation
        location.href = href
      }
    }

    // Restore scroll position
    window.scrollTo(scrollPos[0], scrollPos[1])
  } finally {
    setNavigating(false)
  }
}

function applyHead(html: string) {
  const match = html.match(/<template id="__wfw_head">([\s\S]*?)<\/template>/)
  if (!match) return
  const headHtml = match[1]

  const titleMatch = headHtml.match(/<title>([^<]*)<\/title>/)
  if (titleMatch) document.title = titleMatch[1]

  // Replace all meta tags
  const doc = new DOMParser().parseFromString(headHtml, 'text/html')
  const newMeta = doc.querySelectorAll('meta')
  const existing = document.querySelectorAll('head meta')
  const newNames = new Set(Array.from(newMeta).map(m => m.getAttribute('name') || m.getAttribute('property') || ''))
  for (const el of existing) {
    const key = el.getAttribute('name') || el.getAttribute('property') || ''
    if (!newNames.has(key)) el.remove()
  }
  for (const el of newMeta) {
    const key = el.getAttribute('name') || el.getAttribute('property') || ''
    let existingEl: Element | null = null
    if (key) {
      for (const m of document.head.querySelectorAll('meta')) {
        if (m.getAttribute('name') === key || m.getAttribute('property') === key) {
          existingEl = m; break
        }
      }
    }
    if (existingEl) {
      for (const attr of el.attributes) (existingEl as HTMLElement).setAttribute(attr.name, attr.value)
    } else {
      document.head.appendChild(el.cloneNode() as HTMLElement)
    }
  }

  // Update canonical link
  const newLink = doc.querySelector('link[rel="canonical"]')
  const existingLink = document.querySelector('link[rel="canonical"]')
  if (newLink) {
    if (existingLink) existingLink.setAttribute('href', newLink.getAttribute('href') || '')
    else document.head.appendChild(newLink.cloneNode() as HTMLElement)
  } else if (existingLink) {
    existingLink.remove()
  }
}

export function useNavigate(): (href: string) => Promise<void> {
  return useCallback((href: string) => navigate(href), [])
}

export function useNavigating(): boolean {
  const [v, setV] = useState(false)
  useEffect(() => onNavigate(setV), [])
  return v
}

interface LinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  href: string
  children: React.ReactNode
  prefetch?: boolean
}

const prefetchCache = new Map<string, { html: string; fetched: number }>()
const PREFETCH_TTL = 60_000

export function Link({ href, children, onClick, prefetch, ...props }: LinkProps) {
  const doNavigate = useNavigate()

  useEffect(() => {
    if (!prefetch) return
    let el = document.querySelector(`a[href="${CSS.escape(href)}"]`)
    if (!el) {
      for (const a of document.querySelectorAll('a')) {
        if (a.getAttribute('href') === href) { el = a; break }
      }
    }
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) prefetchPage(href)
    }, { rootMargin: '200px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [href, prefetch])

  const handleMouseEnter = useCallback(() => {
    if (prefetch) prefetchPage(href)
  }, [href, prefetch])

  const handleClick = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    doNavigate(href)
    onClick?.(e)
  }, [href, onClick, doNavigate])

  return createElement('a', {
    href,
    onClick: handleClick,
    onMouseEnter: handleMouseEnter,
    ...props,
  }, children)
}

async function prefetchPage(href: string) {
  const cached = prefetchCache.get(href)
  if (cached && Date.now() - cached.fetched < PREFETCH_TTL) return
  try {
    const html = await fetch(href, { headers: { accept: 'text/html' } }).then(r => r.text())
    prefetchCache.set(href, { html, fetched: Date.now() })
  } catch {}
}
