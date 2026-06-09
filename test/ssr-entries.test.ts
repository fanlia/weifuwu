import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ssrEntries, type SsrEntry } from '../ssr-entries.ts'

describe('ssrEntries', () => {
  it('is an empty Map on startup', () => {
    assert.ok(ssrEntries instanceof Map)
  })

  it('can store and retrieve SsrEntry', () => {
    const key = '/test-page'
    const entry: SsrEntry = { path: '/test-page' }
    ssrEntries.set(key, entry)
    assert.equal(ssrEntries.get(key), entry)
    assert.equal(ssrEntries.get(key)!.path, '/test-page')
    ssrEntries.delete(key)
  })

  it('can hold multiple entries', () => {
    ssrEntries.set('/a', { path: '/a' })
    ssrEntries.set('/b', { path: '/b' })
    assert.equal(ssrEntries.size, 2)
    ssrEntries.delete('/a')
    ssrEntries.delete('/b')
  })
})
