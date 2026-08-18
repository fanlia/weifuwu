/**
 * vdom core — uiServe（渲染落地——公共面——双端一体）
 *
 * 设计（design/vdom-plan.md §3/§4）：UIRouter 唯一应用入口——
 * uiServe(router, { root }) 收养渲染——初始 URL resolve →
 * Response body（命令流）→ 逐条 apply 到 DOM。
 *
 * 服务端面（SSR——同一 handler 同一 Response——body 经 commandToHtml()
 * TransformStream 流式吐 HTML）后续实现。
 */

import { UIRouter, frontRequest } from './router.ts'
import { CommandApplier } from './apply.ts'
import type { Ctx } from '../context/Ctx.ts'
import type { Command } from './command/index.ts'
import type { Browser } from '../browser/Browser.ts'

/** NDJSON 命令流解析（行缓冲——命令可能跨 chunk） */
function commandReader(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<Command> {
  const decoder = new TextDecoder()
  let buf = ''
  const pump = async (): Promise<IteratorResult<Command>> => {
    while (true) {
      const nl = buf.indexOf('\n')
      if (nl >= 0) {
        const line = buf.slice(0, nl).trim()
        buf = buf.slice(nl + 1)
        if (line) return { value: JSON.parse(line) as Command, done: false }
        continue
      }
      const { value, done } = await reader.read()
      if (done) {
        if (buf.trim()) {
          const line = buf.trim()
          buf = ''
          return { value: JSON.parse(line) as Command, done: false }
        }
        return { value: undefined as never, done: true }
      }
      buf += decoder.decode(value, { stream: true })
    }
  }
  return { [Symbol.asyncIterator]() { return { next: pump } } } as AsyncGenerator<Command>
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

export function uiServe(router: UIRouter, opts: UiServeOptions): UiServeHandle {
  const doc = opts.browser.document
  const rootEl = typeof opts.root === 'string'
    ? (doc.querySelector(opts.root) as HTMLElement | null)
    : opts.root
  if (!rootEl) throw new Error(`uiServe: root 未找到 — ${String(opts.root)}`)

  const ctx = {} as Ctx // 组件 ctx（render/data/ui...）后续实现——当前最小

  const ready = (async () => {
    const req = frontRequest(opts.browser.location.pathname)
    const res = await router.resolve(req, ctx)
    if (!res.body) return
    const applier = new CommandApplier(rootEl, doc)
    for await (const cmd of commandReader(res.body.getReader())) {
      applier.apply(cmd)
    }
  })()

  return {
    ready,
    unmount() {
      rootEl.innerHTML = ''
    },
  }
}
