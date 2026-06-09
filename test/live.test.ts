import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const tmpDir = resolve(import.meta.dirname, '../.test-live')

describe('liveReload', () => {
  before(() => {
    rmSync(tmpDir, { recursive: true, force: true })
    mkdirSync(tmpDir, { recursive: true })
    writeFileSync(resolve(tmpDir, 'page.tsx'), 'export default () => <div>Hi</div>')
  })

  after(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('liveReload() returns a Router with close()', async () => {
    const { liveReload } = await import('../live.ts')
    const lr = liveReload(tmpDir)
    assert.equal(typeof lr.handler, 'function')
    assert.equal(typeof lr.close, 'function')
    lr.close()
  })

  it('liveReload serves vendor bundle', async () => {
    const { liveReload } = await import('../live.ts')
    const lr = liveReload(tmpDir)
    const res = await lr.handler()(new Request('http://localhost/__wfw/v/bundle'), { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    const body = await res.text()
    assert.ok(body.length > 0)
    assert.ok(body.includes('import') || body.includes('export') || body.includes('react'), 'vendor bundle should contain code')
    lr.close()
  })

  it('liveReload hot component endpoint returns 404 for unknown hash', async () => {
    const { liveReload } = await import('../live.ts')
    const lr = liveReload(tmpDir)
    const res = await lr.handler()(new Request('http://localhost/__wfw/h/unknownhash'), { params: { hash: 'unknownhash' }, query: {} } as any)
    assert.equal(res.status, 404)
    lr.close()
  })

  it('broadcastReload handles empty client set', async () => {
    const { broadcastReload } = await import('../live.ts')
    broadcastReload()
  })

  it('liveReload registers WebSocket route', async () => {
    const { liveReload } = await import('../live.ts')
    const lr = liveReload(tmpDir)
    assert.equal(typeof lr.websocketHandler, 'function')
    lr.close()
  })
})
