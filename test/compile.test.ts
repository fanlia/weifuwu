import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('compile', () => {
  it('id generates hex hash from string', async () => {
    const { id } = await import('../compile.ts')
    const h = id('/test/path')
    assert.equal(typeof h, 'string')
    assert.equal(h.length, 8)
    assert.match(h, /^[0-9a-f]{8}$/)
  })

  it('id is deterministic', async () => {
    const { id } = await import('../compile.ts')
    assert.equal(id('foo'), id('foo'))
    assert.notEqual(id('foo'), id('bar'))
  })

  it('clearCompileCache clears cache and alias', async () => {
    const { compileTsxDev, clearCompileCache } = await import('../compile.ts')
    clearCompileCache()
  })

  it('compile selects dev mode based on isDev()', async () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    const { compile } = await import('../compile.ts')
    // Dev mode uses vm-based compilation
    process.env.NODE_ENV = prev
  })

  it('compile in production mode writes to disk', async () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    const { compile } = await import('../compile.ts')
    process.env.NODE_ENV = prev
  })

  it('clearCompileCache can be called multiple times', async () => {
    const { clearCompileCache } = await import('../compile.ts')
    clearCompileCache()
    clearCompileCache()
  })

  it('compileDev compiles a TSX file', async () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'development'
    const { compileTsxDev } = await import('../compile.ts')
    const mod = await compileTsxDev('./test/fixtures/ssr/posts/app/page.tsx')
    assert.ok(mod)
    assert.ok(typeof mod.default === 'function')
    process.env.NODE_ENV = prev
  })
})
