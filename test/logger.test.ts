import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../router.ts'
import { logger } from '../middleware.ts'

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
})
