import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { serve, createTestServer, setCookie, type Handler, type Context } from '../index.ts'
import { readBody, createRequest, sendResponse } from '../serve.ts'

function mkIncoming(opts?: { url?: string; method?: string; headers?: Record<string, string | string[] | undefined> }): IncomingMessage {
  const req = new Readable({ read() {} }) as unknown as IncomingMessage
  req.url = opts?.url ?? '/'
  req.method = opts?.method ?? 'GET'
  req.headers = opts?.headers ?? {}
  return req
}

async function pushBody(req: IncomingMessage, body: string | Buffer): Promise<void> {
  if (body.length > 0) {
    req.push(typeof body === 'string' ? Buffer.from(body) : body)
  }
  req.push(null)
}

function suppressErrorLog() {
  const orig = console.error
  console.error = () => {}
  return () => { console.error = orig }
}

// ── readBody ────────────────────────────────────────────────────────────────

describe('readBody', () => {
  it('reads complete body', async () => {
    const req = mkIncoming({ method: 'POST' })
    pushBody(req, 'hello world')
    const body = await readBody(req)
    assert.equal(body.toString(), 'hello world')
  })

  it('reads empty body', async () => {
    const req = mkIncoming({ method: 'POST' })
    pushBody(req, '')
    const body = await readBody(req)
    assert.equal(body.byteLength, 0)
  })

  it('rejects body exceeding maxSize via content-length', async () => {
    const req = mkIncoming({ method: 'POST', headers: { 'content-length': '100' } })
    pushBody(req, 'x')
    await assert.rejects(() => readBody(req, 50), (err: any) => err.status === 413)
  })

  it('rejects body exceeding maxSize mid-stream', async () => {
    const req = mkIncoming({ method: 'POST' })
    pushBody(req, 'x'.repeat(20))
    await assert.rejects(() => readBody(req, 5), (err: any) => err.status === 413)
  })

  it('accepts body exactly at maxSize', async () => {
    const req = mkIncoming({ method: 'POST' })
    pushBody(req, 'abcde')
    const body = await readBody(req, 5)
    assert.equal(body.toString(), 'abcde')
  })

  it('reads chunked body', async () => {
    const req = mkIncoming({ method: 'POST' })
    req.push(Buffer.from('hel'))
    req.push(Buffer.from('lo'))
    req.push(null)
    const body = await readBody(req)
    assert.equal(body.toString(), 'hello')
  })

  it('handles non-numeric content-length gracefully', async () => {
    const req = mkIncoming({ method: 'POST', headers: { 'content-length': 'abc' } })
    pushBody(req, 'ok')
    const body = await readBody(req, 100)
    assert.equal(body.toString(), 'ok')
  })

  it('returns empty buffer when body is absent for POST', async () => {
    const req = mkIncoming({ method: 'POST' })
    pushBody(req, '')
    const body = await readBody(req)
    assert.equal(body.byteLength, 0)
  })
})

// ── createRequest ───────────────────────────────────────────────────────────

