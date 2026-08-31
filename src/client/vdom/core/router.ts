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
import { dispatchRouter, type RouterPipeline, type RouteMatch } from '../../../shared/router/pipeline.ts'
import { parseRequestTarget } from '../../../shared/router/context.ts'

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

  /** 路由存在性（onDocClick 决策：无匹配 → 不拦截——默认完整导航——
   *  实证：stats 页「← 填写页」链接被拦截但 navigate 落空——半跳转） */
  has(path: string): boolean {
    // **非法编码防御（B1）**：onDocClick 的 href 可能含 %zz——URIError
    // 裸抛会崩导航——视为无匹配（默认完整导航——安全回退）
    try {
      const url = new URL(path, 'http://x')
      for (const seg of url.pathname.split('/').filter(Boolean)) decodeURIComponent(seg)
      return trieMatch(this.root, splitPath(url.pathname)) !== null
    } catch {
      return false
    }
  }

  /** 404 兜底 */
  notFound(handler: PageHandler): this {
    this.notFoundHandler = handler
    return this
  }

  /** 解析请求 → 响应（Trie 匹配 + **params/query 注入 ctx**——对齐后端
   *  `ctx = { params, query }`——`Object.fromEntries(searchParams)`——
   *  不修改原始 Request） */
  private _pipeline?: RouterPipeline<PageHandler, UIContext>

  private get pipeline(): RouterPipeline<PageHandler, UIContext> {
    return (this._pipeline ??= {
      // **verb 差异点**（client 单 method——handler 直调闭包）
      resolveHandler: (m: RouteMatch<PageHandler>, req, ctx) => ({
        kind: 'route' as const,
        run: () => m.value(req, ctx),
      }),
      // 404 兜底（notFound ?? null body——原语义精确保留）
      onNotFound: (req, ctx) => {
        if (!this.notFoundHandler) return new Response(null, { status: 404 })
        return this.notFoundHandler(req, ctx)
      },
      // **ctx 扩展**（机制一致能力不同——client 三面注入：params fresh/
      // query/route——route 是应用消费面单点：AppLayout 活性/AgentDetail
      // params/navigate——2026-08 实证面）
      enrichCtx: (ctx, m, pathname, query) => {
        ctx.params = m ? { ...m.params } : {} // fresh——不残留旧路由键
        ctx.query = query
        ctx.route = { path: pathname, params: ctx.params, query }
      },
    })
  }

  /** 解析请求 → 响应（**shared pipeline 内核**——parse→match→ctx 注入→
   *  执行→404 兜底骨架单源——非法编码 → 400（B1——对齐 server 语义）） */
  async resolve(req: Request, ctx: UIContext): Promise<Response> {
    return dispatchRouter<PageHandler, UIContext>(this.root, this.pipeline, req, ctx)
  }
}
