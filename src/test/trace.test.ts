import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  currentTraceId,
  currentTrace,
  runWithTrace,
  traceElapsed,
  trace,
} from '../core/trace.ts'

describe('runWithTrace', () => {
  it('sets trace context during execution', () => {
    let captured: string | undefined
    runWithTrace(null, () => {
      captured = currentTraceId()
    })
    assert.ok(captured)
    assert.ok(captured!.length > 0)
  })

  it('reuses provided trace ID', () => {
    const traceId = 'my-custom-trace-id'
    let captured: string | undefined
    runWithTrace(traceId, () => {
      captured = currentTraceId()
    })
    assert.equal(captured, traceId)
  })

  it('returns undefined outside runWithTrace', () => {
    assert.equal(currentTraceId(), undefined)
  })

  it('returns function result', () => {
    const result = runWithTrace(null, () => 42)
    assert.equal(result, 42)
  })

  it('supports async operations', async () => {
    const result = await runWithTrace(null, async () => {
      await new Promise(r => setTimeout(r, 10))
      return currentTraceId()
    })
    assert.ok(result)
  })

  it('nested runWithTrace preserves inner', () => {
    runWithTrace('outer', () => {
      runWithTrace('inner', () => {
        assert.equal(currentTraceId(), 'inner')
      })
      assert.equal(currentTraceId(), 'outer')
    })
  })
})

describe('currentTrace', () => {
  it('returns context with traceId and startTime', () => {
    runWithTrace('test-id', () => {
      const tc = currentTrace()
      assert.ok(tc)
      assert.equal(tc!.traceId, 'test-id')
      assert.ok(typeof tc!.startTime === 'number')
    })
  })

  it('returns undefined outside context', () => {
    assert.equal(currentTrace(), undefined)
  })
})

describe('traceElapsed', () => {
  it('returns milliseconds since start', async () => {
    runWithTrace(null, async () => {
      await new Promise(r => setTimeout(r, 20))
      const elapsed = traceElapsed()
      assert.ok(elapsed >= 15, `expected >=15ms, got ${elapsed}`)
    })
  })

  it('returns 0 outside context', () => {
    assert.equal(traceElapsed(), 0)
  })
})

describe('trace middleware', () => {
  it('injects ctx.trace with requestId from header', async () => {
    const mw = trace()
    const req = new Request('http://localhost/', {
      headers: { 'x-request-id': 'req-123' },
    })
    let captured: any

    await mw(req, {} as any, async (_req, ctx: any) => {
      captured = ctx.trace
      return new Response('ok')
    })

    assert.equal(captured.requestId, 'req-123')
    assert.equal(typeof captured.traceId, 'string')
    assert.equal(typeof captured.elapsed, 'function')
    assert.ok(captured.elapsed() >= 0)
  })

  it('generates requestId when header missing', async () => {
    const mw = trace()
    const req = new Request('http://localhost/')
    let captured: any

    await mw(req, {} as any, async (_req, ctx: any) => {
      captured = ctx.trace
      return new Response('ok')
    })

    assert.ok(captured.requestId.length > 0)
  })

  it('sets X-Request-ID header on response', async () => {
    const mw = trace()
    const req = new Request('http://localhost/')
    let response: Response | undefined

    await mw(req, {} as any, async (_req, _ctx: any) => {
      response = new Response('ok')
      return response
    })

    const res = await mw(req, {} as any, async () => new Response('ok'))
    assert.ok(res.headers.has('x-request-id'))
  })

  it('does not overwrite existing X-Request-ID', async () => {
    const mw = trace()
    const req = new Request('http://localhost/')
    const res = await mw(req, {} as any, async () => {
      return new Response('ok', { headers: { 'x-request-id': 'custom' } })
    })
    assert.equal(res.headers.get('x-request-id'), 'custom')
  })

  it('uses custom header name', async () => {
    const mw = trace({ header: 'x-correlation-id' })
    const req = new Request('http://localhost/', {
      headers: { 'x-correlation-id': 'corr-456' },
    })
    let captured: any

    await mw(req, {} as any, async (_req, ctx: any) => {
      captured = ctx.trace
      return new Response('ok')
    })

    assert.equal(captured.requestId, 'corr-456')
  })
})