describe('createRequest', () => {
  it('creates Request with URL and method', () => {
    const body = Buffer.from('hello')
    const req = mkIncoming({ url: '/path?x=1', method: 'POST', headers: { 'content-type': 'text/plain' } })
    const [request, query] = createRequest(req, body)
    assert.equal(request.url, 'http://localhost/path?x=1')
    assert.equal(request.method, 'POST')
    assert.equal(query.x, '1')
  })

  it('strips body for GET method', () => {
    const body = Buffer.from('ignored')
    const req = mkIncoming({ url: '/', method: 'GET' })
    const [request] = createRequest(req, body)
    assert.equal(request.body, null)
  })

  it('strips body for HEAD method', () => {
    const body = Buffer.from('ignored')
    const req = mkIncoming({ url: '/', method: 'HEAD' })
    const [request] = createRequest(req, body)
    assert.equal(request.body, null)
  })

  it('includes body for POST method', async () => {
    const body = Buffer.from('data')
    const req = mkIncoming({ url: '/', method: 'POST' })
    const [request] = createRequest(req, body)
    assert.ok(request.body)
    assert.equal(await request.text(), 'data')
  })

  it('joins array headers with comma', () => {
    const body = Buffer.alloc(0)
    const req = mkIncoming({ headers: { accept: ['text/html', 'application/json'] as any } })
    const [request] = createRequest(req, body)
    assert.equal(request.headers.get('accept'), 'text/html, application/json')
  })

  it('filters out undefined header values', () => {
    const body = Buffer.alloc(0)
    const req = mkIncoming({ headers: { 'x-present': 'yes', 'x-absent': undefined as any } })
    const [request] = createRequest(req, body)
    assert.equal(request.headers.get('x-present'), 'yes')
    assert.equal(request.headers.get('x-absent'), null)
  })

  it('defaults method to GET when req.method is undefined', () => {
    const body = Buffer.alloc(0)
    const req = mkIncoming()
    ;(req as any).method = undefined
    const [request] = createRequest(req, body)
    assert.equal(request.method, 'GET')
  })

  it('defaults url to / when req.url is empty', () => {
    const body = Buffer.alloc(0)
    const req = mkIncoming()
    req.url = ''
    const [request] = createRequest(req, body)
    assert.equal(new URL(request.url).pathname, '/')
  })

  it('preserves non-ASCII URL-encoded path', () => {
    const body = Buffer.alloc(0)
    const req = mkIncoming({ url: '/search?q=hello%20world' })
    const [request, query] = createRequest(req, body)
    assert.equal(query.q, 'hello world')
  })

  it('strips empty body for POST method', () => {
    const body = Buffer.alloc(0)
    const req = mkIncoming({ url: '/', method: 'POST' })
    const [request] = createRequest(req, body)
    assert.equal(request.body, null)
  })

  it('uppercases lowercase method', () => {
    const body = Buffer.alloc(0)
    const req = mkIncoming({ method: 'post' })
    const [request] = createRequest(req, body)
    assert.equal(request.method, 'POST')
  })
})

// ── sendResponse ────────────────────────────────────────────────────────────

describe('sendResponse', () => {
  it('writes status, headers, and body', async () => {
    let writeHeadArgs: any[] = []
    let ended = false
    const mockRes = {
      writeHead: (...args: any[]) => { writeHeadArgs = args },
      write: () => {},
      end: () => { ended = true },
    } as any

    const resp = new Response('hello', {
      status: 201,
      statusText: 'Created',
      headers: { 'x-custom': 'val' },
    })

    await sendResponse(mockRes as ServerResponse, resp)
    assert.equal(writeHeadArgs[0], 201)
    assert.equal(writeHeadArgs[1], 'Created')
    assert.equal(ended, true)
  })

  it('preserves multiple Set-Cookie headers', async () => {
    const headerBag: Record<string, string | string[]> = {}
    const mockRes = {
      writeHead: (_status: number, _text: string, hdrs: Record<string, string | string[]>) => { Object.assign(headerBag, hdrs) },
      write: () => {},
      end: () => {},
    } as any

    let r = new Response('ok')
    r = setCookie(r, 'a', '1')
    r = setCookie(r, 'b', '2')

    await sendResponse(mockRes as ServerResponse, r)
    const cookies = headerBag['Set-Cookie'] ?? headerBag['set-cookie']
    assert.ok(Array.isArray(cookies), 'Set-Cookie should be an array')
    assert.equal((cookies as string[]).length, 2)
  })

  it('accumulates 3+ Set-Cookie headers into array', async () => {
    const headerBag: Record<string, string | string[]> = {}
    const mockRes = {
      writeHead: (_status: number, _text: string, hdrs: Record<string, string | string[]>) => { Object.assign(headerBag, hdrs) },
      write: () => {},
      end: () => {},
    } as any

    let r = new Response('ok')
    r = setCookie(r, 'a', '1')
    r = setCookie(r, 'b', '2')
    r = setCookie(r, 'c', '3')

    await sendResponse(mockRes as ServerResponse, r)
    const cookies = headerBag['Set-Cookie'] ?? headerBag['set-cookie']
    assert.ok(Array.isArray(cookies))
    assert.equal((cookies as string[]).length, 3)
  })

  it('handles response with statusText', async () => {
    let statusTextArg = ''
    const mockRes = {
      writeHead: (s: number, t: string, _h: any) => { statusTextArg = t },
      write: () => {},
      end: () => {},
    } as any
    const resp = new Response('ok', { status: 200, statusText: 'Custom Message' })
    await sendResponse(mockRes as ServerResponse, resp)
    assert.equal(statusTextArg, 'Custom Message')
  })

  it('handles response with null body', async () => {
    let ended = false
    const mockRes = {
      writeHead: () => {},
      end: () => { ended = true },
    } as any

    const resp = new Response(null, { status: 204 })
    await sendResponse(mockRes as ServerResponse, resp)
    assert.equal(ended, true)
  })

  it('writes streaming body in chunks', async () => {
    const chunks: any[] = []
    const mockRes = {
      writeHead: () => {},
      write: (c: any) => { chunks.push(c) },
      end: () => {},
    } as any

    const stream = new ReadableStream({
      start(ctrl) { ctrl.enqueue('part1'); ctrl.enqueue('part2'); ctrl.close() },
    })
    const resp = new Response(stream as any, { status: 200 })
    await sendResponse(mockRes as ServerResponse, resp)
    assert.ok(chunks.length >= 2, 'should write at least 2 chunks')
  })

  it('does not call write when body is absent', async () => {
    let writeCalled = false
    const mockRes = {
      writeHead: () => {},
      write: () => { writeCalled = true },
      end: () => {},
    } as any

    const resp = new Response(null, { status: 304 })
    await sendResponse(mockRes as ServerResponse, resp)
    assert.equal(writeCalled, false)
  })
})

