import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { serve } from '../core/serve.ts'
import { Router } from '../core/router.ts'

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

describe('serve', () => {
  let servers: Awaited<ReturnType<typeof serve>>[] = []

  afterEach(async () => {
    for (const s of servers) await s.close()
    servers = []
  })

  function start(app: Router, opts = {}) {
    const s = serve(app, { port: 0, shutdown: false, ...opts })
    servers.push(s)
    return s
  }

  it('starts and responds to GET', async () => {
    const app = new Router().get('/', () => new Response('hello'))
    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/`)
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'hello')
  })

  it('handles POST with body', async () => {
    const app = new Router().post('/echo', async (req) => {
      const body = await req.text()
      return new Response(body)
    })
    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/echo`, {
      method: 'POST',
      body: 'hello world',
    })
    assert.equal(await res.text(), 'hello world')
  })

  it('handles JSON response', async () => {
    const app = new Router().get('/json', () => Response.json({ ok: true }))
    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/json`)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'application/json')
    const data = await res.json()
    assert.deepEqual(data, { ok: true })
  })

  it('returns 404 for unknown routes', async () => {
    const app = new Router().get('/known', () => new Response('ok'))
    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/unknown`)
    assert.equal(res.status, 404)
  })

  it('supports path params', async () => {
    const app = new Router().get('/users/:id', (req, ctx) => {
      return new Response(ctx.params.id)
    })
    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/users/42`)
    assert.equal(await res.text(), '42')
  })

  it('handles concurrent requests', async () => {
    const app = new Router().get('/delay', () => new Response('ok'))
    const s = start(app)
    await s.ready
    const results = await Promise.all([
      fetch(`http://localhost:${s.port}/delay`),
      fetch(`http://localhost:${s.port}/delay`),
      fetch(`http://localhost:${s.port}/delay`),
    ])
    for (const r of results) assert.equal(r.status, 200)
  })

  it('handles large response body', async () => {
    const body = 'x'.repeat(100_000)
    const app = new Router().get('/large', () => new Response(body))
    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/large`)
    assert.equal(await res.text(), body)
  })

  it('handles query params', async () => {
    const app = new Router().get('/search', (req, ctx) => {
      return Response.json(ctx.query)
    })
    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/search?q=test&page=1`)
    const data = await res.json()
    assert.equal(data.q, 'test')
    assert.equal(data.page, '1')
  })

  it('handles 500 errors gracefully', async () => {
    const app = new Router().get('/crash', () => { throw new Error('boom') })
    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/crash`)
    assert.equal(res.status, 500)
  })

  it('错误形态统一（S9）：500 = JSON { error }（serve 层与 router 层同形态）', async () => {
    const app = new Router()
      .get('/handler-crash', () => { throw new Error('boom') })
      .post('/body-crash', () => new Response('ok'))
    const s = start(app)
    await s.ready
    // router 层（handler 抛错）
    const r1 = await fetch(`http://localhost:${s.port}/handler-crash`)
    assert.equal(r1.status, 500)
    assert.equal(r1.headers.get('content-type'), 'application/json')
    assert.deepEqual(await r1.json(), { error: 'Internal Server Error' })
    // serve 层（413 body 超限——HttpError 由 serve catch 转 JSON；raw http 因 undici 剥 content-length）
    const raw413 = await new Promise<{ status: number; contentType: string; body: string }>((resolve) => {
      const req = http.request({ host: '127.0.0.1', port: s.port, path: '/body-crash', method: 'POST', headers: { 'content-length': '999999999' } }, (res) => {
        let body = ''
        res.on('data', (c) => (body += c))
        res.on('end', () => resolve({ status: res.statusCode ?? 0, contentType: String(res.headers['content-type']), body }))
      })
      req.end()
    })
    assert.equal(raw413.status, 413)
    assert.equal(raw413.contentType, 'application/json')
    assert.ok(JSON.parse(raw413.body).error)
  })

  it('handles custom error handler', async () => {
    const app = new Router()
      .get('/err', () => { throw new Error('custom') })
      .onError((err) => new Response(`error: ${err.message}`, { status: 400 }))
    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/err`)
    assert.equal(res.status, 400)
    assert.equal(await res.text(), 'error: custom')
  })

  it('sends x-trace-id header', async () => {
    const app = new Router().get('/', () => new Response('ok'))
    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/`)
    assert.ok(res.headers.get('x-trace-id'))
  })

  it('reuses incoming x-trace-id', async () => {
    const app = new Router().get('/', (req) => {
      return new Response('ok')
    })
    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/`, {
      headers: { 'x-trace-id': 'my-trace' },
    })
    assert.equal(res.headers.get('x-trace-id'), 'my-trace')
  })

  it('close() stops accepting connections', async () => {
    const app = new Router().get('/', () => new Response('ok'))
    const s = start(app)
    await s.ready
    await s.close()
    // After close, new connections should fail
    try {
      await fetch(`http://localhost:${s.port}/`)
      assert.fail('should not reach')
    } catch {
      // expected
    }
  })
})

