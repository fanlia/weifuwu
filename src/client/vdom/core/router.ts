/**
 * vdom core — route 阶段（UIRouter——应用唯一入口——公共面）
 *
 * 设计（design/vdom-plan.md §2）：Handler 签名字面同构后端——
 * `(req: Request, ctx) => Response`——原生 Request/Response——
 * 路由核心 = shared Trie（src/shared/router/trie.ts——前后端共用）——
 * 静态段优先 → :param → * 通配——params 注入 req。
 */

import type { UIContext } from '../context/UIContext.ts'
import type { Command } from './command/index.ts'
import { createTrie, trieRegister, trieMatch, splitPath, type TrieNode } from '../../../shared/router/trie.ts'

/** 页面 handler——返回原生 Response（body = 命令流字节——NDJSON）——
 *  与后端 Handler 签名字面同构：(req, ctx) => Response——req 为**标准
 *  Request**（零扩展——params/query 经 ctx 注入） */
export type PageHandler = (req: Request, ctx: UIContext) => Response | Promise<Response>

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

/** 构造前端请求（纯标准 Request——零扩展——URL 基于 http://localhost） */
export function frontRequest(path: string): Request {
  return new Request(new URL(path, 'http://localhost'))
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

  /** 解析请求 → 响应（Trie 匹配 + **params/query 注入 ctx**——对齐后端
   *  `ctx = { params, query }`——`Object.fromEntries(searchParams)`——
   *  不修改原始 Request） */
  async resolve(req: Request, ctx: UIContext): Promise<Response> {
    const url = new URL(req.url)
    const segments = splitPath(url.pathname)
    const m = trieMatch(this.root, segments)
    const handler = m?.value ?? this.notFoundHandler
    if (!handler) return new Response(null, { status: 404 })
    // params 注入 ctx（每次渲染替换——不残留旧路由键）
    const params: Record<string, string> = {}
    if (m) Object.assign(params, m.params)
    ctx.params = params
    // query 注入 ctx（对齐后端 Object.fromEntries(searchParams)）
    ctx.query = Object.fromEntries(url.searchParams)
    return handler(req, ctx)
  }
}
