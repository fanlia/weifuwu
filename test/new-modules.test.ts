import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { Context } from '../types.ts'
import { health } from '../health.ts'
import { mailer } from '../mailer.ts'
import { createTestServer } from '../serve.ts'

describe('health', () => {
  it('returns 200 on /health', async () => {
    const r = health()
    const res = await r.handler()(
      new Request('http://localhost/'),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'OK')
  })

  it('supports custom path', async () => {
    const r = health({ path: '/healthz' })
    const res = await r.handler()(
      new Request('http://localhost/healthz'),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 200)
  })

  it('returns 503 when custom check fails', async () => {
    const r = health({
      check: async () => { throw new Error('db down') },
    })
    const res = await r.handler()(
      new Request('http://localhost/'),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 503)
  })
})

describe('mailer', () => {
  it('sends via custom send function', async () => {
    const sent: any[] = []
    const m = mailer({
      send: async (opts) => { sent.push(opts) },
    })
    await m.send({ to: 'a@b.com', subject: 'Test', text: 'Hello' })
    assert.equal(sent.length, 1)
    assert.equal(sent[0].to, 'a@b.com')
    assert.equal(sent[0].subject, 'Test')
    await m.close()
  })

  it('throws without transport config', async () => {
    const m = mailer({})
    await assert.rejects(
      () => m.send({ to: 'a@b.com', subject: 'x', text: 'x' }),
      /no transport configured/,
    )
    await m.close()
  })
})

describe('createTestServer', () => {
  it('starts a server and returns url', async () => {
    const { server, url } = await createTestServer(() => new Response('hello'))
    const res = await fetch(url)
    assert.equal(await res.text(), 'hello')
    server.stop()
  })
})
