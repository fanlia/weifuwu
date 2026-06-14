import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { testApp, type TestResponse } from '../test-utils.ts'

describe('testApp', () => {
  it('GET returns response', async () => {
    const app = testApp()
    app.get('/hello', () => new Response('world'))

    const res = await app.getReq('/hello').send()
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'world')
  })

  it('POST with JSON body', async () => {
    const app = testApp()
    app.post('/echo', async (req) => {
      const body = await req.json()
      return Response.json(body)
    })

    const res = await app.postReq('/echo').body({ hello: 'world' }).send()

    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { hello: 'world' })
  })

  it('sets ctx.user via withUser', async () => {
    const app = testApp()
    app.get('/me', (_req, ctx) => {
      return Response.json({ id: (ctx.user as any)?.id })
    })

    const res = await app.getReq('/me').withUser({ id: 42, email: 'a@b.com' }).send()

    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { id: 42 })
  })

  it('path params work', async () => {
    const app = testApp()
    app.get('/users/:id', (_req, ctx) => {
      return Response.json({ id: ctx.params.id, name: ctx.query.name })
    })

    const res = await app.getReq('/users/42?name=Alice').send()
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { id: '42', name: 'Alice' })
  })

  it('middleware applies', async () => {
    const app = testApp()
    app.use((_req, ctx, next) => {
      ctx.testFlag = 'set'
      return next(_req, ctx as any)
    })
    app.get('/flag', (_req, ctx) => {
      return new Response((ctx as any).testFlag ?? 'not-set')
    })

    const res = await app.getReq('/flag').send()
    assert.equal(await res.text(), 'set')
  })

  it('handles 404', async () => {
    const app = testApp()
    const res = await app.getReq('/nonexistent').send()
    assert.equal(res.status, 404)
  })

  it('handles all HTTP methods', async () => {
    const app = testApp()
    app.get('/m', () => new Response('get'))
    app.post('/m', () => new Response('post'))
    app.put('/m', () => new Response('put'))
    app.patch('/m', () => new Response('patch'))
    app.delete('/m', () => new Response('delete'))

    assert.equal(
      await app
        .getReq('/m')
        .send()
        .then((r) => r.text()),
      'get',
    )
    assert.equal(
      await app
        .postReq('/m')
        .send()
        .then((r) => r.text()),
      'post',
    )
    assert.equal(
      await app
        .putReq('/m')
        .send()
        .then((r) => r.text()),
      'put',
    )
    assert.equal(
      await app
        .patchReq('/m')
        .send()
        .then((r) => r.text()),
      'patch',
    )
    assert.equal(
      await app
        .deleteReq('/m')
        .send()
        .then((r) => r.text()),
      'delete',
    )
  })

  it('custom header', async () => {
    const app = testApp()
    app.get('/headers', (req) => {
      return new Response(req.headers.get('x-custom') ?? 'none')
    })

    const res = await app.getReq('/headers').header('X-Custom', 'my-value').send()

    assert.equal(await res.text(), 'my-value')
  })

  it('with mixin for any ctx property', async () => {
    const app = testApp()
    app.get('/ctx', (_req, ctx) => {
      return Response.json({
        tenant: (ctx as any).tenant,
        flag: (ctx as any).flag,
      })
    })

    const res = await app
      .getReq('/ctx')
      .with({ tenant: { id: 't1', name: 'Test', role: 'admin' }, flag: 123 } as any)
      .send()

    assert.deepEqual(await res.json(), {
      tenant: { id: 't1', name: 'Test', role: 'admin' },
      flag: 123,
    })
  })
})
