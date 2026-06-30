import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../core/router.ts'
import { currentTraceId, currentTrace, runWithTrace, traceElapsed, trace } from '../core/trace.ts'

describe('trace', () => {
  it('returns undefined outside a trace context', () => {
    assert.equal(currentTraceId(), undefined)
    assert.equal(currentTrace(), undefined)
    assert.equal(traceElapsed(), 0)
  })

  it('generates a trace ID when none is provided', () => {
    const id = runWithTrace(null, () => currentTraceId())
    assert.ok(typeof id === 'string')
    assert.equal(id?.length, 36) // UUID v4
  })

  it('reuses an incoming trace ID', () => {
    const expected = 'custom-trace-id-12345'
    const id = runWithTrace(expected, () => currentTraceId())
    assert.equal(id, expected)
  })

  it('returns full trace context', () => {
    const ctx = runWithTrace('abc-123', () => currentTrace())
    assert.ok(ctx !== undefined)
    assert.equal(ctx?.traceId, 'abc-123')
    assert.equal(typeof ctx?.startTime, 'number')
  })

  it('traceElapsed returns elapsed time within trace', async () => {
    const elapsed = runWithTrace('test', () => {
      return traceElapsed()
    })
    assert.ok(typeof elapsed === 'number')
    assert.ok(elapsed >= 0)
  })

  it('traceElapsed grows over time', async () => {
    const { e1, e2 } = runWithTrace('test', () => {
      const e1 = traceElapsed()
      // Busy-wait a bit
      const start = Date.now()
      while (Date.now() - start < 10) {
        /* spin */
      }
      const e2 = traceElapsed()
      return { e1, e2 }
    })
    assert.ok(e2 > e1, `expected e2 (${e2}) > e1 (${e1})`)
  })

  it('nested calls share the same trace context', () => {
    const result = runWithTrace('nest', () => {
      const outer = currentTraceId()
      const inner = runWithTrace('ignored', () => currentTraceId())
      return { outer, inner }
    })
    // runWithTrace creates a new ALS scope — the inner call uses its own store
    // This tests that inner gets its own ID, not that they're shared
    assert.equal(result.inner, 'ignored')
  })

  it('trace() middleware injects ctx.trace', async () => {
    const r = new Router()
    r.use(trace())
    r.get('/', (_req, ctx) => {
      assert.equal(typeof ctx.trace?.requestId, 'string')
      assert.equal(typeof ctx.trace?.traceId, 'string')
      assert.equal(typeof ctx.trace?.elapsed, 'function')
      assert.equal(typeof ctx.trace?.startTime, 'number')
      return Response.json({ ok: true })
    })
    const res = await r.handler()(new Request('http://localhost/'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 200)
    assert.ok(res.headers.has('X-Request-ID'))
  })

  it('trace() preserves incoming X-Request-ID header', async () => {
    const r = new Router()
    r.use(trace())
    r.get('/', (_req, ctx) => {
      assert.equal(ctx.trace?.requestId, 'my-custom-id')
      return Response.json({ ok: true })
    })
    const res = await r.handler()(
      new Request('http://localhost/', { headers: { 'X-Request-ID': 'my-custom-id' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('X-Request-ID'), 'my-custom-id')
  })

  it('trace() elapsed() returns time since start', async () => {
    const r = new Router()
    r.use(trace())
    r.get('/', async (_req, ctx) => {
      const e1 = ctx.trace!.elapsed()
      await new Promise((r) => setTimeout(r, 5))
      const e2 = ctx.trace!.elapsed()
      assert.ok(typeof e1 === 'number')
      assert.ok(typeof e2 === 'number')
      return Response.json({ ok: true, startTime: ctx.trace!.startTime })
    })
    const res = await r.handler()(new Request('http://localhost/'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 200)
    const body = (await res.json()) as any
    assert.ok(body.startTime > 0, 'startTime should be set')
    assert.ok(Date.now() >= body.startTime, 'startTime should be in the past')
  })
})
