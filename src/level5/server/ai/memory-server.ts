/**
 * weifuwu AI — MemoryAiServer：内存版 AI 服务器（协议替身——参考 MemoryPostgresServer）
 *
 * 进程内 HTTP 服务器——真实客户端零改动直连：
 *   OpenAI 兼容（createAiClient）：POST /v1/chat/completions（流/非流）+ /v1/embeddings
 *   Dashboard 格式（createDashscopeMultimodal）：POST /api/v1/services/aigc/
 *     multimodal-generation/generation（图片）+ video-synthesis（视频创建）
 *     + GET /api/v1/tasks/:id（视频状态）
 *
 * 后端 = MemoryAi（决策注入经 options.onChat 透传——测试确定性控制"LLM 回复什么"）。
 * 用途：测试（DEEPSEEK_BASE_URL / DASHSCOPE_MAAS_API_URL 指向它——全链真实客户端
 * 走 HTTP——不依赖真实 LLM）；认证直过（对齐 MemoryPostgresServer 无密码直连）。
 *
 * 诚实裁剪：只实现上述端点（客户端实际消费面）——不支持的消息 → 404 明确失败。
 */
import http from 'node:http'
import { createMemoryAi, type MemoryAiOptions } from './memory.ts'
import type { AiClient } from './client.ts'

export interface MemoryAiServerOptions extends MemoryAiOptions {
  /** 监听端口（0 = 随机——默认）。 */
  port?: number
  /** 自定义后端（默认 createMemoryAi(options)——决策注入透传） */
  ai?: AiClient
  /** 请求级注入（测试对 HTTP 面全控——替代自建 fake server）：
   *  undefined = 走默认 handler（onChat/onEmbed 决策）
   *  { status, body } = 故障注入（401/429/5xx）
   *  { sse } = 原始 SSE 字节行（tool_calls 分片/坏流/半流）
   *  { hang } = 挂起（不响应——首 token 超时/abort 测试） */
  respond?: (req: MemoryAiRequest) => MemoryAiRespond | undefined
}

/** 已接收请求（断言传输细节——路径/认证/体） */
export interface MemoryAiRequest {
  method: string
  path: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

/** 注入响应描述 */
export type MemoryAiRespond =
  | { status: number; body?: unknown }
  | { sse: string[] }
  | { hang: true }
  | { sse: string[]; hang: true }

/** 正名构造（new MemoryAiServer() / MemoryAiServer() / createMemoryAiServer() 等价——async 返回 Handle） */
export interface MemoryAiServer {
  new (options?: MemoryAiServerOptions): Promise<MemoryAiServerHandle>
}

export interface MemoryAiServerHandle {
  port: number
  /** 完整 base URL（http://127.0.0.1:{port}——给 baseUrl 指向） */
  url: string
  /** 已接收请求记录（断言用——含 respond 注入的请求） */
  requests: MemoryAiRequest[]
  /** 强制断开所有连接（hang 场景清理） */
  closeAllConnections(): void
  close(): Promise<void>
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' }

/** 工厂（= MemoryAiServer 正名——createMemoryAiServer 兼容别名） */
export const createMemoryAiServer = MemoryAiServer

export async function MemoryAiServer(options: MemoryAiServerOptions = {}): Promise<MemoryAiServerHandle> {
  const ai = options.ai ?? createMemoryAi(options)
  const requests: MemoryAiRequest[] = []

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const method = req.method ?? 'GET'
    void (async () => {
      // 记录请求（先于注入——respond 也能断言）
      let raw = ''
      for await (const chunk of req) raw += chunk
      const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
      const record: MemoryAiRequest = {
        method,
        path: url.pathname,
        headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)])),
        body,
      }
      requests.push(record)

      // 注入钩子（测试对 HTTP 面全控——替代自建 fake）
      const inj = options.respond?.(record)
      if (inj) {
        if ('sse' in inj) {
          res.writeHead(200, { 'Content-Type': 'text/event-stream' })
          for (const line of inj.sse) res.write(line)
          if (!('hang' in inj)) res.end()
          else return // 写后挂（不 end——断开测试用——客户端 abort 结束）
        } else if ('hang' in inj) {
          return // 故意不响应（客户端 abort 结束——测试后 closeAllConnections）
        } else {
          res.writeHead(inj.status, JSON_HEADERS)
          res.end(JSON.stringify(inj.body ?? {}))
        }
        return
      }

