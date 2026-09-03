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
}

export interface MemoryAiServerHandle {
  port: number
  close(): Promise<void>
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' }

export async function createMemoryAiServer(options: MemoryAiServerOptions = {}): Promise<MemoryAiServerHandle> {
  const ai = options.ai ?? createMemoryAi(options)

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost')
    const method = req.method ?? 'GET'
    void handle(ai, method, url, req, res).catch((err) => {
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
): Promise<void> {
  const p = url.pathname
  // ── OpenAI 兼容：chat（流/非流） ─────────────────────────
  if (method === 'POST' && p === '/v1/chat/completions') {
    const body = await readJson(req)
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
      send({ ...base, choices: [{ index: 0, delta: {}, finish_reason: r.choices[0]?.finish_reason ?? 'stop' }] })
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
    const body = await readJson(req)
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
    const body = await readJson(req)
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
    const body = await readJson(req)
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
