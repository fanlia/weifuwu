import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import type { Duplex } from 'node:stream'
import type { Handler } from './types.ts'

export interface ServeOptions {
  port?: number
  hostname?: string
  signal?: AbortSignal
  websocket?: (req: IncomingMessage, socket: Duplex, head: Buffer) => void
}

export interface Server {
  stop: () => void
  readonly port: number
  readonly hostname: string
  ready: Promise<void>
}

export async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks)
}

export function createRequest(req: IncomingMessage, body: Buffer): [Request, Record<string, string>] {
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
    body: (req.method !== 'GET' && req.method !== 'HEAD' && body.length > 0)
      ? body
      : null,
  })

  return [request, query]
}

export async function sendResponse(res: ServerResponse, response: Response): Promise<void> {
  const headers: Record<string, string | string[]> = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })

  res.writeHead(response.status, response.statusText, headers)

  if (response.body) {
    const reader = response.body.getReader()
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        res.write(value)
      }
    } finally {
      reader.releaseLock()
    }
  }

  res.end()
}

export function serve(handler: Handler, options?: ServeOptions): Server {
  const port = options?.port ?? 0
  const hostname = options?.hostname ?? '0.0.0.0'

  const server = http.createServer(async (req, res) => {
    try {
      const body = await readBody(req)
      const [request, query] = createRequest(req, body)
      const response = await handler(request, { params: {}, query })
      await sendResponse(res, response)
    } catch {
      res.writeHead(500, { 'Content-Type': 'text/plain' })
      res.end('Internal Server Error')
    }
  })

  if (options?.websocket) {
    server.on('upgrade', options.websocket)
  }

  let resolveReady!: () => void
  const ready = new Promise<void>((r) => { resolveReady = r })

  if (options?.signal) {
    if (options.signal.aborted) {
      server.close()
      resolveReady()
      return {
        stop: () => {},
        ready,
        get port() { return 0 },
        get hostname() { return hostname },
      }
    }
    options.signal.addEventListener('abort', () => { server.close() }, { once: true })
  }

  server.listen(port, hostname, () => { resolveReady() })

  return {
    stop: () => { server.close() },
    ready,
    get port() {
      const addr = server.address()
      if (!addr || typeof addr === 'string') return 0
      return addr.port
    },
    get hostname() {
      const addr = server.address()
      if (!addr) return hostname
      return typeof addr === 'string' ? addr : addr.address
    },
  }
}
