import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  DbError,
  ProtocolError,
  ConnectionError,
  RetryableError,
  TimeoutError,
  ValidationError,
  isRetryable,
} from './errors.ts'

describe('db errors', () => {
  it('DbError is base with kind + code fields', () => {
    const e = new DbError('connection', 'boom')
    assert.ok(e instanceof Error)
    assert.equal(e.kind, 'connection')
    assert.equal(e.code, undefined)
    assert.equal(e.message, 'boom')
  })

  it('ProtocolError for unsupported features', () => {
    const e = new ProtocolError('unsupported', 'COPY binary not supported')
    assert.ok(e instanceof DbError)
    assert.equal(e.kind, 'protocol')
    assert.equal(e.code, 'UNSUPPORTED')
    assert.ok(e.message.includes('COPY binary'))
  })

  it('ConnectionError carries connect attempt info', () => {
    const e = new ConnectionError('refused', 3)
    assert.ok(e instanceof DbError)
    assert.equal(e.kind, 'connection')
    assert.equal(e.attempts, 3)
  })

  it('RetryableError marks retry-eligible errors', () => {
    const e = new RetryableError('deadlock detected', '40P01')
    assert.ok(e instanceof DbError)
    assert.equal(e.code, '40P01')
    assert.equal(isRetryable(e), true)
  })

  it('TimeoutError carries operation + ms', () => {
    const e = new TimeoutError('statement', 30_000)
    assert.ok(e instanceof DbError)
    assert.equal(e.kind, 'timeout')
    assert.equal(e.operation, 'statement')
    assert.equal(e.ms, 30_000)
  })

  it('ValidationError for bad data rejected before write', () => {
    const e = new ValidationError('deck_json must be a valid JSON object')
    assert.ok(e instanceof DbError)
    assert.equal(e.kind, 'validation')
  })

  it('plain errors are not retryable', () => {
    assert.equal(isRetryable(new Error('plain')), false)
  })
})
