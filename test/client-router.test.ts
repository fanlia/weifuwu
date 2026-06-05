import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { navigate, useNavigate, Link } from '../client-router.ts'

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
})
