import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import crypto from 'node:crypto'
import { HttpError, type Context } from '../types.ts'
import { Router } from './router.ts'

export interface ServeOptions {
  port?: number
  hostname?: string
  signal?: AbortSignal
  /** Max request body size in bytes. Default: 10MB. Set to 0 for unlimited. */
  maxBodySize?: number
  /** Socket timeout in ms (inactivity). Default: 30_000. */
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
  const query = Object.fromEntries(url.searchParams)

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
    const reader = response.body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(value)
      }
      res.end()
    } catch (err) {
      // Client disconnected or write failed — destroy socket cleanly
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
export function serve(router: Router, options?: ServeOptions): Server {
  const ws = router.websocketHandler()
  const handler = router.handler()
  const port = options?.port ?? 0
  const hostname = options?.hostname ?? '0.0.0.0'

  const server = http.createServer(async (req, res) => {
    const traceId =
      (req.headers['x-trace-id'] as string) ||
      (req.headers['traceparent'] as string)?.split('-')[1] ||
      crypto.randomUUID()

    try {
      const body = await readBody(req, options?.maxBodySize)
      const [request, query] = createRequest(req, body)
      const response = await handler(request, { params: {}, query } as Context)
      await sendResponse(res, response, { traceId })
    } catch (err) {
      if (err instanceof HttpError && err.status === 413) {
        res.writeHead(413, { 'Content-Type': 'text/plain' })
        res.end('Request Body Too Large')
        return
      }
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Internal Server Error')
    }
  })

  // Connection timeouts — prevent slowloris and idle connection leaks
  server.timeout = options?.timeout ?? 30_000
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
      // 1. Stop accepting new connections
      // 2. Close stateful modules (postgres, redis, etc.) via router.close()
      // 3. Exit
      server.closeAllConnections()
      server.close()
      await router.close().catch(() => {})
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
    if (!server.listening) return

    // Force-close WebSocket/keep-alive connections so server.close() fires immediately
    server.closeAllConnections()
    server.close()
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
