import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { useAction } from '../use-action.ts'

describe('useAction', () => {
  it('exports expected interface', () => {
    assert.equal(typeof useAction, 'function')
  })
})
