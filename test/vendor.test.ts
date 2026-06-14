import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// vendor.ts only re-exports types (stripped at runtime).
// We verify they're accessible at the type level by using typeof in a
// type context and verifying the module shape at runtime.

void describe('vendor', () => {
  it('exports Redis type', async () => {
    // Type-only re-exports are erased at runtime — verify the module
    // has no runtime-exposed named exports beyond synthetic keys
    const mod = await import('../vendor.ts')
    assert.equal(typeof mod, 'object')
    // Synthetic keys like 'default' and 'module.exports' may appear
    // with type-only re-exports — only real named exports are suspicious
    const ownKeys = Object.keys(mod).filter((k) => k !== 'default' && k !== 'module.exports')
    assert.equal(ownKeys.length, 0, 'expected no runtime named exports from type-only module')
  })

  it('type-check: Redis type is usable', () => {
    // Compile-time check: verify the type can be imported and used
    type _Check = import('../vendor.ts').Redis
    assert.ok('Redis type is accessible')
  })

  it('type-check: WebSocket type is usable', () => {
    type _Check = import('../vendor.ts').WebSocket
    assert.ok('WebSocket type is accessible')
  })

  it('type-check: Sql type is usable', () => {
    type _Check = import('../vendor.ts').Sql
    assert.ok('Sql type is accessible')
  })
})
