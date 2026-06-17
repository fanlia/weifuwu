import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { moduleServer, clearModuleCache } from '../module-server.ts'
import { Router } from '../router.ts'

describe('moduleServer', () => {
  it('returns a Router', () => {
    const r = moduleServer({ root: '/tmp' })
    assert.ok(r instanceof Router)
  })

  it('404s for non-existent file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mod-test-'))
    const r = moduleServer({ root: dir })
    const handler = r.handler()
    const res = await handler(new Request('http://localhost/__wfw/m/nonexistent.tsx'), {
      params: { '*': 'nonexistent.tsx' },
      query: {},
    })
    assert.equal(res.status, 404)
  })

  it('404s for non-ts/tsx extension', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mod-test-'))
    const r = moduleServer({ root: dir })
    const handler = r.handler()
    const res = await handler(new Request('http://localhost/__wfw/m/test.js'), {
      params: { '*': 'test.js' },
      query: {},
    })
    assert.equal(res.status, 404)
  })

  it('serves a compiled .ts file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mod-test-'))
    writeFileSync(join(dir, 'greet.ts'), 'export const greet = (name: string) => `Hello ${name}`')
    clearModuleCache()

    const r = moduleServer({ root: dir })
    const handler = r.handler()
    const res = await handler(new Request('http://localhost/__wfw/m/greet.ts'), {
      params: { '*': 'greet.ts' },
      query: {},
    })
    assert.equal(res.status, 200)
    const text = await res.text()
    assert.ok(text.includes('Hello'))
    assert.ok(res.headers.get('content-type')?.includes('javascript'))
  })

  it('serves a compiled .tsx file with JSX', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mod-test-'))
    writeFileSync(join(dir, 'hello.tsx'), 'export default () => <div>Hello</div>')
    clearModuleCache()

    const r = moduleServer({ root: dir })
    const handler = r.handler()
    const res = await handler(new Request('http://localhost/__wfw/m/hello.tsx'), {
      params: { '*': 'hello.tsx' },
      query: {},
    })
    assert.equal(res.status, 200)
    const text = await res.text()
    assert.ok(text.includes('div') || text.includes('Hello'))
    assert.ok(res.headers.get('content-type')?.includes('javascript'))
  })
})
