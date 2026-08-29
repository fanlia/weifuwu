/**
 * vdom core/ssr — index（SSR 中转站——自身不处理细节逻辑）
 *
 * 职责：服务端渲染入口（uiSsr——同一 UIRouter 同一 handler）——
 * **v1 退役（2027-08——VDOM-V2-BLUEPRINT）**：运行路径默认 v2（uiServe/uiSsr/
 * 命令式组件——core/v2/）——本文件保留为**对账基线**（契约测试 v1/v2 命令流
 * 等价断言 + fuzz 对账器——v1 引擎不退役则无法对照）——新代码禁止引用。

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
import { asyncDataSeed, asyncInflight } from '../../hooks/env.ts'
import type { Command } from '../command/index.ts'
import type { VNode } from '../vnode.ts'
import type { UIContext } from '../../context/UIContext.ts'

/** 服务端渲染选项 */
export interface SsrOptions {
  title?: string
  /** __DATA__ 种子（ctx.data 预取结果——序列化进文档） */
  data?: Record<string, unknown>
  /** **SSR 预取钩子（2027-08——预取遍前执行）**：bundle 内数据预热——
   *  与 useAsyncData 管道互补（同步缓存类数据——如 showcase index.json）——
   *  预取完成后组件异步启动立即命中——SSR 首帧带数据 */
  prefetch?: () => Promise<void>
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
  // **预取钩子（2027-08）**：预取遍前执行——bundle 内数据预热（同步缓存类）——
  // 返回值并入 __DATA__ 种子（prefetchSeed——客户端预热通道）
  const prefetchSeed = opts.prefetch ? await opts.prefetch() : undefined
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
  // **两遍渲染（2027-08——波次 4——SSR 预取器）**：
  // 预取遍：渲染树（useAsyncData 触发 fetch——树串行启动、网络并行飞行）——
  //         产物为 null 态（丢弃）——等待全部 in-flight 会合（并行完成）——
  //         失败：state$ 保持 null（区块降级——页面其余照常——非整页挂）
  // 正式遍：state$ 已填充——getter 同步命中——HTML 带数据
  // 种子：asyncSeed() → opts.data（__DATA__——客户端首帧零二次请求）
  const res1 = await router.resolve(req, ctx as UIContext)
  if (res1.body) {
    await streamToString(res1.body.pipeThrough(ndjsonDecode(fnTable)).pipeThrough(commandToHtml())) // 预取遍产物（丢弃）
  }
  await waitAsyncInflight() // 全部 useAsyncData fetch 会合（并行完成）
  const res = await router.resolve(frontRequest(url), ctx as UIContext)
  if (!res.body) return htmlDocument('', opts)
  const html = await streamToString(
    res.body.pipeThrough(ndjsonDecode(fnTable)).pipeThrough(commandToHtml()),
  )
  const seed = { ...(opts.data ?? {}), ...(prefetchSeed ?? {}), ...asyncSeed() }
  return htmlDocument(html, Object.keys(seed).length > 0 ? { ...opts, data: seed } : opts)
}

/** 等待全部 useAsyncData in-flight 会合（SSR 预取——并行完成的会合点） */
export async function waitAsyncInflight(): Promise<void> {
  await Promise.allSettled([...asyncInflight])
}

/** asyncRegistry 种子收集（SSR 渲染后——__DATA__ 序列化） */
export function asyncSeed(): Record<string, unknown> {
  return asyncDataSeed()
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