// ── S1 流式正确性契约（SERVER-PERF-PLAN 波次 1——先红后绿） ──

describe('serve streaming (S1)', () => {
  let servers: Awaited<ReturnType<typeof serve>>[] = []

  afterEach(async () => {
    for (const s of servers) await s.close()
    servers = []
  })

  function start(app: Router, opts = {}) {
    const s = serve(app, { port: 0, shutdown: false, ...opts })
    servers.push(s)
    return s
  }

  it('propagates client disconnect to the stream (reader.cancel → SSE onAbort 链路)', async () => {
    let cancelled = false
    const app = new Router().get('/sse', () => {
      const stream = new ReadableStream({
        async start(controller) {
          const enc = new TextEncoder()
          for (let i = 0; i < 100; i++) {
            if (cancelled) return
            controller.enqueue(enc.encode(`data: ${i}\n\n`))
            await sleep(20)
          }
          controller.close()
        },
        cancel() { cancelled = true },
      })
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
    })
    const s = start(app)
    await s.ready

    // 客户端读 3 个 chunk 后断开
    await new Promise<void>((resolve) => {
      const req = http.get({ host: '127.0.0.1', port: s.port, path: '/sse' }, (res) => {
        let n = 0
        res.on('data', () => { if (++n === 3) { req.destroy(); resolve() } })
        res.on('error', () => {})
      })
      req.on('error', () => {})
    })
    await sleep(200)

    assert.equal(cancelled, true, 'stream cancel() 应在客户端断开时触发（否则上游 LLM 请求继续跑）')
  })

  it('applies backpressure — 慢客户端停止读取时源被拉停（缓冲有界）', async () => {
    const CHUNK = 64 * 1024
    const TOTAL = 300 // ~19MB
    let pulled = 0
    let cancelled = false
    const app = new Router().get('/big', () => {
      const stream = new ReadableStream({
        pull(controller) {
          if (cancelled) return
          pulled++
          if (pulled >= TOTAL) { controller.close(); return }
          controller.enqueue(Buffer.alloc(CHUNK, 1))
        },
        cancel() { cancelled = true },
      })
      return new Response(stream)
    })
    const s = start(app)
    await s.ready

    // 客户端读 1 个 chunk 后暂停 socket（不再读但保持连接）
    let client: http.ClientRequest | undefined
    await new Promise<void>((resolve) => {
      client = http.get({ host: '127.0.0.1', port: s.port, path: '/big' }, (res) => {
        res.once('data', () => res.pause())
        resolve()
      })
    })

    // 无背压实现：300 chunk 全部被拉出（写入 libuv/kernel 缓冲）
    await sleep(500)
    assert.ok(pulled < TOTAL / 2, `背压应拉停源（pulled=${pulled}/${TOTAL}——无界缓冲 = 内存泄漏）`)

    // 客户端断开 → 源收到 cancel
    client!.destroy()
    await sleep(150)
    assert.equal(cancelled, true, '断开后 cancel 触发')
  })

  it('completes normal streams without spurious cancel（回归守卫）', async () => {
    let cancelled = false
    const payload = 'x'.repeat(200_000)
    const app = new Router().get('/stream', () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(Buffer.from(payload))
          controller.close()
        },
        cancel() { cancelled = true },
      })
      return new Response(stream)
    })
    const s = start(app)
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/stream`)
    assert.equal(await res.text(), payload)
    await sleep(50)
    assert.equal(cancelled, false, '正常完成不应触发 cancel')
  })
})

// ── S2 优雅停机契约（SERVER-PERF-PLAN 波次 1） ──

describe('serve graceful shutdown (S2)', () => {
  it('stop() drains in-flight requests（在途请求先完成再关）', async () => {
    const app = new Router().get('/slow', async () => {
      await sleep(500)
      return Response.json({ done: true })
    })
    const s = serve(app, { port: 0, shutdown: false })
    await s.ready

    const p = fetch(`http://localhost:${s.port}/slow`).then((r) => r.json())
    await sleep(100) // 请求进入 in-flight
    const t0 = Date.now()
    await s.stop(2000)

    const data = await p
    assert.deepEqual(data, { done: true }, '在途请求应被排空而非砍断')
    assert.ok(Date.now() - t0 >= 300, 'stop() 应等待排空')
  })

  it('stop(0) force-closes immediately（超时强杀兜底）', async () => {
    const app = new Router().get('/slow', async () => {
      await sleep(500)
      return new Response('ok')
    })
    const s = serve(app, { port: 0, shutdown: false })
    await s.ready

    const p = fetch(`http://localhost:${s.port}/slow`)
    await sleep(100)
    await s.stop(0)
    await assert.rejects(p, undefined, 'timeoutMs=0 → 立即强杀')
  })

  it('stop() closes WebSocket connections with 1001', async () => {
    const { WebSocket } = await import('ws')
    const app = new Router()
    app.ws('/ws', { open: (ws) => { ws.send('hi') } })
    const s = serve(app, { port: 0, shutdown: false })
    await s.ready

    const closed = new Promise<number>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${s.port}/ws`)
      ws.on('close', (code) => resolve(code))
    })
    await sleep(100) // 客户端完成握手
    await s.stop(1000)
    // 超时守卫：旧代码破坏性断开后客户端 close 永不触发（正是本契约要修的缺口）
    const code = await Promise.race([closed, sleep(1500).then(() => 'timeout')])
    assert.notEqual(code, 'timeout', 'WS 客户端应收到 close 事件（破坏性断开下永不触发）')
    assert.equal(code, 1001, 'WS 应收到优雅关闭码 1001（非 1006 异常断开）')
  })

  it('SIGTERM drains in-flight then exits 0（滚动发布语义）', async () => {
    // 子进程 fixture：默认启用 shutdown（SIGTERM handler）——路径：core/ → ../index.ts = src/server/index.ts
    const entry = pathToFileURL(new URL('../index.ts', import.meta.url).pathname).href
    const fixture = [
      `import { serve, Router } from ${JSON.stringify(entry)}`,
      `const app = new Router().get('/slow', async () => {`,
      `  await new Promise((r) => setTimeout(r, 500))`,
      `  return Response.json({ done: true })`,
      `})`,
      `const s = serve(app, { port: 0 })`,
      `await s.ready`,
      `console.log('PORT:' + s.port)`,
    ].join('\n')

    const child = spawn(process.execPath, ['--input-type=module'], { stdio: ['pipe', 'pipe', 'pipe'] })
    child.stdin.write(fixture)
    child.stdin.end()

    const port = await new Promise<number>((resolve, reject) => {
      let buf = ''
      child.stdout!.on('data', (d: Buffer) => {
        buf += d.toString()
        const m = buf.match(/PORT:(\d+)/)
        if (m) resolve(Number(m[1]))
      })
      child.stderr!.on('data', (d: Buffer) => process.stderr.write(d))
      setTimeout(() => reject(new Error('fixture did not start')),
        Number(process.env.TEST_TIMEOUT ?? 5000)).unref()
    })

    const p = fetch(`http://127.0.0.1:${port}/slow`).then((r) => r.json())
    await sleep(100)
    child.kill('SIGTERM')

    const [exitCode, data] = await Promise.all([
      new Promise<number>((resolve) => child.on('exit', (c) => resolve(c ?? -1))),
      p,
    ])
    assert.deepEqual(data, { done: true }, 'SIGTERM 应排空在途请求')
    assert.equal(exitCode, 0)
  })
})
