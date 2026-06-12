import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../router.ts'
import { logger } from '../logger.ts'

function handler(text = 'ok') {
  return () => new Response(text)
}

describe('logger', () => {
  it('logs method, path and status', async () => {
    const logs: string[] = []
    mock.method(console, 'log', (msg: string) => { logs.push(msg) })

    const r = new Router()
      .use(logger())
      .get('/hello', handler())

    await r.handler()(new Request('http://localhost/hello'), { params: {}, query: {} } as any)

    assert.equal(logs.length, 1)
    assert.ok(logs[0]!.includes('GET'))
    assert.ok(logs[0]!.includes('/hello'))
    assert.ok(logs[0]!.includes('200'))

    mock.restoreAll()
  })

  it('combined format includes search params', async () => {
    const logs: string[] = []
    mock.method(console, 'log', (msg: string) => { logs.push(msg) })

    const r = new Router()
      .use(logger({ format: 'combined' }))
      .get('/search', handler())

    await r.handler()(new Request('http://localhost/search?q=test'), { params: {}, query: {} } as any)

    assert.ok(logs[0]!.includes('?q=test'))

    mock.restoreAll()
  })

  it('json format writes structured JSON to stderr', async (t) => {
    const events: string[] = []
    const orig = process.stderr.write
    ;(process.stderr as any).write = (chunk: string) => { events.push(chunk); return true }
    t.after(() => { (process.stderr as any).write = orig })

    const r = new Router()
      .use(logger({ format: 'json' }))
      .get('/test', () => new Response('ok'))

    await r.handler()(new Request('http://localhost/test'), { params: {}, query: {} } as any)

    assert.equal(events.length, 1)
    const event = JSON.parse(events[0]) as Record<string, unknown>
    assert.equal(event.level, 'info')
    assert.equal(event.method, 'GET')
    assert.equal(event.path, '/test')
    assert.equal(event.status, 200)
    assert.ok(typeof event.elapsed_ms === 'number')
    // traceId is optional — only present when request goes through serve()
    assert.ok(typeof event.timestamp === 'string')
  })
})
