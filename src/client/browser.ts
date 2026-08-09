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
  const d = typeof document !== 'undefined' ? document : null
  const w = typeof window !== 'undefined' ? window : null

  return {
    activeElement: () => (d?.activeElement as HTMLElement | null) ?? null,
    byId: (id) => d?.getElementById(id) ?? null,
    query: (sel) => d?.querySelector(sel) ?? null,
    createElement: (tag) => (d?.createElement(tag) as any) ?? null,
    bodyAppend: (el) => { d?.body.appendChild(el) },
    bodyRemove: (el) => { if (el.parentNode) d?.body.removeChild(el) },
    copyText: async (text) => {
      if (w?.navigator?.clipboard?.writeText) {
        try {
          await w.navigator.clipboard.writeText(text)
          return true
        } catch { /* fallthrough */ }
      }
      // 降级：execCommand（非 secure context / clipboard 不可用）
      try {
        if (!d) return false
        const ta = d.createElement('textarea')
        ta.value = text
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        d.body.appendChild(ta)
        ta.select()
        const ok = d.execCommand('copy')
        d.body.removeChild(ta)
        return ok
      } catch {
        return false
      }
    },
    execCommand: (cmd, value) => d?.execCommand(cmd, false, value) ?? false,
    selectionText: () => w?.getSelection?.()?.toString() ?? null,
    viewportHeight: () => w?.innerHeight ?? 0,
    scrollTop: () => d?.scrollingElement?.scrollTop ?? w?.scrollY ?? 0,
    hash: () => w?.location?.hash ?? '',
    setHash: (h) => { if (w) w.location.hash = h },
    timeout: (fn, ms) => w?.setTimeout(fn, ms) ?? 0,
    rootElement: () => d?.documentElement ?? null,
  }
}
