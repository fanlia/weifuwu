import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import './setup.ts'

void describe('happy-dom setup', () => {
  it('has document', () => {
    assert.ok(typeof document === 'object')
  })

  it('has HTMLElement', () => {
    assert.ok(typeof HTMLElement === 'function')
  })

  it('has WebSocket', () => {
    assert.ok(typeof WebSocket === 'function')
  })
})
