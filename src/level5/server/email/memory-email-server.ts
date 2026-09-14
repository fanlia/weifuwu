/**
 * weifuwu/email — MemoryEmailServer（HTTP 协议替身——参考 MemoryAiServer）
 *
 * 真实 EmailApi 客户端**零改动直连**的前端：POST /emails（Resend 兼容）+ GET /emails（收件箱）。
 * 后端 MemoryEmail（onSend 注入/默认记录）——认证直过（测试环境——不检 apiKey）。
 *
 * 用途：集成/e2e 测试——测试代码只注入 onSend 决策，客户端走真实 HTTP 路径。
 * 替代 greenmail（SMTP）——不直连 SMTP——docker-compose 的 smtp 服务仅保留兼容。
 */
import http from 'node:http'
import { MemoryEmail, type MemoryEmailOptions } from './memory-email.ts'
import type { EmailMessage } from './contracts.ts'

export interface MemoryEmailServerOptions extends MemoryEmailOptions {
  port?: number
  /** 请求级注入（测试对 HTTP 面全控——替代自建 mock）：
   *  undefined = 走默认 handler（记录 + onSend 注入）
   *  { status, body } = 故障注入（4xx/5xx）
   *  { hang } = 挂起（超时测试） */
  respond?: (req: MemoryEmailRequest) => MemoryEmailRespond | undefined
}

/** 已接收请求（断言传输细节——路径/认证/体） */
export interface MemoryEmailRequest {
  method: string
  path: string
  headers: Record<string, string>
  body: Record<string, unknown>
}

/** 注入响应描述 */
export type MemoryEmailRespond = { status: number; body?: unknown } | { hang: true }

/** 正名构造（new MemoryEmailServer() / MemoryEmailServer() / createMemoryEmailServer() 等价） */
export interface MemoryEmailServer {
  new (options?: MemoryEmailServerOptions): Promise<MemoryEmailServerHandle>
}

export interface MemoryEmailServerHandle {
  port: number
  /** 完整 base URL（http://127.0.0.1:{port}——给 EMAIL_API_URL 指向） */
  url: string
  /** 收件箱（GET /emails 同步返回——测试断言用） */
  emails: EmailMessage[]
  /** 已接收请求记录（断言用——含 respond 注入的请求） */
  requests: MemoryEmailRequest[]
  /** 强制断开所有连接（hang 场景清理） */
  closeAllConnections(): void
  close(): Promise<void>
}

/** 工厂（= MemoryEmailServer 正名——createMemoryEmailServer 兼容别名） */
export const createMemoryEmailServer = MemoryEmailServer

export async function MemoryEmailServer(
  options: MemoryEmailServerOptions = {},
): Promise<MemoryEmailServerHandle> {
  const emails: EmailMessage[] = []
  const requests: MemoryEmailRequest[] = []
  const email = MemoryEmail({
    ...options,
    onSend: async (msg) => {
      emails.push(msg)
      if (options.onSend) return options.onSend(msg)
      return { id: `memory-mail-${emails.length}`, accepted: true }
    },
  })

  const server = http.createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      // 请求记录（先于注入——respond 也能断言）
      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      const raw = Buffer.concat(chunks).toString('utf8')
      const record: MemoryEmailRequest = {
        method: req.method ?? 'GET',
        path: url.pathname,
        headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, String(v)])),
        body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {},
      }
      requests.push(record)

      // 注入钩子
      const inj = options.respond?.(record)
      if (inj) {
        if ('hang' in inj) return // 故意不响应（超时测试——closeAllConnections 清理）
        res.writeHead(inj.status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(inj.body ?? {}))
        return
      }

      if (req.method === 'POST' && url.pathname === '/emails') {
        const body = record.body as unknown as EmailMessage
        const result = await email.send({
          to: body.to,
          subject: body.subject,
          text: body.text,
          html: body.html,
          from: body.from,
        })
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ id: result.id }))
        return
      }
      if (req.method === 'GET' && url.pathname === '/emails') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ messages: emails }))
        return
      }
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'not found' }))
    })().catch((err) => {
      res.writeHead(400, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
    })
  })

  await new Promise<void>((resolve) => server.listen(options.port ?? 0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  return {
    port,
    url: `http://127.0.0.1:${port}`,
    emails,
    requests,
    closeAllConnections: () => server.closeAllConnections(),
    close: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
  }
}
