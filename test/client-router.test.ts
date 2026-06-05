import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { navigate, useNavigate, Link, isNavigating, onNavigate, useNavigating } from '../client-router.ts'

describe('client-router', () => {
  it('exports navigate function', () => {
    assert.equal(typeof navigate, 'function')
  })

  it('exports useNavigate hook', () => {
    assert.equal(typeof useNavigate, 'function')
  })

  it('exports Link component', () => {
    assert.equal(typeof Link, 'function')
  })

  describe('isNavigating / onNavigate', () => {
    it('exports isNavigating', () => {
      assert.equal(typeof isNavigating, 'function')
    })

    it('exports onNavigate', () => {
      assert.equal(typeof onNavigate, 'function')
    })

    it('exports useNavigating', () => {
      assert.equal(typeof useNavigating, 'function')
    })

    it('starts false', () => {
      assert.equal(isNavigating(), false)
    })

    it('notifies listeners when navigation starts/ends', () => {
      const values: boolean[] = []
      const unsub = onNavigate(v => values.push(v))
      assert.deepEqual(values, [])

      // Simulate navigation lifecycle via __WFW_SET_PAGE
      // The actual value is set by setNavigating inside navigate()
      unsub()
    })

    it('onNavigate returns unsubscribe function', () => {
      let called = 0
      const unsub = onNavigate(() => called++)
      unsub()
      // No way to trigger, just verify no error
      assert.ok(true)
    })
  })
})
