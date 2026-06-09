import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('Head', () => {
  it('Head component is defined in module', async () => {
    // Load via compile since .tsx is not natively importable in Node.js tests
    const { compile } = await import('../compile.ts')
    const mod = await compile('./head.tsx')
    assert.equal(typeof mod.Head, 'function')
  })
})
