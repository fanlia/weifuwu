import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Router } from '../router.ts'

const tmpDir = resolve(import.meta.dirname, '../.test-layout')

describe('layout', () => {
  before(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    mkdirSync(tmpDir, { recursive: true })
  })

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('injects layout component into ctx.layoutStack', async () => {
    writeFileSync(resolve(tmpDir, 'layout.tsx'), `
      import React from 'react'
      export default function Layout({ children }: { children: React.ReactNode }) {
        return <div id="layout">{children}</div>
      }
    `)

    const { layout } = await import('../layout.ts')
    const r = new Router()
    r.use('/test', layout(resolve(tmpDir, 'layout.tsx')))
    r.get('/test/page', (_req, ctx) => {
      assert.equal(ctx.layoutStack?.length, 1)
      assert.equal(ctx.layoutStack?.[0].path, resolve(tmpDir, 'layout.tsx'))
      return Response.json({ ok: true })
    })

    const res = await r.handler()(
      new Request('http://localhost/test/page'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('appends to existing layoutStack', async () => {
    writeFileSync(resolve(tmpDir, 'outer.tsx'), `
      import React from 'react'
      export default function Outer({ children }: { children: React.ReactNode }) {
        return <div id="outer">{children}</div>
      }
    `)
    writeFileSync(resolve(tmpDir, 'inner.tsx'), `
      import React from 'react'
      export default function Inner({ children }: { children: React.ReactNode }) {
        return <div id="inner">{children}</div>
      }
    `)

    const { layout } = await import('../layout.ts')
    const r = new Router()
    r.use('/test', layout(resolve(tmpDir, 'outer.tsx')))
    r.use('/test/sub', layout(resolve(tmpDir, 'inner.tsx')))
    r.get('/test/sub/page', (_req, ctx) => {
      assert.equal(ctx.layoutStack?.length, 2)
      return Response.json({ ok: true })
    })

    const res = await r.handler()(
      new Request('http://localhost/test/sub/page'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })

  it('returns 500 when layout file has no default export', async () => {
    writeFileSync(resolve(tmpDir, 'bad.tsx'), `
      export const notDefault = 42
    `)

    const { layout } = await import('../layout.ts')
    const r = new Router()
    r.use('/test', layout(resolve(tmpDir, 'bad.tsx')))
    r.get('/test/page', () => new Response('ok'))

    const res = await r.handler()(
      new Request('http://localhost/test/page'),
      { params: {}, query: {} } as any,
    )
    // The error is caught by router's error handler → 500
    assert.equal(res.status, 500)
  })
})
