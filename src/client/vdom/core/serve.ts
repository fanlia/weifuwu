/**
 * vdom core — uiServe（渲染落地——公共面——双端一体）
 *
 * 设计（design/vdom-plan.md §3/§4）：
 * - UIRouter 唯一应用入口——uiServe(router, { root, browser }) 收养渲染
 * - 渲染循环：初始 URL resolve → Response（command 事件流）→ patch
 * - **ctx.render() = 重新渲染**（事件触发/fetch 结束/定时器回调的唯一入口）：
 *   重新 resolve（handler 重跑——registry 复用——组件工厂不重跑——
 *   renderFn 重调读最新状态）→ **新的 Response command 事件流** → 消费
 *   （patch 对照现有 DOM 节点——幂等——就地更新）
 * - 函数面传输：同进程共享函数表——编码时函数 → {$fn: n} 标记——
 *   解码时查表还原（事件绑定跨 Response 保持）
 *
 * 服务端面（SSR——同一 handler 同一 Response——body 经 commandToHtml()
 * TransformStream 流式吐 HTML）后续实现。
 */

import { UIRouter, frontRequest } from './router.ts'
import { CommandApplier } from './patch.ts'
import { renderToStream } from './build.ts'
import { diffStream } from './diff.ts'
import type { VNode } from './vnode.ts'
import { createComponentRegistry } from './node/component.ts'
import type { Ctx, DataPipe } from '../context/Ctx.ts'
import type { Command } from './command/index.ts'
import type { Browser } from '../browser/Browser.ts'

/** NDJSON 命令流解析（行缓冲——命令可能跨 chunk——函数表还原） */
function commandReader(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  fnTable: Map<number, unknown>,
): AsyncGenerator<Command> {
  const decoder = new TextDecoder()
  let buf = ''
  const revive = (k: string, v: unknown): unknown => {
    if (v && typeof v === 'object' && typeof (v as { $fn?: unknown }).$fn === 'number') {
      return fnTable.get((v as { $fn: number }).$fn)
    }
    return v
  }
  const pump = async (): Promise<IteratorResult<Command>> => {
    while (true) {
      const nl = buf.indexOf('\n')
      if (nl >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (line) return { value: JSON.parse(line, revive) as Command, done: false }
        continue
      }
      const { value, done } = await reader.read()
      if (done) {
        if (buf.trim()) {
          const line = buf.trim()
          buf = ''
          return { value: JSON.parse(line, revive) as Command, done: false }
        }
        return { value: undefined as never, done: true }
      }
      buf += decoder.decode(value, { stream: true })
    }
  }
  return { [Symbol.asyncIterator]() { return { next: pump } } } as AsyncGenerator<Command>
}

/** 命令流编码（函数面 → {$fn: n}——函数表——同进程共享） */
export function encodeCommands(
  stream: ReadableStream<Command>,
  fnTable: Map<number, unknown>,
): ReadableStream<Uint8Array> {
  const enc = new TextEncoder()
  const mark = (k: string, v: unknown): unknown => {
    if (typeof v === 'function') {
      const n = fnTable.size + 1 // 只增不减——序号单调（多次 render 不冲突）
      fnTable.set(n, v)
      return { $fn: n }
    }
    return v
  }
  return stream.pipeThrough(new TransformStream<Command, Uint8Array>({
    transform(cmd, controller) {
      controller.enqueue(enc.encode(JSON.stringify(cmd, mark) + '\n'))
    },
  }))
}

/** 函数表（serve 级共享——编码/解码同进程） */
export function createFnTable(): Map<number, unknown> {
  return new Map()
}

export interface UiServeOptions {
  /** 根容器（选择器或元素——'#root'） */
  root: string | HTMLElement
  /** 浏览器环境（依赖注入——测试 testBrowser() / 生产 createClientBrowser()） */
  browser: Browser
}

export interface UiServeHandle {
  /** 首帧渲染完成 Promise（await 精确等待） */
  ready: Promise<void>
  /** 卸载（清理 DOM/监听） */
  unmount(): void
}

/** 页面作者渲染入口（ctx 面——vnode → Response command 事件流——
 *  公共面仍只有 h/jsx/uiServe/UIRouter——本入口经 ctx 提供） */
export interface RenderCtx extends Ctx {
  /** vnode → Response（command 事件流——函数表编码——事件绑定跨流保持） */
  stream(vnode: VNode, init?: ResponseInit): Response
}

export function uiServe(router: UIRouter, opts: UiServeOptions): UiServeHandle {
  const doc = opts.browser.document
  const rootEl = typeof opts.root === 'string'
    ? (doc.querySelector(opts.root) as HTMLElement | null)
    : opts.root
  if (!rootEl) throw new Error(`uiServe: root 未找到 — ${String(opts.root)}`)

  // ── serve 级单例（跨渲染保持——patch 幂等对照现有 DOM + 组件注册表复用） ──
  const fnTable = createFnTable()
  const registry = createComponentRegistry()
  const applier = new CommandApplier(rootEl, doc)
  const req = frontRequest(opts.browser.window.location.pathname)
  /** 影子树（当前渲染的 vnode——diff 对照——精准增量命令流） */
  let currentTree: VNode | null = null

  // ── ctx（render = 重新渲染唯一入口——事件/fetch/定时器回调） ──
  const ctx = {
    /** 重新渲染：重新 resolve（handler 重跑——registry 复用——工厂不重跑）→
     *  新的 Response command 事件流 → 消费（patch 对照现有 DOM——就地更新） */
    async render(): Promise<void> {
      const res = await router.resolve(req, ctx)
      if (!res.body) return
      for await (const cmd of commandReader(res.body.getReader(), fnTable)) {
        applier.apply(cmd)
      }
    },
  } as Ctx

  // ── 页面作者渲染入口（vnode → Response 事件流——函数表编码） ──
  const renderCtx = ctx as RenderCtx
  renderCtx.stream = (vnode: VNode, init?: ResponseInit): Response => {
    // **diff 本质（2026-12）：精准生成需要 patch 的事件流**——
    // 有影子树 → diff（增量命令——counter 点击只发文本 setText）；
    // 无影子树（首帧）→ build 全量。
    const stream = currentTree
      ? diffStream(currentTree, vnode, ctx, registry)
      : renderToStream(vnode, ctx, registry)
    currentTree = vnode // 影子树更新（下次对照）
    return new Response(encodeCommands(stream, fnTable), {
      status: init?.status ?? 200,
      headers: init?.headers,
    })
  }

  const ready = (async () => {
    await ctx.render()
  })()

  return {
    ready,
    unmount() {
      rootEl.innerHTML = ''
    },
  }
}
