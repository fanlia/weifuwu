import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { applyTheme, useTheme } from '../client-theme.ts'

describe('client-theme', () => {
  it('useTheme is a function', () => {
    assert.equal(typeof useTheme, 'function')
  })

  it('applyTheme is exported', () => {
    assert.equal(typeof applyTheme, 'function')
  })
})
