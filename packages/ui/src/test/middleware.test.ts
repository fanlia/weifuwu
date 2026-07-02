/**
 * Tests for index.ts — weifuwuiAssets() middleware
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', '..', 'dist')

// Dynamically import after ensuring dist exists
import { weifuwuiAssets } from '../index.ts'

describe('weifuwuiAssets()', () => {
  it('should return a handler function', () => {
    const handler = weifuwuiAssets()
    assert.equal(typeof handler, 'function')
  })

  it('should serve weifuwu-ui.js', async () => {
    const handler = weifuwuiAssets()
    const req = new Request('http://localhost/_ui/weifuwu-ui.js')
    const res = await handler(req)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'application/javascript')
    const body = await res.text()
    assert.ok(body.includes('weifuwu'))  // contains the runtime
  })

  it('should serve weifuwu-ui.css', async () => {
    const handler = weifuwuiAssets()
    const req = new Request('http://localhost/_ui/weifuwu-ui.css')
    const res = await handler(req)
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'text/css')
    const body = await res.text()
    assert.ok(body.includes('wui-btn'))  // contains CSS components
  })

  it('should return 404 for unknown paths', async () => {
    const handler = weifuwuiAssets()
    const req = new Request('http://localhost/_ui/nonexistent.js')
    const res = await handler(req)
    assert.equal(res.status, 404)
  })

  it('should set cache headers', async () => {
    const handler = weifuwuiAssets()
    const req = new Request('http://localhost/_ui/weifuwu-ui.js')
    const res = await handler(req)
    const cache = res.headers.get('cache-control')
    assert.ok(cache?.includes('public'))
    assert.ok(cache?.includes('max-age'))
  })

  it('should serve JS bundle that contains core API exports', async () => {
    const handler = weifuwuiAssets()
    const req = new Request('http://localhost/_ui/weifuwu-ui.js')
    const res = await handler(req)
    const body = await res.text()
    // The IIFE bundle should contain the core APIs
    assert.ok(body.includes('ref') || body.includes('html') || body.includes('render'))
  })
})
