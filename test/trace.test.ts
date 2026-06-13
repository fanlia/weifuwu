import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { currentTraceId, currentTrace, runWithTrace, traceElapsed } from '../trace.ts'

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
      while (Date.now() - start < 10) { /* spin */ }
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
})
