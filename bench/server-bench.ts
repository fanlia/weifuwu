/**
 * HTTP 层基线基准：serve() 裸路由 + 常用中间件组合的 req/s / p99 / 内存。
 * 用法: node bench/server-bench.ts  （10 秒内完成——R-01 纪律）
 */
import { performance } from 'node:perf_hooks'
import http from 'node:http'
import { serve, Router, cors, rateLimit } from '../src/server/index.ts'
import { MemoryRedis } from '../src/server/db/memory-redis.ts'

const CONCURRENCY = 64
const DURATION_MS = 3000

function bench(label: string, port: number, path = '/'): Promise<void> {
  return new Promise((resolve) => {
    let done = 0
    let errors = 0
    const latencies: number[] = []
    const t0 = performance.now()
    const deadline = t0 + DURATION_MS
    let inFlight = 0

    function fire() {
      if (performance.now() >= deadline) {
        if (inFlight === 0) finish()
        return
      }
      inFlight++
      const start = performance.now()
      const req = http.get({ host: '127.0.0.1', port, path }, (res) => {
        res.resume()
        res.on('end', () => {
          done++
          latencies.push(performance.now() - start)
          inFlight--
          if (performance.now() < deadline) fire()
          else if (inFlight === 0) finish()
        })
      })
      req.on('error', () => {
        errors++
        inFlight--
        if (performance.now() < deadline) fire()
        else if (inFlight === 0) finish()
      })
    }
    function finish() {
      const totalMs = performance.now() - t0
      latencies.sort((a, b) => a - b)
      const p50 = latencies[Math.floor(latencies.length * 0.5)] ?? 0
      const p99 = latencies[Math.floor(latencies.length * 0.99)] ?? 0
      console.log(
        `${label.padEnd(28)} ${((done / totalMs) * 1000).toFixed(0).padStart(6)} req/s   p50=${p50.toFixed(1)}ms  p99=${p99.toFixed(1)}ms  err=${errors}`,
      )
      resolve()
    }
    for (let i = 0; i < CONCURRENCY; i++) fire()
  })
}

const rss = () => (process.memoryUsage().rss / 1024 / 1024).toFixed(0)

// ── 场景 1：裸 JSON 路由 ──
const bare = new Router()
bare.get('/hello', () => Response.json({ ok: true, msg: 'hello world'.repeat(4) }))
bare.get('/param/:id/posts/:pid', (req, ctx) => Response.json({ id: ctx.params.id, pid: ctx.params.pid }))
const s1 = serve(bare, { port: 0, shutdown: false })
await s1.ready
console.log(`RSS start: ${rss()} MB`)
await bench('bare JSON (small)', s1.port, '/hello')
await bench('bare param route x2', s1.port, '/param/123/posts/456')

// ── 场景 2：+ cors ──
const withCors = new Router()
withCors.use(cors())
withCors.get('/hello', () => Response.json({ ok: true, msg: 'hello world'.repeat(4) }))
const s2 = serve(withCors, { port: 0, shutdown: false })
await s2.ready
await bench('+ cors', s2.port, '/hello')

// ── 场景 3：+ rateLimit（内存 redis——纯开销画像） ──
const withRl = new Router()
const mr = new MemoryRedis()
withRl.use(rateLimit({ redis: mr as any, windowMs: 60_000, max: 1_000_000, headers: false }))
withRl.get('/hello', () => Response.json({ ok: true, msg: 'hello world'.repeat(4) }))
const s3 = serve(withRl, { port: 0, shutdown: false })
await s3.ready
await bench('+ rateLimit(fixed, mem)', s3.port, '/hello')

// ── 场景 4：404 未命中（trie miss 路径） ──
await bench('404 miss', s1.port, '/nope/deep/path')

// ── 场景 5：POST 1KB JSON body ──
bare.post('/echo', async (req) => Response.json(await req.json()))
await bench('POST 1KB json echo', s1.port, '/echo')

console.log(`RSS end: ${rss()} MB`)
for (const s of [s1, s2, s3]) await s.stop()
process.exit(0)
