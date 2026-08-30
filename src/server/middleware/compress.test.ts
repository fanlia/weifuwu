/**
 * compress 中间件契约测试（SERVER-PERF-PLAN S7——波次 3）
 *
 * 用 raw http 客户端：undici fetch 默认注入 Accept-Encoding 且透明解压——
 * 无法断言压缩响应的原始字节。
 *
 * 诚实裁剪：❌ zstd / ❌ 动态字典 / ❌ 静态压缩（serveStatic 预压缩探测覆盖）。
 * SSE（text/event-stream）跳过——流式语义与压缩缓冲化冲突（破坏逐 token 推送）。
 */

import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { gunzipSync, brotliDecompressSync } from 'node:zlib'
import { serve } from '../core/serve.ts'
import { Router } from '../core/router.ts'
import { compress } from './compress.ts'

/** raw http GET——返回原始头与字节（undici 之外） */
function rawGet(port: number, path: string, headers: Record<string, string> = {}): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path, headers }, (res) => {
      const chunks: Buffer[] = []
      res.on('data', (c: Buffer) => chunks.push(c))
      res.on('end', () => {
        const h: Record<string, string> = {}
        for (const [k, v] of Object.entries(res.headers)) h[k] = Array.isArray(v) ? v.join(', ') : (v ?? '')
        resolve({ status: res.statusCode ?? 0, headers: h, body: Buffer.concat(chunks) })
      })
    }).on('error', reject)
  })
}

describe('compress (S7)', () => {
  const servers: Awaited<ReturnType<typeof serve>>[] = []
  afterEach(async () => {
    for (const s of servers) await s.close()
    servers.length = 0
  })

  function start(mw: ReturnType<typeof compress>, dataRoute: () => Response) {
    const app = new Router()
    app.use(mw)
    app.get('/data', dataRoute)
    app.get('/sse', () => {
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(new TextEncoder().encode('data: hello\n\n'))
          c.close()
        },
      })
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } })
    })
    const s = serve(app, { port: 0, shutdown: false })
    servers.push(s)
    return s
  }

  const bigData = { items: Array.from({ length: 50 }, (_, i) => ({ id: i, name: `item-${i}`, desc: 'x'.repeat(40) })) }

  it('JSON ≥ 阈值 + Accept-Encoding: gzip → Content-Encoding: gzip，内容可解压', async () => {
    const s = start(compress(), () => Response.json(bigData))
    await s.ready
    const res = await rawGet(s.port, '/data', { 'Accept-Encoding': 'gzip' })
    assert.equal(res.headers['content-encoding'], 'gzip')
    assert.equal(res.headers['vary'], 'Accept-Encoding', '缓存正确性——Vary 必须')
    const json = JSON.parse(gunzipSync(res.body).toString('utf-8'))
    assert.equal(json.items.length, 50)
  })

  it('br 优先（Accept-Encoding: br, gzip → brotli）', async () => {
    const s = start(compress(), () => Response.json(bigData))
    await s.ready
    const res = await rawGet(s.port, '/data', { 'Accept-Encoding': 'br, gzip' })
    assert.equal(res.headers['content-encoding'], 'br')
    assert.equal(JSON.parse(brotliDecompressSync(res.body).toString('utf-8')).items.length, 50)
  })

  it('body < 阈值（Content-Length 可判定）→ 不压缩', async () => {
    const small = '{"ok":true}'
    const s = start(compress(), () => new Response(small, {
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(small.length) },
    }))
    await s.ready
    const res = await rawGet(s.port, '/data', { 'Accept-Encoding': 'gzip' })
    assert.ok(!res.headers['content-encoding'], '小响应不压缩（压缩得不偿失）')
    assert.deepEqual(JSON.parse(res.body.toString()), { ok: true })
  })

  it('不可压缩类型（image/png）→ 跳过', async () => {
    const s = start(compress(), () => new Response(Buffer.alloc(4096, 1), { headers: { 'Content-Type': 'image/png' } }))
    await s.ready
    const res = await rawGet(s.port, '/data', { 'Accept-Encoding': 'gzip' })
    assert.ok(!res.headers['content-encoding'], '不压缩——无 content-encoding')
  })

  it('SSE（text/event-stream）→ 跳过（流式逐 token 推送不被缓冲化）', async () => {
    const s = start(compress(), () => new Response('never'))
    await s.ready
    const res = await rawGet(s.port, '/sse', { 'Accept-Encoding': 'gzip' })
    assert.ok(!res.headers['content-encoding'], '不压缩——无 content-encoding')
    assert.ok(res.body.toString().includes('data: hello'))
  })

  it('无 Accept-Encoding（identity）→ 不压缩', async () => {
    const s = start(compress(), () => Response.json(bigData))
    await s.ready
    const res = await rawGet(s.port, '/data', { 'Accept-Encoding': 'identity' })
    assert.ok(!res.headers['content-encoding'], '不压缩——无 content-encoding')
    assert.deepEqual(JSON.parse(res.body.toString()), bigData)
  })
})