// ── serve ───────────────────────────────────────────────────────────────────

describe('serve', () => {
  it('handles GET request', async () => {
    const { server, url } = await createTestServer(() => new Response('hello'))
    const res = await fetch(url)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'hello')
    server.stop()
  })

  it('handles POST with body echo', async () => {
    const { server, url } = await createTestServer(async (req) => {
      const body = await req.text()
      return new Response(body, { status: 201 })
    })
    const res = await fetch(url, { method: 'POST', body: 'test data' })
    assert.equal(res.status, 201)
    assert.equal(await res.text(), 'test data')
    server.stop()
  })

  it('passes response headers through', async () => {
    const { server, url } = await createTestServer(() =>
      new Response('ok', { headers: { 'x-custom': 'value', 'content-type': 'text/plain' } }),
    )
    const res = await fetch(url)
    assert.equal(res.headers.get('x-custom'), 'value')
    assert.equal(res.headers.get('content-type'), 'text/plain')
    server.stop()
  })

  it('provides ctx.query from URL', async () => {
    const { server, url } = await createTestServer((req, ctx) =>
      Response.json(ctx.query),
    )
    const res = await fetch(`${url}?foo=bar&baz=qux`)
    const data = await res.json() as Record<string, string>
    assert.equal(data.foo, 'bar')
    assert.equal(data.baz, 'qux')
    server.stop()
  })

  it('returns 500 on handler error', async () => {
    const { server, url } = await createTestServer(() => {
      throw new Error('boom')
    })
    const res = await fetch(url)
    assert.equal(res.status, 500)
    assert.match(await res.text(), /Internal Server Error/)
    server.stop()
  })

  it('server.stop() closes the server', async () => {
    const server = serve(() => new Response('ok'), { port: 0 })
    await server.ready
    const port = server.port
    server.stop()
    await assert.rejects(() => fetch(`http://localhost:${port}`))
  })

  it('rejects body exceeding maxBodySize', async () => {
    const handler: Handler = async (req) => new Response(await req.text())
    const server = serve(handler, { port: 0, maxBodySize: 5 })
    await server.ready
    const res = await fetch(`http://localhost:${server.port}`, { method: 'POST', body: 'too large' })
    assert.equal(res.status, 413)
    server.stop()
  })

  it('accepts body within maxBodySize', async () => {
    const handler: Handler = async (req) => new Response(await req.text())
    const server = serve(handler, { port: 0, maxBodySize: 100 })
    await server.ready
    const res = await fetch(`http://localhost:${server.port}`, { method: 'POST', body: 'small' })
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'small')
    server.stop()
  })

  it('AbortSignal prevents server from starting', async () => {
    const ac = new AbortController()
    ac.abort()
    const server = serve(() => new Response('ok'), { port: 0, signal: ac.signal })
    await server.ready
    assert.equal(server.port, 0)
    server.stop()
  })

  it('AbortSignal aborts a running server', async () => {
    const ac = new AbortController()
    const server = serve(() => new Response('ok'), { port: 0, signal: ac.signal })
    await server.ready
    const port = server.port
    assert.ok(port > 0)

    const done = new Promise<void>((resolve) => {
      const check = setInterval(() => {
        const addr = server.port
        if (addr === 0) {
          clearInterval(check)
          resolve()
        }
      }, 5)
    })

    ac.abort()
    await done
  })

  it('uses custom hostname', async () => {
    const server = serve(() => new Response('ok'), { port: 0, hostname: '127.0.0.1' })
    await server.ready
    assert.ok(server.port > 0)
    assert.equal(server.hostname, '127.0.0.1')
    server.stop()
  })

  it('handles concurrent requests', async () => {
    const { server, url } = await createTestServer((req) => {
      return new Response('ok')
    })
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        fetch(`${url}?i=${i}`).then(r => r.status),
      ),
    )
    results.forEach(s => assert.equal(s, 200))
    server.stop()
  })

  it('handles 302 redirect response', async () => {
    const { server, url } = await createTestServer(() =>
      new Response(null, { status: 302, headers: { Location: '/other' } }),
    )
    const res = await fetch(url, { redirect: 'manual' })
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('Location'), '/other')
    server.stop()
  })

  it('handles arbitrary URL paths', async () => {
    const { server, url } = await createTestServer(() => new Response('ok'))
    const res = await fetch(`${url}/nonexistent`)
    assert.equal(res.status, 200)
    server.stop()
  })

  it('passes WebSocket upgrade handler to server', async () => {
    let upgraded = false
    const handler: Handler = () => new Response('ok')
    const wsHandler = () => { upgraded = true }
    const server = serve(handler, { port: 0, websocket: wsHandler })
    await server.ready
    assert.ok(server.port > 0)
    server.stop()
  })

  it('preserves multiple Set-Cookie headers in sendResponse', async () => {
    const { server, url } = await createTestServer(() => {
      let res = new Response('ok')
      res = setCookie(res, 'a', '1')
      res = setCookie(res, 'b', '2')
      return res
    })
    const res = await fetch(url)
    const cookies = res.headers.getSetCookie?.() ?? [res.headers.get('Set-Cookie')!]
    assert.ok(Array.isArray(cookies) ? cookies.length >= 2 : true)
    server.stop()
  })

  it('handles HEAD method without body', async () => {
    const { server, url } = await createTestServer(() => new Response('body'))
    const res = await fetch(url, { method: 'HEAD' })
    assert.equal(res.status, 200)
    server.stop()
  })

  it('returns correct hostname and port', async () => {
    const server = serve(() => new Response('ok'), { port: 0 })
    await server.ready
    assert.ok(server.port > 0)
    assert.ok(server.hostname.length > 0)
    server.stop()
  })

  it('handles handler returning async response', async () => {
    const { server, url } = await createTestServer(async () => {
      await new Promise(r => setTimeout(r, 5))
      return new Response('delayed')
    })
    const res = await fetch(url)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'delayed')
    server.stop()
  })

  it('registers SIGTERM/SIGINT listeners with default shutdown', async () => {
    const beforeTerm = process.listenerCount('SIGTERM')
    const beforeInt = process.listenerCount('SIGINT')
    const server = serve(() => new Response('ok'), { port: 0 })
    await server.ready
    assert.equal(process.listenerCount('SIGTERM'), beforeTerm + 1)
    assert.equal(process.listenerCount('SIGINT'), beforeInt + 1)
    server.stop()
    const afterTerm = process.listenerCount('SIGTERM')
    const afterInt = process.listenerCount('SIGINT')
    assert.equal(afterTerm, beforeTerm, 'listener cleaned up after stop')
    assert.equal(afterInt, beforeInt, 'listener cleaned up after stop')
  })

  it('does not register shutdown listeners when shutdown: false', async () => {
    const beforeTerm = process.listenerCount('SIGTERM')
    const beforeInt = process.listenerCount('SIGINT')
    const server = serve(() => new Response('ok'), { port: 0, shutdown: false })
    await server.ready
    assert.equal(process.listenerCount('SIGTERM'), beforeTerm)
    assert.equal(process.listenerCount('SIGINT'), beforeInt)
    server.stop()
  })

  it('stop() is idempotent', async () => {
    const server = serve(() => new Response('ok'), { port: 0, shutdown: false })
    await server.ready
    assert.ok(server.port > 0)
    server.stop()
    server.stop()
    server.stop()
    assert.equal(server.port, 0)
  })

  it('server error handler logs and resolves ready on listen failure', async () => {
    const blocker = http.createServer((_req, res) => res.end('blocker'))
    await new Promise<void>(r => blocker.listen(0, () => r()))
    const blockerPort = (blocker.address() as { port: number }).port

    const restore = suppressErrorLog()
    let errorMsg = ''
    console.error = ((...args: any[]) => { errorMsg = args.join(' ') }) as any

    const server = serve(() => new Response('ok'), { port: blockerPort, hostname: '127.0.0.1', shutdown: false })
    await server.ready
    assert.ok(errorMsg.includes('Failed to start server'), `got: ${errorMsg}`)
    assert.equal(server.port, 0, 'port is 0 when listen fails')
    restore()
    server.stop()
    blocker.close()
  })

  it('default hostname is 0.0.0.0', async () => {
    const server = serve(() => new Response('ok'), { port: 0 })
    await server.ready
    assert.equal(server.hostname, '0.0.0.0')
    server.stop()
  })
})

