import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, rm, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { Router } from '../router.ts'
import { upload } from '../upload.ts'

function createFormData(
  fields?: Record<string, string>,
  files?: Record<string, { name: string; data: string; type?: string }>,
): [Request, string] {
  const boundary = '----boundary123'
  const parts: string[] = []

  for (const [key, value] of Object.entries(fields ?? {})) {
    parts.push(`--${boundary}`)
    parts.push(`Content-Disposition: form-data; name="${key}"`)
    parts.push('')
    parts.push(value)
  }

  for (const [key, file] of Object.entries(files ?? {})) {
    parts.push(`--${boundary}`)
    parts.push(`Content-Disposition: form-data; name="${key}"; filename="${file.name}"`)
    if (file.type) parts.push(`Content-Type: ${file.type}`)
    parts.push('')
    parts.push(file.data)
  }

  parts.push(`--${boundary}--`)
  const body = parts.join('\r\n')

  const req = new Request('http://localhost/upload', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
    body,
  })

  return [req, boundary]
}

describe('upload', () => {
  it('parses fields from multipart form', async () => {
    const r = new Router().post('/upload', upload(), (req, ctx) =>
      Response.json(ctx.parsed?.fields),
    )

    const [req] = createFormData({ title: 'hello', desc: 'world' })
    const res = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    const data = (await res.json()) as Record<string, string>
    assert.deepEqual(data, { title: 'hello', desc: 'world' })
  })

  it('parses files in memory', async () => {
    const r = new Router().post('/upload', upload(), (req, ctx) => {
      const files = ctx.parsed?.files as Record<string, unknown>
      return Response.json(files)
    })

    const [req] = createFormData(
      {},
      {
        avatar: { name: 'photo.png', data: 'fakeimagedata', type: 'image/png' },
      },
    )
    const res = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    const data = (await res.json()) as Record<string, any>
    const file = data.avatar
    assert.equal(file.name, 'photo.png')
    assert.equal(file.type, 'image/png')
    assert.ok(file.size)
    assert.ok(file.buffer)
  })

  it('saves files to disk when dir is set', async () => {
    const uploadDir = resolve(tmpdir(), 'weifuwu-upload-test')
    await mkdir(uploadDir, { recursive: true })

    const r = new Router().post('/upload', upload({ dir: uploadDir }), (req, ctx) => {
      const files = ctx.parsed?.files as Record<string, any>
      return Response.json(files)
    })

    const [req] = createFormData(
      {},
      {
        doc: { name: 'test.txt', data: 'file content' },
      },
    )
    const res = await r.handler()(req, { params: {}, query: {} } as any)
    const data = (await res.json()) as Record<string, any>
    assert.ok(data.doc.path)
    const saved = await readFile(data.doc.path, 'utf-8')
    assert.equal(saved, 'file content')
    await rm(uploadDir, { recursive: true, force: true })
  })

  it('rejects oversized files', async () => {
    const r = new Router().post('/upload', upload({ maxFileSize: 5 }), () => new Response('ok'))

    const [req] = createFormData(
      {},
      {
        big: { name: 'big.txt', data: 'too large content' },
      },
    )
    const res = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res.status, 413)
  })

  it('rejects disallowed file types', async () => {
    const r = new Router().post(
      '/upload',
      upload({ allowedTypes: ['image/png'] }),
      () => new Response('ok'),
    )

    const [req] = createFormData(
      {},
      {
        bad: { name: 'script.exe', data: 'evil', type: 'application/x-msdownload' },
      },
    )
    const res = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res.status, 415)
  })

  it('passes through non-multipart requests', async () => {
    let reached = false
    const r = new Router().post(
      '/upload',
      upload(),
      (req, ctx, next) => {
        reached = true
        return next(req, ctx)
      },
      () => new Response('ok'),
    )

    const res = await r.handler()(
      new Request('http://localhost/upload', { method: 'POST', body: 'plain text' }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    assert.equal(reached, true)
  })

  it('accepts file with legitimate extension despite spoofed Content-Type', async () => {
    const r = new Router().post(
      '/upload',
      upload({ allowedTypes: ['image/png'] }),
      () => new Response('ok'),
    )

    const [req] = createFormData(
      {},
      {
        photo: { name: 'photo.png', data: 'pngdata', type: 'application/octet-stream' },
      },
    )
    const res = await r.handler()(req, { params: {}, query: {} } as any)
    // Extension .png matches allowed type image/png
    assert.equal(res.status, 200)
  })

  it('rejects when both client type and extension type are disallowed', async () => {
    const r = new Router().post(
      '/upload',
      upload({ allowedTypes: ['image/png'] }),
      () => new Response('ok'),
    )

    const [req] = createFormData(
      {},
      {
        bad: { name: 'script.exe', data: 'data', type: 'application/x-msdownload' },
      },
    )
    const res = await r.handler()(req, { params: {}, query: {} } as any)
    // .exe maps to nothing, application/x-msdownload not in allowedTypes → reject
    assert.equal(res.status, 415)
  })

  it('sanitizes null byte in filename', async () => {
    const uploadDir = resolve(tmpdir(), 'weifuwu-upload-null')
    const r = new Router().post('/upload', upload({ dir: uploadDir }), (req, ctx) => {
      const files = ctx.parsed?.files as Record<string, any>
      return Response.json(files)
    })

    const [req] = createFormData(
      {},
      {
        file: { name: 'evil\0.txt', data: 'content' },
      },
    )
    const res = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    const data = (await res.json()) as any
    // Null byte should be replaced with '_'
    assert.ok(!data.file.path.includes('\0'))
    assert.ok(data.file.path.includes('_.txt'))
    await rm(uploadDir, { recursive: true, force: true })
  })

  it('handles duplicate field names as array', async () => {
    const boundary = '----dupboundary'
    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="a.txt"',
      'Content-Type: text/plain',
      '',
      'content a',
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="b.txt"',
      'Content-Type: text/plain',
      '',
      'content b',
      `--${boundary}--`,
    ].join('\r\n')

    const req = new Request('http://localhost/upload', {
      method: 'POST',
      headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
      body,
    })
    const r = new Router().post('/upload', upload(), (req, ctx) => {
      const files = ctx.parsed?.files as Record<string, any>
      return Response.json(files)
    })

    const res = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    const data = (await res.json()) as any
    assert.ok(Array.isArray(data.file))
    assert.equal(data.file.length, 2)
    assert.equal(data.file[0].name, 'a.txt')
    assert.equal(data.file[1].name, 'b.txt')
  })

  it('handles empty multipart form with no fields', async () => {
    const r = new Router().post('/upload', upload(), (req, ctx) => {
      return Response.json({
        files: ctx.parsed?.files,
        fields: ctx.parsed?.fields,
      })
    })

    const [req] = createFormData()
    const res = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    const data = (await res.json()) as any
    assert.deepEqual(data.files, {})
    assert.deepEqual(data.fields, {})
  })

  it('returns 400 for invalid multipart body', async () => {
    const req = new Request('http://localhost/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/form-data; boundary=xxx' },
      body: 'not valid multipart',
    })
    const r = new Router().post('/upload', upload(), () => new Response('ok'))

    const res = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res.status, 400)
  })

  it('maxFileSize of 0 allows any file size', async () => {
    const r = new Router().post('/upload', upload({ maxFileSize: 0 }), (req, ctx) =>
      Response.json(ctx.parsed?.files),
    )
    const [req] = createFormData(undefined, {
      file: { name: 'large.txt', data: 'x'.repeat(1000), type: 'text/plain' },
    })
    const res = await r.handler()(req, { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    const data = (await res.json()) as any
    assert.equal(data.file.name, 'large.txt')
  })
})
