/* eslint-disable @typescript-eslint/no-explicit-any */
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
  return () => {
    _listeners = _listeners.filter((l) => l !== fn)
  }
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

  if (await runInterceptors(url)) return

  const scrollPos = [window.scrollX, window.scrollY]

  setNavigating(true)

  try {
    const html = await fetch(url.pathname + url.search, {
      headers: { accept: 'text/html' },
    }).then((r) => r.text())

    const doc = new DOMParser().parseFromString(html, 'text/html')

    const rootEl = doc.getElementById('__weifuwu_root')
    if (!rootEl) {
      location.href = href
      return
    }
    const newHtml = rootEl.innerHTML

    const bundleMatch = html.match(/src="(\/__ssr\/[^"]+\.js)"/)
    const bundleUrl = bundleMatch ? bundleMatch[1] : null

    const ctxMatch = html.match(/window\.__WEIFUWU_CTX=(.+?)<\/script>/)
    if (ctxMatch) {
      try {
        const ctx = JSON.parse(ctxMatch[1])
        ;(window as any).__WEIFUWU_CTX = ctx
        setCtx(ctx)
      } catch {}
    }

    const currentRoot = document.getElementById('__weifuwu_root')
    if (!currentRoot) {
      location.href = href
      return
    }

    history.pushState(null, '', url.pathname + url.search)
    currentRoot.innerHTML = newHtml

    if (bundleUrl) {
      try {
        await import(/* @vite-ignore */ `${bundleUrl}`)
      } catch (e) {
        console.error('[weifuwu/router] hydration failed:', e)
        location.href = href
      }
    }

    window.scrollTo(scrollPos[0], scrollPos[1])
  } finally {
    setNavigating(false)
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
        if (a.getAttribute('href') === href) {
          el = a
          break
        }
      }
    }
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) prefetchPage(href)
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [href, prefetch])

  const handleMouseEnter = useCallback(() => {
    if (prefetch) prefetchPage(href)
  }, [href, prefetch])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
      e.preventDefault()
      doNavigate(href)
      onClick?.(e)
    },
    [href, onClick, doNavigate],
  )

  return createElement(
    'a',
    {
      href,
      onClick: handleClick,
      onMouseEnter: handleMouseEnter,
      ...props,
    },
    children,
  )
}

async function prefetchPage(href: string) {
  const cached = prefetchCache.get(href)
  if (cached && Date.now() - cached.fetched < PREFETCH_TTL) return
  try {
    const html = await fetch(href, { headers: { accept: 'text/html' } }).then((r) => r.text())
    prefetchCache.set(href, { html, fetched: Date.now() })
  } catch {}
}
