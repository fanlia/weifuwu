import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../core/router.ts'
import { logger } from '../core/logger.ts'

function mkCtx() { return { params: {}, query: {} } as any }

describe('logger', () => {
  it('passes through response unchanged', async () => {
    const r = new Router().use(logger()).get('/', () => new Response('ok'))
    const res = await r.handler()(new Request('http://localhost/'), mkCtx())
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'ok')
  })

  it('supports combined format', async () => {
    const r = new Router()
      .use(logger({ format: 'combined' }))
      .get('/test', () => new Response('ok'))
    const res = await r.handler()(new Request('http://localhost/test?x=1'), mkCtx())
    assert.equal(res.status, 200)
  })

  it('supports json format', async () => {
    const r = new Router()
      .use(logger({ format: 'json' }))
      .get('/test', () => new Response('ok'))
    const res = await r.handler()(new Request('http://localhost/test'), mkCtx())
    assert.equal(res.status, 200)
  })
})