// ── createTestServer ────────────────────────────────────────────────────────

describe('createTestServer', () => {
  it('starts a server and returns url', async () => {
    const { server, url } = await createTestServer(() => new Response('hello'))
    const res = await fetch(url)
    assert.equal(await res.text(), 'hello')
    server.stop()
  })

  it('returns correct url format', async () => {
    const { server, url } = await createTestServer(() => new Response('ok'))
    assert.match(url, /^http:\/\/localhost:\d+$/)
    server.stop()
  })

  it('does not register shutdown listeners', async () => {
    const beforeTerm = process.listenerCount('SIGTERM')
    const beforeInt = process.listenerCount('SIGINT')
    const { server, url } = await createTestServer(() => new Response('ok'))
    const res = await fetch(url)
    assert.equal(res.status, 200)
    assert.equal(process.listenerCount('SIGTERM'), beforeTerm, 'createTestServer must not add SIGTERM listeners')
    assert.equal(process.listenerCount('SIGINT'), beforeInt, 'createTestServer must not add SIGINT listeners')
    server.stop()
  })

  it('returns server with correct shape', async () => {
    const { server, url } = await createTestServer(() => new Response('ok'))
    assert.ok(typeof server.stop === 'function')
    assert.ok(typeof server.port === 'number')
    assert.ok(server.port > 0)
    assert.ok(typeof server.hostname === 'string')
    assert.ok(server.ready instanceof Promise)
    assert.ok(url.startsWith('http://localhost:'))
    server.stop()
  })

  it('works with async handler', async () => {
    const { server, url } = await createTestServer(async (req) => {
      await new Promise(r => setTimeout(r, 3))
      const body = await req.text()
      return new Response(body)
    })
    const res = await fetch(url, { method: 'POST', body: 'async-data' })
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'async-data')
    server.stop()
  })
})
