/**
 * vdom core — route 阶段（UIRouter——应用唯一入口——公共面）
 *
 * 设计（design/vdom-plan.md §2）：Handler 签名字面同构后端——
 * `(req: Request, ctx) => Response`——原生 Request/Response——
 * 路由核心 = shared Trie（src/shared/router/trie.ts——前后端共用）——
 * 静态段优先 → :param → * 通配——params 注入 req。
 */

import type { Ctx } from '../context/Ctx.ts'
import type { Command } from './command/index.ts'
import { createTrie, trieRegister, trieMatch, splitPath, type TrieNode } from '../../../shared/router/trie.ts'

/** 前端请求 = 原生 Request + params/path 注入（类型扩展——匹配结果挂 req） */
export type FrontRequest = Request & { params: Record<string, string>; path: string }

/** 页面 handler——返回原生 Response（body = 命令流字节——NDJSON） */
export type PageHandler = (req: FrontRequest, ctx: Ctx) => Response | Promise<Response>

/** 渲染入口封装：命令流 → 原生 Response（body = NDJSON 字节流——
 *  HTTP 传输层即字节——命令纯数据可序列化——服务端同源解析） */
export function commandResponse(stream: ReadableStream<Command>, init?: ResponseInit): Response {
  const enc = new TextEncoder()
  const body = stream.pipeThrough(new TransformStream<Command, Uint8Array>({
    transform(cmd, controller) {
      controller.enqueue(enc.encode(JSON.stringify(cmd) + '\n'))
    },
  }))
  return new Response(body, { status: init?.status ?? 200, headers: init?.headers })
}

/** 构造前端请求（path → Request + params 占位 + path 挂载） */
export function frontRequest(path: string): FrontRequest {
  const url = new URL(path, 'http://localhost')
  const req = new Request(url) as FrontRequest
  req.params = {}
  Object.defineProperty(req, 'path', { value: url.pathname, enumerable: true })
  return req
}

export class UIRouter {
  private root: TrieNode<PageHandler> = createTrie<PageHandler>()
  private notFoundHandler: PageHandler | null = null

  /** 注册路由（shared Trie——静态/:param/*——params 注入 req） */
  get(path: string, handler: PageHandler): this {
    trieRegister(this.root, path, handler)
    return this
  }

  /** 404 兜底 */
  notFound(handler: PageHandler): this {
    this.notFoundHandler = handler
    return this
  }

  /** 解析请求 → 响应（Trie 匹配 + params 注入 + handler 调用） */
  async resolve(req: FrontRequest, ctx: Ctx): Promise<Response> {
    const m = trieMatch(this.root, splitPath(req.path))
    const handler = m?.value ?? this.notFoundHandler
    if (!handler) return new Response(null, { status: 404 })
    if (m) Object.assign(req.params, m.params)
    return handler(req, ctx)
  }
}
