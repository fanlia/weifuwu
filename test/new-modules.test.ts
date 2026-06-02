import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Context } from '../types.ts'
import { health } from '../health.ts'
import { i18n } from '../i18n.ts'
import { mailer } from '../mailer.ts'
import { createTestServer } from '../serve.ts'

describe('health', () => {
  it('returns 200 on /health', async () => {
    const r = health()
    const res = await r.handler()(
      new Request('http://localhost/health'),
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
      new Request('http://localhost/health'),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 503)
  })
})

describe('i18n', () => {
  let tmpDir: string
  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'i18n-test-'))
    writeFileSync(join(tmpDir, 'en.json'), JSON.stringify({ greeting: 'Hello, {name}!', bye: 'Bye' }))
    writeFileSync(join(tmpDir, 'zh.json'), JSON.stringify({ greeting: '你好，{name}！', bye: '再见' }))
  })
  after(() => rmSync(tmpDir, { recursive: true, force: true }))

  it('detects locale from Accept-Language', async () => {
    const mw = i18n({ dir: tmpDir })
    const ctx = { params: {}, query: {} } as Context
    await mw(
      new Request('http://localhost/', { headers: { 'Accept-Language': 'zh-CN,zh;q=0.9' } }),
      ctx,
      async () => new Response('ok'),
    )
    assert.equal(ctx.locale, 'zh')
    assert.equal(ctx.t!('greeting', { name: 'World' }), '你好，World！')
  })

  it('falls back to default locale', async () => {
    const mw = i18n({ dir: tmpDir, defaultLocale: 'en' })
    const ctx = { params: {}, query: {} } as Context
    await mw(
      new Request('http://localhost/'),
      ctx,
      async () => new Response('ok'),
    )
    assert.equal(ctx.locale, 'en')
    assert.equal(ctx.t!('greeting', { name: 'World' }), 'Hello, World!')
  })

  it('detects locale from cookie', async () => {
    const mw = i18n({ dir: tmpDir, defaultLocale: 'en' })
    const ctx = { params: {}, query: {} } as Context
    await mw(
      new Request('http://localhost/', { headers: { Cookie: 'locale=zh' } }),
      ctx,
      async () => new Response('ok'),
    )
    assert.equal(ctx.locale, 'zh')
  })

  it('returns key when translation is missing', async () => {
    const mw = i18n({ dir: tmpDir, defaultLocale: 'en' })
    const ctx = { params: {}, query: {} } as Context
    await mw(
      new Request('http://localhost/'),
      ctx,
      async () => new Response('ok'),
    )
    assert.equal(ctx.t!('nonexistent'), 'nonexistent')
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
