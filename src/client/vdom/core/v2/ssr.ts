/**
 * vdom v2 — uiSsrV2（SSR 完整——v2 引擎渲染 + v1 两遍/预取/__DATA__ 机制）
 *
 * VDOM-V2-BLUEPRINT 缺口 1/3：
 * - stream = renderV2（v2 引擎——Observable<Command> → ReadableStream 适配）
 * - 两遍渲染（预取遍 + 等待 + 正式遍——v1 机制复用）
 * - prefetch 钩子 + asyncSeed + __DATA__——同 v1 通道
 * - 吸收（客户端消费端——命令流同构——与引擎无关）
 */
import type { VNode } from '../vnode.ts'
import type { Command } from '../command/index.ts'
import type { UIContext } from '../../context/UIContext.ts'
import { UIRouter, frontRequest } from '../router.ts'
import { encodeCommands, createFnTable, type RenderCtx } from '../protocol.ts' // v1 退役——协议层独立
import { renderV2 } from './render.ts'
import { createComponentRegistry } from '../node/component.ts'
import { Observable } from '../../observable/index.ts'
import { asyncDataSeed, asyncInflight } from '../../hooks/env.ts'
const asyncSeed = asyncDataSeed
import { installEffectGuard } from '../../dev/effect-guard.ts'

/** Observable<Command> → ReadableStream<Command>（SSR 编码适配） */
export function observableToStream(obs: Observable<Command>): ReadableStream<Command> {
  return new ReadableStream<Command>({
    start(controller) {
      obs.subscribe({
        next: (c) => controller.enqueue(c),
        error: (e) => controller.error(e),
        complete: () => controller.close(),
      })
    },
  })
}

/** v2 SSR 选项（同 v1） */
export interface SsrV2Options {
  title?: string
  rootId?: string
  data?: Record<string, unknown>
  prefetch?: () => Promise<Record<string, unknown> | void>
}

/** v2 服务端渲染（uiSsr 等价——v2 引擎） */
export async function uiSsrV2(router: UIRouter, url: string, opts: SsrV2Options = {}): Promise<string> {
  installEffectGuard(globalThis, true)
  const prefetchSeed = opts.prefetch ? await opts.prefetch() : undefined
  const fnTable = createFnTable()
  const req = frontRequest(url)
  const ctx = {
    stream: (vnode: VNode, init?: ResponseInit): Response => {
      const stream = observableToStream(renderV2(vnode, ctx as UIContext, createComponentRegistry()))
      return new Response(encodeCommands(stream, fnTable), { status: init?.status ?? 200 })
    },
    render: async () => {},
    onUnmount: () => {},
    afterRender: () => {},
  } as unknown as RenderCtx

  const { commandToHtml, htmlDocument } = await import('../ssr/html.ts')
  // ndjsonDecode（v1 私有——同实现（函数表 decode——$fn 标记））
  const decoder = new TextDecoder()
  const ndjsonDecode = (fnTable: Map<number, unknown>): TransformStream<Uint8Array, Command> => {
    let buf = ''
    const revive = (key: string, value: unknown): unknown => {
      if (typeof value === 'string' && value.startsWith('$fn')) return fnTable.get(Number(value.slice(3))) ?? undefined
      return value
    }
    return new TransformStream<Uint8Array, Command>({
      transform(chunk, controller) {
        buf += decoder.decode(chunk, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          controller.enqueue(JSON.parse(line, revive) as Command)
        }
      },
      flush(controller) {
        if (buf.trim()) controller.enqueue(JSON.parse(buf.trim(), revive) as Command)
      },
    })
  }

  // 两遍渲染（预取遍 + 会合 + 正式遍）
  const res1 = await router.resolve(req, ctx as UIContext)
  if (res1.body) {
    const reader = res1.body.pipeThrough(ndjsonDecode(fnTable)).pipeThrough(commandToHtml()).getReader()
    while (true) {
      const { done } = await reader.read()
      if (done) break
    }
  }
  await Promise.allSettled([...asyncInflight])
  const res = await router.resolve(frontRequest(url), ctx as UIContext)
  if (!res.body) return htmlDocument('', opts as never)
  const reader = res.body.pipeThrough(ndjsonDecode(fnTable)).pipeThrough(commandToHtml()).getReader()
  let html = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    html += value
  }
  const seed = { ...(opts.data ?? {}), ...(prefetchSeed ?? {}), ...asyncSeed() }
  return htmlDocument(html, Object.keys(seed).length > 0 ? { ...opts, data: seed } : opts as never)
}
