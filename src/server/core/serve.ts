import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import crypto from 'node:crypto'
import { parseQuery } from '../../shared/router/context.ts'
import { HttpError, type Context } from '../types.ts'
import { Router } from './router.ts'

export interface ServeOptions {
  port?: number
  hostname?: string
  signal?: AbortSignal
  /** Max request body size in bytes. Default: 10MB. Set to 0 for unlimited. */
  maxBodySize?: number
  /** Socket timeout in ms (inactivity). Default: 120_000（2 分钟，适配 LLM 生成等长任务）. */
  timeout?: number
  /** Keep-Alive idle timeout in ms. Default: 5_000. */
  keepAliveTimeout?: number
  /** Headers timeout in ms (must be > keepAliveTimeout). Default: 6_000. */
  headersTimeout?: number
  shutdown?: boolean
}

export interface Server {
  stop: (timeoutMs?: number) => Promise<void>
  /** Alias for `stop()`. Prefer this for consistency with other modules. */
  close: (timeoutMs?: number) => Promise<void>
  readonly port: number
  readonly hostname: string
  ready: Promise<void>
}

/** Default max body size: 10MB. Set maxBodySize: 0 for unlimited. */
export const DEFAULT_MAX_BODY = 10 * 1024 * 1024

/** S6：无 body 请求共用零长 Buffer（避免每请求分配） */
const EMPTY_BODY = Buffer.alloc(0)

