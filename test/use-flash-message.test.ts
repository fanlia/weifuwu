import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

describe('useFlashMessage', () => {
  it('exports expected interface', async () => {
    const { useFlashMessage } = await import('../use-flash-message.ts')
    assert.equal(typeof useFlashMessage, 'function')
  })
})
