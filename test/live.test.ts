import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Router } from '../router.ts'

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

  it('liveRouter() returns a Router', async () => {
    const { liveRouter } = await import('../live.ts')
    const r = liveRouter(tmpDir)
    assert.equal(typeof r.handler, 'function')
  })

  it('liveRouter hot component endpoint returns 404 for unknown hash', async () => {
    const { liveRouter } = await import('../live.ts')
    const r = liveRouter(tmpDir)
    const res = await r.handler()(new Request('http://localhost/__wfw/h/unknownhash'), {
      params: { hash: 'unknownhash' },
      query: {},
    } as any)
    assert.equal(res.status, 404)
  })

  it('broadcastReload handles empty client set', async () => {
    const { broadcastReload } = await import('../live.ts')
    broadcastReload()
  })

  it('liveWs() returns a WebSocketHandler', async () => {
    const { liveWs } = await import('../live.ts')
    const ws = liveWs()
    assert.equal(typeof ws, 'object')
    assert.equal(typeof ws.open, 'function')
  })
})
