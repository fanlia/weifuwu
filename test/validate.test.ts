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

  it('validates headers schema', async () => {
    const r = new Router()
      .get('/check',
        validate({ headers: z.object({ 'x-api-key': z.string().min(1) }) }),
        (req, ctx) => Response.json(ctx.parsed?.headers),
      )

    const res = await r.handler()(
      new Request('http://localhost/check', { headers: { 'x-api-key': 'abc' } }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const data = await res.json() as any
    assert.equal(data['x-api-key'], 'abc')
  })

  it('rejects invalid headers with 400', async () => {
    const r = new Router()
      .get('/check',
        validate({ headers: z.object({ 'x-api-key': z.string().min(1) }) }),
        () => new Response('ok'),
      )

    const res = await r.handler()(
      new Request('http://localhost/check', { headers: {} }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 400)
  })

  it('parses JSON body with application/json Content-Type', async () => {
    const r = new Router()
      .post('/data',
        validate({ body: z.object({ name: z.string() }) }),
        (req, ctx) => Response.json(ctx.parsed?.body),
      )

    const res = await r.handler()(
      new Request('http://localhost/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice' }),
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const data = await res.json() as any
    assert.equal(data.name, 'Alice')
  })

  it('keeps raw string body for text/plain Content-Type', async () => {
    const r = new Router()
      .post('/data',
        validate({ body: z.string() }),
        (req, ctx) => Response.json({ body: ctx.parsed?.body }),
      )

    const res = await r.handler()(
      new Request('http://localhost/data', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'raw text',
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const data = await res.json() as any
    assert.equal(data.body, 'raw text')
  })

  it('skips body validation for GET method even with body schema', async () => {
    const r = new Router()
      .get('/data',
        validate({ body: z.object({ name: z.string() }) }),
        () => new Response('ok'),
      )

    const res = await r.handler()(
      new Request('http://localhost/data', { method: 'GET' }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('returns 400 when POST body is null', async () => {
    const r = new Router()
      .post('/data',
        validate({ body: z.object({ name: z.string() }) }),
        () => new Response('ok'),
      )

    const res = await r.handler()(
      new Request('http://localhost/data', { method: 'POST' }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 400)
  })

  it('preserves existing ctx.parsed values from upstream middleware', async () => {
    const r = new Router()
      .use((req, ctx, next) => {
        ctx.parsed = { ...ctx.parsed, existingField: 'preserved' }
        return next(req, ctx)
      })
      .post('/data',
        validate({ body: z.object({ value: z.number() }) }),
        (req, ctx) => Response.json(ctx.parsed),
      )

    const res = await r.handler()(
      new Request('http://localhost/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 42 }),
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const data = await res.json() as any
    assert.equal(data.existingField, 'preserved')
    assert.equal(data.body.value, 42)
  })

  it('parses application/x-www-form-urlencoded body into Record<string, string>', async () => {
    const r = new Router()
      .post('/data',
        validate({ body: z.object({ name: z.string(), age: z.string() }) }),
        (req, ctx) => Response.json(ctx.parsed?.body),
      )

    const res = await r.handler()(
      new Request('http://localhost/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'name=Alice&age=30',
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const data = await res.json() as any
    assert.equal(data.name, 'Alice')
    assert.equal(data.age, '30')
  })

  it('parses form body without Zod schema when validate() has no schemas', async () => {
    const r = new Router()
      .post('/contact',
        validate(),
        (req, ctx) => Response.json(ctx.parsed?.body as Record<string, string>),
      )

    const res = await r.handler()(
      new Request('http://localhost/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'email=test@test.com&message=hello',
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const data = await res.json() as any
    assert.equal(data.email, 'test@test.com')
    assert.equal(data.message, 'hello')
  })

  it('URL-encoded form with duplicate keys uses last value', async () => {
    const r = new Router()
      .post('/data',
        validate(),
        (req, ctx) => Response.json(ctx.parsed?.body as Record<string, string>),
      )

    const res = await r.handler()(
      new Request('http://localhost/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'key=a&key=b',
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const data = await res.json() as any
    assert.equal(data.key, 'b')
  })

  it('skips body validation for HEAD method', async () => {
    const r = new Router()
      .head('/data',
        validate({ body: z.object({ name: z.string() }) }),
        () => new Response('ok'),
      )

    const res = await r.handler()(
      new Request('http://localhost/data', { method: 'HEAD' }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('returns 400 when POST body is empty string', async () => {
    const r = new Router()
      .post('/data',
        validate({ body: z.object({ name: z.string() }) }),
        () => new Response('ok'),
      )

    const res = await r.handler()(
      new Request('http://localhost/data', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '',
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 400)
  })

  it('parses JSON for application/vnd.api+json content-type', async () => {
    const r = new Router()
      .post('/data',
        validate({ body: z.object({ name: z.string() }) }),
        (req, ctx) => Response.json(ctx.parsed?.body),
      )

    const res = await r.handler()(
      new Request('http://localhost/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/vnd.api+json' },
        body: JSON.stringify({ name: 'Alice' }),
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const data = await res.json() as any
    assert.equal(data.name, 'Alice')
  })

  it('keeps raw string for unknown content-type after JSON parse failure', async () => {
    const r = new Router()
      .post('/data',
        validate({ body: z.string() }),
        (req, ctx) => Response.json({ body: ctx.parsed?.body }),
      )

    const res = await r.handler()(
      new Request('http://localhost/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: 'raw bytes here',
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const data = await res.json() as any
    assert.equal(data.body, 'raw bytes here')
  })

  it('keeps raw string when JSON body fails to parse under application/json', async () => {
    const r = new Router()
      .post('/data',
        validate({ body: z.string() }),
        (req, ctx) => Response.json({ body: ctx.parsed?.body }),
      )

    const res = await r.handler()(
      new Request('http://localhost/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-valid-json',
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const data = await res.json() as any
    assert.equal(data.body, 'not-valid-json')
  })
})
