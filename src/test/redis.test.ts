import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { redis } from '../redis/index.ts'
import { Router } from '../core/router.ts'
import { RedisPool } from '../db/redis/pool.ts'

function startServer(app: Router): Promise<any> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      app
        .handler()(new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers as any }), { params: {}, query: {} })
        .then((r: any) => {
          res.writeHead(r.status, { 'content-type': 'application/json' })
          res.end(JSON.stringify(r.body ?? ''))
        })
        .catch(() => {
          res.writeHead(500)
          res.end()
        })
    })
    server.listen(0, () => resolve(server))
  })
}

describe('redis', () => {
  const r = redis()
  const c = r.redis

  after(async () => {
    // 只清理本文件用过的 key（CS-04 真库并行纪律：flushdb 会清掉并行测试的计数）
    await c.del('test:key', 'test:del', 'test:counter')
    await r.close()
  })

  it('set and get string', async () => {
    await c.set('test:key', 'hello')
    const val = await c.get('test:key')
    assert.equal(val, 'hello')
  })

  it('delete key', async () => {
    await c.set('test:del', 'bye')
    await c.del('test:del')
    const val = await c.get('test:del')
    assert.equal(val, null)
  })

  it('increments counter', async () => {
    await c.set('test:counter', '0')
    await c.incr('test:counter')
    await c.incr('test:counter')
    assert.equal(await c.get('test:counter'), '2')
  })

  it('ctx.redis is injected by middleware', async () => {
    let captured: any
    await r(
      new Request('http://localhost/'),
      {} as any,
      async (req, ctx: any) => {
        captured = ctx.redis
        return new Response('ok')
      })
    assert.ok(captured)
  })
})

describe('redis onCommand + traceId propagation', () => {
  it('onCommand 收到命令遥测（命令/参数/耗时/行数）', async () => {
    const calls: string[] = []
    const rds = redis({ onCommand: (cmd, args, dur, traceId) => calls.push(`${cmd}|${args[0]}|${dur >= 0}|${traceId ?? ''}`) })
    const pool = (rds as any).redis as RedisPool
    try {
      await pool.set('wf:obs:k', 'v')
      await pool.get('wf:obs:k')
      assert.ok(calls.length >= 2)
      assert.match(calls[0], /SET\|wf:obs:k\|true\|/)
      assert.match(calls[1], /GET\|wf:obs:k\|true\|/)
    } finally {
      await pool.close()
    }
  })

  it('x-trace-id 头 → ALS → onCommand 第 4 参数（对齐 postgres）', async () => {
    const calls: (string | undefined)[] = []
    const rds = redis({
      onCommand: (_cmd, _args, _dur, traceId) => calls.push(traceId),
    })
    const app = new Router()
    app.use(rds)
    app.get('/rc', async (_req, ctx) => {
      await (ctx.redis as RedisPool).set('wf:trace:k', '1')
      return new Response('ok')
    })
    const server = await startServer(app)
    const port = (server.address() as any).port
    try {
      await fetch(`http://localhost:${port}/rc`, { headers: { 'x-trace-id': 'trace-aaa' } })
      await fetch(`http://localhost:${port}/rc`, { headers: { 'x-trace-id': 'trace-bbb' } })
      assert.deepEqual(calls.slice(-2), ['trace-aaa', 'trace-bbb'])
    } finally {
      server.close()
      await (rds as any).close()
    }
  })
})
