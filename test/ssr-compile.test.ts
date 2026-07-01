import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import { loadModule, clearModuleCache, cachedModuleCount } from '../ssr/compile.ts'

const simplePage = resolve('test/fixtures/view/simple-page.ts')

describe('compile — module loader', () => {
  afterEach(() => {
    clearModuleCache()
  })

  it('loads a .ts module', async () => {
    const mod = await loadModule(simplePage)
    assert.ok(mod)
    assert.equal(typeof (mod as Record<string, unknown>).default, 'function')
  })

  it('caches loaded modules', async () => {
    const mod1 = await loadModule(simplePage)
    const mod2 = await loadModule(simplePage)
    // Same reference due to caching
    assert.equal(mod1, mod2)
    assert.equal(cachedModuleCount(), 1)
  })

  it('clears cache for a specific path', async () => {
    await loadModule(simplePage)
    assert.equal(cachedModuleCount(), 1)

    clearModuleCache(simplePage)
    assert.equal(cachedModuleCount(), 0)
  })

  it('clears entire cache', async () => {
    await loadModule(simplePage)
    assert.equal(cachedModuleCount(), 1)

    clearModuleCache()
    assert.equal(cachedModuleCount(), 0)
  })

  it('rejects for non-existent files', async () => {
    await assert.rejects(() => loadModule('./nonexistent-file.ts'), /Failed to load module/)
  })
})
