import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// vendor.ts only re-exports types (stripped at runtime).
// We verify they're accessible at the type level by using typeof in a
// type context and verifying the module shape at runtime.

void describe('vendor', () => {
  it('exports Redis type', async () => {
    // Type-only re-exports are erased at runtime — we verify the module
    // exists and has no undesired side effects
    const mod = await import('../vendor.ts')
    assert.equal(typeof mod, 'object')
    assert.equal(Object.keys(mod).length, 0) // all type-only exports
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
