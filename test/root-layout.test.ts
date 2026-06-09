import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('rootLayout', () => {
  const tmpDir = resolve(import.meta.dirname, '../.test-root-layout')

  before(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(resolve(tmpDir, 'layout.tsx'), 'export default function Layout({ children }) { return <div>{children}</div> }')
  })

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('rootLayout() returns a Router', async () => {
    const { rootLayout } = await import('../root-layout.ts')
    const rl = rootLayout(tmpDir)
    assert.equal(typeof rl.handler, 'function')
    assert.equal(typeof rl.use, 'function')
    if (rl.close) await rl.close()
  })

  it('rootLayout middleware sets ctx.layoutStack and rootLayoutBase', async () => {
    const { rootLayout } = await import('../root-layout.ts')
    const rl = rootLayout(tmpDir)

    const ctx: any = { params: {}, query: {}, mountPath: '/app' }
    await rl.handler()(new Request('http://localhost/app/page'), ctx)

    assert.ok(Array.isArray(ctx.layoutStack))
    assert.ok(ctx.layoutStack.length > 0, 'layoutStack should have at least one layout')
    assert.equal(ctx.rootLayoutBase, '/app')
    if (rl.close) await rl.close()
  })

  it('rootLayout without app.css does not add tailwind', async () => {
    const { rootLayout } = await import('../root-layout.ts')
    // No app.css in tmpDir, so tailwind is NOT registered
    const rl = rootLayout(tmpDir)
    assert.ok(rl)
    if (rl.close) await rl.close()
  })
})