      await handle(ai, method, url, req, res, body)
    })().catch((err) => {
      if (!res.headersSent) {
        res.writeHead(500, JSON_HEADERS)
        res.end(JSON.stringify({ error: { message: String(err?.message ?? err) } }))
      }
    })
  })

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, '127.0.0.1', resolve))
  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0

  return {
    port,
    url: `http://127.0.0.1:${port}`,
    requests,
    closeAllConnections: () => server.closeAllConnections(),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, any>> {
  let raw = ''
  for await (const chunk of req) raw += chunk
  if (!raw) return {}
  return JSON.parse(raw) as Record<string, unknown>
}

async function handle(
  ai: AiClient,
  method: string,
  url: URL,
  req: http.IncomingMessage,
  res: http.ServerResponse,
  preBody?: Record<string, unknown>,
): Promise<void> {
  const p = url.pathname
  // ── OpenAI 兼容：chat（流/非流） ─────────────────────────
  if (method === 'POST' && p === '/v1/chat/completions') {
    const body = preBody ?? (await readJson(req))
    const messages = (body.messages ?? []) as Parameters<typeof ai.chat>[0]['messages']
    const params = { messages, model: String(body.model ?? 'memory-ai') } as unknown as Parameters<typeof ai.chat>[0]
    const r = await ai.chat(params)
    if (body.stream === true) {
      // 流式：content 整块 + finish_reason（聚合端支持单 chunk 全量）
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' })
      const base = { id: r.id, object: 'chat.completion.chunk', created: Date.now(), model: r.model }
      const send = (o: unknown) => res.write(`data: ${JSON.stringify(o)}\n\n`)
      if (r.choices[0]?.message?.content) {
        send({ ...base, choices: [{ index: 0, delta: { content: r.choices[0].message.content }, finish_reason: null }] })
      }
      const tcs = (r.choices[0]?.message as { tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }> })?.tool_calls
      if (tcs && tcs.length > 0) {
        send({ ...base, choices: [{ index: 0, delta: { tool_calls: tcs }, finish_reason: null }] })
      }
      send({
        ...base,
        choices: [{ index: 0, delta: {}, finish_reason: r.choices[0]?.finish_reason ?? 'stop' }],
        ...(r.usage ? { usage: r.usage } : {}),
      })
      res.write('data: [DONE]\n\n')
      res.end()
      return
    }
    res.writeHead(200, JSON_HEADERS)
    res.end(JSON.stringify(r))
    return
  }
  // ── OpenAI 兼容：embedding ───────────────────────────────
  if (method === 'POST' && p === '/v1/embeddings') {
    const body = preBody ?? (await readJson(req))
    const input = Array.isArray(body.input) ? (body.input as string[]) : [String(body.input ?? '')]
    const embeddings = await ai.embedMany(input)
    res.writeHead(200, JSON_HEADERS)
    res.end(JSON.stringify({
      object: 'list',
      data: embeddings.map((embedding, index) => ({ object: 'embedding', index, embedding })),
    }))
    return
  }
  // ── dashscope：图片生成 ──────────────────────────────────
  if (method === 'POST' && p === '/api/v1/services/aigc/multimodal-generation/generation') {
    const body = preBody ?? (await readJson(req))
    const messages = (body.input?.messages ?? []) as Array<{ content?: Array<{ text?: string }> }>
    const prompt = messages[0]?.content?.[0]?.text ?? ''
    const r = await ai.generateImage({ prompt, size: String(body.parameters?.size ?? '') || undefined })
    res.writeHead(200, JSON_HEADERS)
    // image 字段放 URL 或 data URL（客户端 extractImage 两形态兼容）
    res.end(JSON.stringify({
      output: { choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: [{ image: r.url ?? r.dataUrl ?? '' }] } }] },
    }))
    return
  }
  // ── dashscope：视频创建 ──────────────────────────────────
  if (method === 'POST' && p === '/api/v1/services/aigc/video-generation/video-synthesis') {
    const body = preBody ?? (await readJson(req))
    const prompt = String(body.input?.prompt ?? '')
    const { taskId } = await ai.createVideoTask({ prompt, duration: Number(body.parameters?.duration ?? 5) })
    res.writeHead(200, JSON_HEADERS)
    res.end(JSON.stringify({ output: { task_id: taskId } }))
    return
  }
  // ── dashscope：视频状态 ──────────────────────────────────
  if (method === 'GET' && p.startsWith('/api/v1/tasks/')) {
    const taskId = p.slice('/api/v1/tasks/'.length)
    const st = await ai.videoStatus(taskId)
    res.writeHead(200, JSON_HEADERS)
    const map = {
      pending: { task_status: 'PENDING' },
      running: { task_status: 'RUNNING' },
      done: { task_status: 'SUCCEEDED', video_url: st.url },
      failed: { task_status: 'FAILED', message: st.error ?? 'failed' },
    } as const
    res.end(JSON.stringify({ output: map[st.status] }))
    return
  }
  // ── 不支持 → 明确 404（可预测失败——诚实裁剪） ────────────
  res.writeHead(404, JSON_HEADERS)
  res.end(JSON.stringify({ error: { message: `MemoryAiServer: 不支持 ${method} ${p}` } }))
}
