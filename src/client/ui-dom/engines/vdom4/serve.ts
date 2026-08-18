/**
 * vdom4 serve — uiSsr（服务端落地）/ uiServe（客户端收养 + 导航）
 *
 * 类比后端 serve：同一 UIRouter 实例——服务端渲染 HTML + 数据种子；
 * 客户端收养 SSR 首帧（路径 id 精确吸收——零重建）——导航走同一路由匹配。
 *
 * 服务端：uiSsr(router, { url, data? }) → { html, data }
 *   match(url) → 页面 vnode → renderToCommands（build + diff → 命令 + 种子）
 *   → commandsToHtml（data-v4-id 标记——客户端吸收锚点）
 *
 * 客户端：uiServe(router, { root, hydrate? }) → { ready, navigate, unmount }
 *   初始：match(location.pathname) → createRoot（beginAbsorb 吸收 SSR HTML）
 *   导航：navigate(path) → 新页面 vnode → 根 vnode 替换 + 立即渲染（root 级——
 *   vdom4 渲染机制——旧页原子切换——无 schedule）
 */

import type { VNode, Ctx } from './types.ts'
import { UIRouter, type PageHandler } from './router.ts'
import { createRoot, Engine } from './root.ts'
import { renderToCommands, commandsToHtml, makeSsrCtx } from './ssr.ts'
import { h } from './jsx.ts'

export type { UIRouter, PageHandler } from './router.ts'

/** 服务端渲染（RouteDef 一份定义——服务端落地——匹配 → 页面 → SSR 管线） */
export async function uiSsr(
  router: UIRouter,
  options: { url: string; data?: Pick<Ctx['data'], 'get' | 'has'> },
): Promise<{ html: string; data: Record<string, unknown> }> {
  const resolved = router.resolve(options.url)
  if (!resolved) return { html: '', data: {} }
  const page = resolved.handler(resolved.params)
  if (page == null) return { html: '', data: {} }
  // 页面根（SPA 容器约定：#root 内渲染——页面 vnode 直接作为根）
  const rootVNode = Array.isArray(page) ? h('div', {}, page) : (page as VNode)
  const { commands, seed } = await renderToCommands(rootVNode)
  return { html: commandsToHtml(commands), data: seed }
}

/** 客户端收养 + 导航（hydrate = SSR 首帧零重建——路径 id 精确吸收） */
export function uiServe(
  router: UIRouter,
  root: HTMLElement,
  options?: { hydrate?: boolean; initialPath?: string },
): { ready: Promise<void>; navigate(path: string): void; engine: Engine; unmount(): void } {
  // 当前页面 vnode（导航替换——根级渲染）
  let currentPage: VNode | null = null
  let engine: Engine | null = null
  let readyPromise: Promise<void> = Promise.resolve()

  const path = options?.initialPath ?? (typeof location !== 'undefined' ? location.pathname : '/')

  const mountPage = (p: string): void => {
    const resolved = router.resolve(p)
    if (!resolved) {
      root.innerHTML = ''
      currentPage = null
      return
    }
    const page = resolved.handler(resolved.params)
    if (page == null) return
    currentPage = Array.isArray(page) ? h('div', {}, page) : (page as VNode)
    if (!engine) {
      // 首帧：createRoot（hydrate = SSR 内容吸收——beginAbsorb 由 Engine.apply 首帧检测）
      const handle = createRoot(currentPage, root, {})
      engine = handle.engine
      readyPromise = handle.ready
    } else {
      // 导航：根 vnode 替换 + 立即渲染（root 级——原子切换——旧页保持到新树就绪）
      engine.setRootVNode(currentPage)
      engine.render()
    }
  }

  mountPage(path)

  // 同站链接点击拦截 → SPA 导航（SSR/SPA 导航体验统一）
  const onClick = (e: Event) => {
    const me = e as MouseEvent
    if (me.button !== 0 || me.metaKey || me.ctrlKey || me.shiftKey || me.altKey) return
    const a = (e.target as HTMLElement)?.closest?.('a')
    if (!a || !a.href) return
    if (a.target && a.target !== '_self') return
    if (a.hasAttribute('download') || a.getAttribute('rel')?.includes('external')) return
    let url: URL
    try { url = new URL(a.href) } catch { return }
    if (url.origin !== (typeof location !== 'undefined' ? location.origin : '')) return
    if (url.hash && url.pathname === (typeof location !== 'undefined' ? location.pathname : '')) return
    e.preventDefault()
    if (typeof history !== 'undefined') history.pushState(null, '', url.pathname + url.search)
    mountPage(url.pathname + url.search)
  }
  let offClick: (() => void) | null = null
  if (typeof document !== 'undefined') {
    document.addEventListener('click', onClick)
    offClick = () => document.removeEventListener('click', onClick)
  }
  const onPop = () => { if (typeof location !== 'undefined') mountPage(location.pathname + location.search) }
  let offPop: (() => void) | null = null
  if (typeof window !== 'undefined') {
    window.addEventListener('popstate', onPop)
    offPop = () => window.removeEventListener('popstate', onPop)
  }

  return {
    ready: readyPromise,
    navigate(path: string): void {
      if (typeof history !== 'undefined') history.pushState(null, '', path)
      mountPage(path)
    },
    engine: engine!,
    unmount(): void {
      offClick?.()
      offPop?.()
      engine?.unmount()
      root.innerHTML = ''
    },
  }
}