export async function readBody(req: IncomingMessage, maxSize?: number): Promise<Buffer> {
  const limit = maxSize ?? DEFAULT_MAX_BODY

  if (limit > 0) {
    const cl = parseInt(req.headers['content-length'] ?? '0', 10)
    if (cl > limit) throw new HttpError('Request body too large', 413)
  }

  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    total += (chunk as Buffer).byteLength
    if (limit > 0 && total > limit) throw new HttpError('Request body too large', 413)
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

export function createRequest(
  req: IncomingMessage,
  body: Buffer,
): [Request, Record<string, string>] {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const query = parseQuery(url)

  const headers: Record<string, string> = {}
  for (const [key, value] of Object.entries(req.headers)) {
    if (value !== undefined) {
      headers[key] = Array.isArray(value) ? value.join(', ') : value
    }
  }

  const request = new Request(url.href, {
    method: req.method?.toUpperCase() ?? 'GET',
    headers,
    body:
      req.method !== 'GET' && req.method !== 'HEAD' && body.length > 0 ? (body as BodyInit) : null,
  })

  return [request, query]
}

export async function sendResponse(
  res: ServerResponse,
  response: Response,
  opts?: { traceId?: string | null },
): Promise<void> {
  const headers: Record<string, string | string[]> = {}
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() === 'set-cookie') {
      const existing = headers[key]
      headers[key] = existing
        ? Array.isArray(existing)
          ? [...existing, value]
          : [existing, value]
        : value
    } else {
      headers[key] = value
    }
  })

  // Inject trace header
  if (opts?.traceId && !headers['x-trace-id']) {
    headers['x-trace-id'] = opts.traceId
  }

  res.writeHead(response.status, response.statusText, headers)

  if (response.body) {
    // 流式泵（S1——SERVER-PERF-PLAN 波次 1）：
    //   a) 背压：write() 返回 false → 等 drain（快流 + 慢客户端不再无界缓冲）
    //   b) 断开传播：socket close → reader.cancel() → ReadableStream.cancel()
    //      → SSE/AI 上游 onAbort 生效（源停止生产——token 不再写入死连接）
    //   c) res 'error' 兑底：destroy 后 write 触发的 ERR_STREAM_DESTROYED
    //      无监听会崩进程——吞掉（泵经 close 事件退出）
    const reader = response.body.getReader()
    const closed = new Promise<'closed'>((resolve) => {
      res.once('close', () => resolve('closed'))
    })
    res.on('error', () => {})
    const cancelStream = () =>
      reader.cancel(new Error('client disconnected')).catch(() => {})
    try {
      while (true) {
        const winner = await Promise.race([
          reader.read().then((r) => ({ kind: 'chunk' as const, r })),
          closed,
        ])
        if (winner === 'closed' || res.destroyed) {
          await cancelStream()
          return
        }
        const { done, value } = winner.r
        if (done) break
        if (!res.write(value)) {
          const drained = new Promise<'drain'>((resolve) =>
            res.once('drain', () => resolve('drain')),
          )
          if ((await Promise.race([drained, closed])) === 'closed') {
            await cancelStream()
            return
          }
        }
      }
      res.end()
    } catch (err) {
      // 源错误 → 干净地销毁 socket（客户端看到连接截断——服务器不崩）
      if (!res.destroyed) {
        res.destroy(err instanceof Error ? err : undefined)
      }
    } finally {
      reader.releaseLock()
    }
    return
  }

  res.end()
}
export function serve<T extends object>(router: Router<T>, options?: ServeOptions): Server {
  const ws = router.websocketHandler()
  const handler = router.handler()
  const port = options?.port ?? 0
  const hostname = options?.hostname ?? '0.0.0.0'

  // 在途请求追踪（S2 优雅停机）：从请求进入到响应完成——
  // stop() 排空目标（server.close() 后无新增，快照即全量）
  const inFlight = new Set<Promise<void>>()

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const traceId =
      (req.headers['x-trace-id'] as string) ||
      (req.headers['traceparent'] as string)?.split('-')[1] ||
      crypto.randomUUID()

    try {
      // S6：无 body 请求（无 Content-Length 且无 Transfer-Encoding）跳过读取管线——
      // GET/HEAD 零 body 场景省一次异步迭代器创建 + for-await 开销
      const hasBody =
        Number(req.headers['content-length'] ?? '0') > 0 ||
        req.headers['transfer-encoding'] !== undefined
      const body = hasBody ? await readBody(req, options?.maxBodySize) : EMPTY_BODY
      const [request, query] = createRequest(req, body)
      const response = await handler(request, { params: {}, query } as T)
      await sendResponse(res, response, { traceId })
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err))
      // HttpError → 对应状态码（README 承诺：serve 自动返回对应状态码）
      if (e instanceof HttpError) {
        res.writeHead(e.status, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: e.message }))
        return
      }
      // Log unexpected errors so developers can debug
      const url = req.url ?? '/'
      const method = req.method ?? 'GET'
      console.error(`[serve] ${method} ${url}:`, e.stack || e.message)
      // 错误形态统一（S9）：500 = JSON { error }——与 router 层/ serverError() 一致
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Internal Server Error' }))
    }
  }

  const server = http.createServer((req, res) => {
    const p = handleRequest(req, res)
    const settled = p.then(
      () => {},
      () => {}, // handleRequest 内部已兜底——此处防御未处理拒绝
    )
    inFlight.add(settled)
    void settled.then(() => { inFlight.delete(settled) })
  })

  // Connection timeouts — prevent slowloris and idle connection leaks
  server.timeout = options?.timeout ?? 120_000
  server.keepAliveTimeout = options?.keepAliveTimeout ?? 5_000
  server.headersTimeout = options?.headersTimeout ?? 6_000

  server.on('upgrade', ws)

  let resolveReady!: () => void
  const ready = new Promise<void>((r) => {
    resolveReady = r
  })

  let shutdownHandler: (() => void) | null = null

  if (options?.shutdown !== false) {
    let shuttingDown = false
    const shutdown = async () => {
      if (shuttingDown) return
      shuttingDown = true
      console.log('weifuwu shutting down...')
      // 与 stop() 同一实现（排空在途 → 优雅关闭）——收敛双路径漂移
      await stop().catch(() => {})
      process.exit(0)
    }
    shutdownHandler = shutdown
    process.on('SIGTERM', shutdown)
    process.on('SIGINT', shutdown)
  }

  let _cachedPort = 0
  let _cachedHostname = ''

  if (options?.signal) {
    if (options.signal.aborted) {
      _cachedPort = 0
      _cachedHostname = ''
      server.close()
      resolveReady()
      return {
        stop: () => Promise.resolve(),
        close: () => Promise.resolve(),
        ready,
        get port() {
          return 0
        },
        get hostname() {
          return hostname
        },
      }
    }
    options.signal.addEventListener(
      'abort',
      () => {
        server.close()
      },
      { once: true },
    )
  }

  server.on('error', (err) => {
    // Event emitter errors cannot be caught by try-catch.
    // Log, clean up, and resolve ready so the caller can detect failure
    // by checking server.port === 0 after ready.
    console.error('weifuwu server error:', err.message || err)
    server.close()
    _cachedPort = 0
    resolveReady()
  })

  server.listen(port, hostname, () => {
    const addr = server.address()
    if (addr && typeof addr !== 'string') {
      _cachedPort = addr.port
      _cachedHostname = addr.address
    }
    resolveReady()

    // Startup message — automatic in all environments
    const displayHost = _cachedHostname === '0.0.0.0' ? 'localhost' : _cachedHostname || 'localhost'
    console.log(`weifuwu listening on http://${displayHost}:${_cachedPort}`)
  })

  async function stop(timeoutMs = 2_000): Promise<void> {
    if (shutdownHandler) {
      process.off('SIGTERM', shutdownHandler)
      process.off('SIGINT', shutdownHandler)
      shutdownHandler = null
    }
    // 1. 停止接收新连接 + 释放空闲 keep-alive（排空只针对在途请求）
    server.close()
    server.closeIdleConnections()
    // 2. 排空在途（timeoutMs 到点强杀兑底——timeoutMs=0 跳过等待）
    if (inFlight.size > 0 && timeoutMs > 0) {
      await Promise.race([
        Promise.allSettled([...inFlight]).then(() => {}),
        new Promise<void>((r) => setTimeout(r, timeoutMs)),
      ])
    }
    // 3. 优雅关闭：WS 客户端 1001 握手 + 有状态模块（postgres/redis 池等）
    //    （必须在 closeAllConnections 之前——先给握手时间，再强杀）
    await router.close().catch(() => {})
    // 4. 强杀残余（未完成握手/卡死的流——最终兑底）
    server.closeAllConnections()
  }

  return {
    close: stop,
    stop,
    ready,
    get port() {
      if (!server.listening) return 0
      return _cachedPort
    },
    get hostname() {
      if (!server.listening) return hostname
      return _cachedHostname || hostname
    },
  }
}
