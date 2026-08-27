/**
 * vdom core/ssr — index（SSR 中转站——自身不处理细节逻辑）
 *
 * 职责：服务端渲染入口（uiSsr——同一 UIRouter 同一 handler）——
 * 具体功能交由独立文件：
 * - html.ts（commandToHtml 流式序列化 + htmlDocument 文档包装）
 * - absorb.ts（客户端结构吸收状态机——首帧复用 SSR DOM）
 *
 * 与客户端同构：同一命令流——客户端 apply DOM / 服务端吐 HTML——
 * 首帧吸收（结构对齐）——接管原子性（mismatch → 回退清空重建）。
 */
export { escapeHtml, attrsToHtml, htmlDocument, commandToHtml, VOID_ELEMENTS, kebab } from './html.ts'
export { AbsorbState } from './absorb.ts'

import { commandToHtml, htmlDocument } from './html.ts'
import { renderToStream } from '../build.ts'
import { UIRouter, frontRequest } from '../router.ts'
import { createComponentRegistry } from '../node/component.ts'
import { createDataPipe } from '../../context/data.ts'
import { installEffectGuard } from '../../dev/effect-guard.ts'
import { encodeCommands, createFnTable, type RenderCtx } from '../serve.ts'
import type { Command } from '../command/index.ts'
import type { VNode } from '../vnode.ts'
import type { UIContext } from '../../context/UIContext.ts'

/** 服务端渲染选项 */
export interface SsrOptions {
  title?: string
  /** __DATA__ 种子（ctx.data 预取结果——序列化进文档） */
  data?: Record<string, unknown>
}

/** 字节流 → 命令流（NDJSON 解码——服务端消费 uiSsr 的编码流） */
function ndjsonDecode(fnTable: Map<number, unknown>): TransformStream<Uint8Array, Command> {
  const decoder = new TextDecoder()
  let buf = ''
  const revive = (key: string, value: unknown): unknown => {
    if (typeof value === 'string' && value.startsWith('$fn')) {
      const idx = Number(value.slice(3))
      return fnTable.get(idx) ?? undefined
    }
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

/** 服务端渲染（SSR——同一 router 同一 handler——命令流 → HTML 文档）
 *  **无 hydration**（客户端接管结构吸收——SSR = 首屏/SEO + 吸收种子）；
 *  函数面（事件）经空函数表编码为 $fn 标记——解码 undefined——
 *  commandToHtml 的 setProp no-op——HTML 无运行时面 */
export async function uiSsr(router: UIRouter, url: string, opts: SsrOptions = {}): Promise<string> {
  // **SSR 副作用守卫（恒装——node 服务器进程保护）**：SSR 渲染期间
  // renderFn 创建定时器 → warn（DemoProgress 实证——服务器 unhandled
  // rejection 污染）——幂等
  // **SSR 端 noop 守卫**：renderFn 窗口内创建 timer → warn + 不执行（ctx
  // 无 render——fire 即 unhandledRejection → node 默认 throw → 服务器进程
  // 退出——confirm 实证）——timer 语义在 SSR 不成立——阻断崩溃链
  installEffectGuard(globalThis, true)
  const fnTable = createFnTable()
  const req = frontRequest(url)
  const ctx = {
    /** 服务端渲染入口（vnode → Response 命令流——空函数表） */
    stream: (vnode: VNode, init?: ResponseInit): Response => {
      const stream = renderToStream(vnode, ctx as UIContext, createComponentRegistry())
      return new Response(encodeCommands(stream, fnTable), { status: init?.status ?? 200 })
    },
    /** 数据管道（SSR 真 fetch——组件工厂取数） */
    data: createDataPipe(),
    // **SSR ctx 完整面（2026-08——组件无差别调用契约）**：组件 mount 期
    // 回调（fetch 完成/定时器）可能调用 ctx.render——SSR 无重渲染概念——
    // noop（不炸——unhandledRejection → node 崩溃——FilePreview 实证）——
    // onUnmount 收集 + afterRender noop（组件持有即可用）
    render: async () => {},
    onUnmount: () => {},
    afterRender: () => {},
  } as unknown as RenderCtx
  const res = await router.resolve(req, ctx as UIContext)
  if (!res.body) return htmlDocument('', opts)
  const html = await streamToString(
    res.body.pipeThrough(ndjsonDecode(fnTable)).pipeThrough(commandToHtml()),
  )
  return htmlDocument(html, opts)
}

async function streamToString(stream: ReadableStream<string>): Promise<string> {
  const reader = stream.getReader()
  let out = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    out += value
  }
  return out
}
