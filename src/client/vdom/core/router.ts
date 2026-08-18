/**
 * vdom core — UIRouter（应用唯一入口——公共面）
 *
 * 设计（design/vdom-plan.md §2/§4）：Handler 签名字面同构后端——
 * `(req: Request, ctx) => Response`——原生 Request/Response——
 * 路由核心（Trie + 中间件链）后续提取为前后端共享（src/shared/router/）。
 *
 * 本文件为初始最小实现：路径 Map 精确匹配 + notFound 兜底——
 * Trie 匹配（静态优先 → :param → *）与中间件链后续实现。
 */

import type { Ctx } from '../context/Ctx.ts'
import type { Command } from './command/index.ts'

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
  private routes = new Map<string, PageHandler>()
  private notFoundHandler: PageHandler | null = null

  /** 注册路由（path 精确匹配——Trie 后续） */
  get(path: string, handler: PageHandler): this {
    this.routes.set(path, handler)
    return this
  }

  /** 404 兜底 */
  notFound(handler: PageHandler): this {
    this.notFoundHandler = handler
    return this
  }

  /** 解析请求 → 响应（匹配 + 参数注入 + handler 调用） */
  async resolve(req: FrontRequest, ctx: Ctx): Promise<Response> {
    const handler = this.routes.get(req.path) ?? this.notFoundHandler
    if (!handler) return new Response(null, { status: 404 })
    return handler(req, ctx)
  }
}
