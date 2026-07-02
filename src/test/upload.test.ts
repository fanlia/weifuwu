import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../core/router.ts'
import { upload } from '../middleware/upload.ts'

function mkCtx() { return { params: {}, query: {} } as any }

describe('upload', () => {
  it('passes through non-multipart requests', async () => {
    const r = new Router().use(upload()).post('/data', (req, ctx) => {
      return new Response('ok')
    })
    const res = await r.handler()(
      new Request('http://localhost/data', { method: 'POST', body: 'plain text' }),
      mkCtx())
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'ok')
  })

  it('parses multipart form fields', async () => {
    const form = new FormData()
    form.append('name', 'test')
    form.append('email', 'test@example.com')

    const r = new Router().use(upload()).post('/form', (req, ctx) => {
      return Response.json(ctx.parsed?.fields ?? {})
    })
    const res = await r.handler()(
      new Request('http://localhost/form', { method: 'POST', body: form }),
      mkCtx())
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.equal(data.name, 'test')
    assert.equal(data.email, 'test@example.com')
  })

  it('parses file upload', async () => {
    const form = new FormData()
    form.append('file', new Blob(['file content'], { type: 'text/plain' }), 'test.txt')

    const r = new Router().use(upload()).post('/upload', (req, ctx) => {
      const files = ctx.parsed?.files as any
      return Response.json({ name: files?.file?.name, size: files?.file?.buffer?.length })
    })
    const res = await r.handler()(
      new Request('http://localhost/upload', { method: 'POST', body: form }),
      mkCtx())
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.equal(data.name, 'test.txt')
    assert.equal(data.size, 12)
  })

  it('injects ctx.parsed with files and fields', async () => {
    const form = new FormData()
    form.append('title', 'hello')

    const r = new Router().use(upload()).post('/form', (req, ctx) => {
      return Response.json({ hasParsed: ctx.parsed !== undefined })
    })
    const res = await r.handler()(
      new Request('http://localhost/form', { method: 'POST', body: form }),
      mkCtx())
    const data = await res.json()
    assert.ok(data.hasParsed)
  })
})
