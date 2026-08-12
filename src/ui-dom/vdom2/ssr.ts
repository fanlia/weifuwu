/**
 * vdom2/ssr — 服务端渲染（基于 x2html——与客户端 renderValue 同一类型遍历）
 *
 * ssrToString：组件 → HTML 片段（工厂 + renderFn 现场执行——SSR 无预构建）
 * serializeData：__DATA__ 种子（hydration 同步命中）
 * ssrPage：完整页面（路由 + 数据 + HTML + 种子）
 */

import type { VNode, VNodeChild, Component } from '../vnode.ts'
import { createVNode } from '../vnode.ts'
import { x2html } from './x2html.ts'
import { type VdomCtx } from './ctx.ts'

/** __DATA__ 序列化（hydration 种子——< 转义防注入） */
export function serializeData(data: Map<string, unknown>): string {
  const json = JSON.stringify(Object.fromEntries(data)).replace(/</g, '\\u003c')
  return `<script>window.__DATA__=${json};</script>`
}

/** SSR ctx：ui shim（hooks no-op）+ ctx.data（预取写入 dataStore） */
export function createSsrContext(serverCtx: Record<string, unknown>, dataStore: Map<string, unknown>): VdomCtx {
  const ctx: VdomCtx = {
    ...serverCtx,
    browser: null as never,
    __registry: null as never,
    ui: {
      _rootVNodeId: null,
      render: () => Promise.resolve(),
      setMounting: () => {},
      endMounting: () => {},
    },
  }
  const dataCache = new Map<string, { value?: unknown; promise?: Promise<unknown> }>()
  ctx.data = {
    async get<T = any>(key: string, fetcher?: () => Promise<T>): Promise<T> {
      const entry = dataCache.get(key)
      if (entry && 'value' in entry) return entry.value as T
      if (entry?.promise) return entry.promise as Promise<T>
      if (!fetcher) return undefined as T
      const promise = Promise.resolve()
        .then(() => fetcher())
        .then((val) => { dataCache.set(key, { value: val }); dataStore.set(key, val); return val })
      dataCache.set(key, { promise })
      return promise
    },
    set(key: string, value: unknown) { dataCache.set(key, { value }); dataStore.set(key, value) },
    has(key: string) { return dataCache.has(key) },
  }
  return ctx
}

/** SSR 渲染组件 → HTML 片段（组件现场执行工厂 + renderFn） */
export async function ssrToString(
  Comp: Component,
  props: Record<string, any>,
  serverCtx: any,
  opts: { data?: Map<string, unknown> } = {},
): Promise<string> {
  const dataStore = opts.data ?? new Map<string, unknown>()
  const ctx = createSsrContext(serverCtx ?? {}, dataStore)
  const vnode = createVNode(Comp, props ?? {})
  return x2html(vnode, ctx)
}

export interface SsrPageResult {
  html: string
  /** __DATA__ 脚本（hydration 种子） */
  dataScript: string
  /** 完整 HTML 页面 */
  page: string
}

/** SSR 完整页面（路由 + 数据 + HTML + 种子） */
export async function ssrPage(
  router: any,
  opts: { url: string; title?: string; lang?: string; rootId?: string; styles?: string[] },
): Promise<SsrPageResult> {
  const dataStore = new Map<string, unknown>()
  const serverCtx: Record<string, unknown> = { params: {}, query: {} }
  const ctx = createSsrContext(serverCtx, dataStore)

  const path = opts.url.split('?')[0].split('#')[0]
  const match = router.match(path)
  ctx.params = match.params
  ctx.query = Object.fromEntries(new URLSearchParams(opts.url.split('?')[1] ?? ''))

  const location = new URL(opts.url.startsWith('http') ? opts.url : `http://localhost${opts.url.startsWith('/') ? opts.url : '/' + opts.url}`)

  const vnode = (await router.execute(location, ctx, path)) as VNodeChild
  const html = await x2html(vnode, ctx)
  const dataScript = serializeData(dataStore)
  const title = match.title ?? opts.title ?? ''
  const rootId = opts.rootId ?? 'root'
  const styleLinks = (opts.styles ?? []).map((s) => `  <link rel="stylesheet" href="${s}">`).join('\n')
  const page = `<!DOCTYPE html>
<html lang="${opts.lang ?? 'zh-CN'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  ${title ? `<title>${title}</title>` : ''}
  ${styleLinks}
</head>
<body>
  <div id="${rootId}">${html}</div>
  ${dataScript}
  <script src="/app.js"></script>
</body>
</html>`

  return { html, dataScript, page }
}
