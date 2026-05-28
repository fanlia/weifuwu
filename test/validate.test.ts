import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import { Router } from '../router.ts'
import { validate } from '../validate.ts'

describe('validate', () => {
  it('validates body with Zod schema', async () => {
    const r = new Router()
      .post('/users',
        validate({ body: z.object({ name: z.string(), age: z.number() }) }),
        async (req, ctx) => Response.json(ctx.parsed?.body),
      )

    const res = await r.handler()(
      new Request('http://localhost/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice', age: 30 }),
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const data = await res.json() as Record<string, unknown>
    assert.deepEqual(data, { name: 'Alice', age: 30 })
  })

  it('rejects invalid body with 400', async () => {
    const r = new Router()
      .post('/users',
        validate({ body: z.object({ name: z.string().min(1) }) }),
        () => new Response('ok'),
      )

    const res = await r.handler()(
      new Request('http://localhost/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '' }),
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 400)
    const data = await res.json() as Record<string, unknown>
    assert.ok((data as any).issues)
  })

  it('validates query params', async () => {
    const r = new Router()
      .get('/search',
        validate({ query: z.object({ q: z.string(), page: z.coerce.number().optional() }) }),
        (req, ctx) => Response.json(ctx.parsed?.query),
      )

    const res = await r.handler()(
      new Request('http://localhost/search?q=hello&page=2'),
      { params: {}, query: { q: 'hello', page: '2' } } as any,
    )
    assert.equal(res.status, 200)
    const data = await res.json() as Record<string, unknown>
    assert.deepEqual(data, { q: 'hello', page: 2 })
  })

  it('validates params', async () => {
    const r = new Router()
      .get('/:id',
        validate({ params: z.object({ id: z.string().length(24) }) }),
        (req, ctx) => Response.json(ctx.parsed?.params),
      )

    const res = await r.handler()(
      new Request('http://localhost/507f1f77bcf86cd799439011'),
      { params: { id: '507f1f77bcf86cd799439011' }, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const data = await res.json() as Record<string, unknown>
    assert.deepEqual(data, { id: '507f1f77bcf86cd799439011' })
  })

  it('rejects invalid params with 400', async () => {
    const r = new Router()
      .get('/:id',
        validate({ params: z.object({ id: z.string().length(24) }) }),
        () => new Response('ok'),
      )

    const res = await r.handler()(
      new Request('http://localhost/bad-id'),
      { params: { id: 'bad-id' }, query: {} } as any,
    )
    assert.equal(res.status, 400)
  })

  it('validates both body and query simultaneously', async () => {
    const r = new Router()
      .post('/data',
        validate({
          body: z.object({ value: z.number() }),
          query: z.object({ token: z.string() }),
        }),
        (req, ctx) => Response.json(ctx.parsed),
      )

    const res = await r.handler()(
      new Request('http://localhost/data?token=abc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 42 }),
      }),
      { params: {}, query: { token: 'abc' } } as any,
    )
    assert.equal(res.status, 200)
    const data = await res.json() as Record<string, unknown>
    assert.deepEqual(data, { body: { value: 42 }, query: { token: 'abc' } })
  })

  it('passes through when no schemas provided', async () => {
    const r = new Router()
      .post('/data',
        validate({}),
        () => new Response('ok'),
      )

    const res = await r.handler()(
      new Request('http://localhost/data', {
        method: 'POST',
        body: JSON.stringify({ x: 1 }),
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })
})
