/**
 * weifuwu/ui-dom — 浏览器环境抽象（ctx.browser 的客户端实现）
 *
 * 组件不直接引用 window/document——统一经 ctx.browser：
 * ① SSR 安全（createSsrContext 注入安全默认）② 测试可 mock
 * ③ 复制等重复模式单点实现。
 * 内部对 window/document 做 typeof 防御（SSR/无 DOM 环境不崩）。
 */

import type { BrowserEnv } from './types.ts'

export function createClientBrowser(): BrowserEnv {
  // 惰性读取：模块级实例在 import 时创建（测试 setupJsdom 可能未跑）——
  // 每次方法调用时检查环境，避免创建时捕获 null 导致后续全部失效
  return {
    activeElement: () => (typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null),
    byId: (id) => (typeof document !== 'undefined' ? document.getElementById(id) : null),
    query: (sel) => (typeof document !== 'undefined' ? document.querySelector(sel) : null),
    queryAll: (sel) => (typeof document !== 'undefined' ? document.querySelectorAll(sel) : null),
    createElement: (tag) => (typeof document !== 'undefined' ? document.createElement(tag) as HTMLElementTagNameMap[typeof tag] : null),
    createElementNS: (ns, tag) => (typeof document !== 'undefined' ? document.createElementNS(ns, tag) : null),
    createDocumentFragment: () => (typeof document !== 'undefined' ? document.createDocumentFragment() : null),
    createComment: (text) => (typeof document !== 'undefined' ? document.createComment(text) : null),
    createTextNode: (text) => (typeof document !== 'undefined' ? document.createTextNode(text) : null),
    addEventListener: (type, fn, options) => { if (typeof window !== 'undefined') window.addEventListener(type, fn, options) },
    removeEventListener: (type, fn, options) => { if (typeof window !== 'undefined') window.removeEventListener(type, fn, options) },
    scrollTo: (y) => { if (typeof window !== 'undefined') window.scrollTo(0, y) },
    matchMedia: (query) => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(query) : null),
    visualViewport: () => {
      const w = typeof window !== 'undefined' ? window : null
      return w?.visualViewport ?? null
    },
    scrollingElement: () => (typeof document !== 'undefined' ? (document.scrollingElement as Element | null) : null),
    bodyElement: () => (typeof document !== 'undefined' ? document.body : null),
    bodyAppend: (el) => { if (typeof document !== 'undefined') document.body.appendChild(el) },
    bodyRemove: (el) => { if (typeof document !== 'undefined' && el.parentNode) document.body.removeChild(el) },
    clearBody: () => { if (typeof document !== 'undefined') document.body.innerHTML = '' },
    event: (type, init) => {
      const w = typeof window !== 'undefined' ? window : null
      const Ctor = init && (init.key || init.code) ? 'KeyboardEvent'
        : init && (init.clientX !== undefined || init.clientY !== undefined || init.pointerId !== undefined) ? 'PointerEvent'
        : 'Event'
      try { return new (w as any)[Ctor](type, init) } catch { return new (w as any).Event(type, init) }
    },
    dispatchEvent: (target, evt) => (typeof target !== 'undefined' ? target.dispatchEvent(evt) : false),
    navigate: (url) => {
      if (typeof window === 'undefined') return
      window.history.pushState(null, '', url)
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    },
    copyText: async (text) => {
      const w = typeof window !== 'undefined' ? window : null
      if (w?.navigator?.clipboard?.writeText) {
        try {
          await w.navigator.clipboard.writeText(text)
          return true
        } catch { /* fallthrough */ }
      }
      // 降级：execCommand（非 secure context / clipboard 不可用）
      try {
        if (typeof document === 'undefined') return false
        const ta = document.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        const ok = document.execCommand('copy')
        document.body.removeChild(ta)
        return ok
      } catch {
        return false
      }
    },
    execCommand: (cmd, value) => (typeof document !== 'undefined' ? document.execCommand(cmd, false, value) : false),
    queryCommandState: (cmd) => (typeof document !== 'undefined' ? document.queryCommandState(cmd) : false),
    queryCommandValue: (cmd) => (typeof document !== 'undefined' ? document.queryCommandValue(cmd) : ''),
    selectionText: () => (typeof window !== 'undefined' ? window.getSelection?.()?.toString() ?? null : null),
    getSelection: () => (typeof window !== 'undefined' ? window.getSelection() : null),
    viewportHeight: () => (typeof window !== 'undefined' ? window.innerHeight : 0),
    viewportWidth: () => (typeof window !== 'undefined' ? window.innerWidth : 0),
    pathname: () => (typeof window !== 'undefined' ? window.location.pathname : ''),
    createTreeWalker: (root, whatToShow) => (typeof document !== 'undefined' ? document.createTreeWalker(root, whatToShow ?? NodeFilter.SHOW_ALL) : null),
    scrollTop: () => {
      const d = typeof document !== 'undefined' ? document : null
      const w = typeof window !== 'undefined' ? window : null
      return d?.scrollingElement?.scrollTop ?? w?.scrollY ?? 0
    },
    hash: () => (typeof window !== 'undefined' ? window.location?.hash ?? '' : ''),
    setHash: (h) => { if (typeof window !== 'undefined') window.location.hash = h },
    timeout: (fn, ms) => (typeof window !== 'undefined' ? window.setTimeout(fn, ms) : 0),
    rootElement: () => (typeof document !== 'undefined' ? document.documentElement : null),
    storageGet: (key) => {
      try { return typeof window !== 'undefined' ? window.localStorage?.getItem(key) ?? null : null } catch { return null }
    },
    storageSet: (key, value) => {
      try { if (typeof window !== 'undefined') window.localStorage?.setItem(key, value) } catch { /* 隐私模式忽略 */ }
    },
  }
}
