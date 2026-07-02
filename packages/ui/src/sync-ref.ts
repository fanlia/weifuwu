/**
 * syncRef() — ref + URL 双向绑定
 *
 * 将 ref 与浏览器 URL 同步，实现客户端路由。
 *
 * ```ts
 * const route = syncRef('/')
 * route.value = '/about'     // → URL 更新，视图切换
 * ```
 */
import { ref, effect } from './signal.ts'
import type { Signal } from './signal.ts'

export interface SyncRefOptions {
  /** URL 查询参数名。不传则绑定到 pathname */
  key?: string
  /** 是否使用 replaceState 代替 pushState (默认 false) */
  replace?: boolean
}

interface Browser {
  location: { pathname: string; href: string; search: string }
  history: { pushState: (d: any, t: string, url: string) => void; replaceState: (d: any, t: string, url: string) => void }
  addEventListener: (e: string, fn: () => void) => void
}

function getBrowser(): Browser | null {
  if (typeof window !== 'undefined') return window as unknown as Browser
  return null
}

/**
 * 创建一个与浏览器 URL 双向绑定的 ref。
 */
export function syncRef(initial?: string, options?: SyncRefOptions): Signal<string> {
  const opts = options ?? {}
  const hasKey = opts.key !== undefined
  const browser = getBrowser()

  let init = initial ?? (hasKey ? '' : '/')
  if (browser) {
    init = hasKey
      ? new URLSearchParams(browser.location.search).get(opts.key!) ?? init
      : browser.location.pathname
  }

  const state = ref(init)
  let updating = false

  if (browser) {
    effect(() => {
      if (updating) return
      const val = state.value
      if (hasKey) {
        const url = new URL(browser.location.href)
        url.searchParams.set(opts.key!, val)
        browser.history[opts.replace ? 'replaceState' : 'pushState'](null, '', url.href)
      } else {
        browser.history.pushState(null, '', val)
      }
    })

    browser.addEventListener('popstate', () => {
      updating = true
      state.value = hasKey
        ? new URLSearchParams(browser.location.search).get(opts.key!) ?? initial ?? ''
        : browser.location.pathname
      updating = false
    })
  }

  return state
}
