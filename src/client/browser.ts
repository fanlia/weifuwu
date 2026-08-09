/**
 * weifuwu/client — 浏览器环境抽象（ctx.browser 的客户端实现）
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
    createElement: (tag) => (typeof document !== 'undefined' ? document.createElement(tag) as any : null),
    bodyAppend: (el) => { if (typeof document !== 'undefined') document.body.appendChild(el) },
    bodyRemove: (el) => { if (typeof document !== 'undefined' && el.parentNode) document.body.removeChild(el) },
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
    selectionText: () => (typeof window !== 'undefined' ? window.getSelection?.()?.toString() ?? null : null),
    getSelection: () => (typeof window !== 'undefined' ? window.getSelection() : null),
    viewportHeight: () => (typeof window !== 'undefined' ? window.innerHeight : 0),
    scrollTop: () => {
      const d = typeof document !== 'undefined' ? document : null
      const w = typeof window !== 'undefined' ? window : null
      return d?.scrollingElement?.scrollTop ?? w?.scrollY ?? 0
    },
    hash: () => (typeof window !== 'undefined' ? window.location?.hash ?? '' : ''),
    setHash: (h) => { if (typeof window !== 'undefined') window.location.hash = h },
    timeout: (fn, ms) => (typeof window !== 'undefined' ? window.setTimeout(fn, ms) : 0),
    rootElement: () => (typeof document !== 'undefined' ? document.documentElement : null),
  }
}
