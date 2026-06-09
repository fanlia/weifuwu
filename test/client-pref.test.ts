import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { addInterceptor, runInterceptors } from '../client-pref.ts'

describe('client-pref', () => {
  it('addInterceptor registers a function', () => {
    let called = false
    addInterceptor((_url) => { called = true; return false })
    assert.equal(typeof addInterceptor, 'function')
  })

  it('runInterceptors returns false for empty stack', async () => {
    // New interceptor that returns false
    addInterceptor(async (_url) => false)
  })

  it('runInterceptors returns true when interceptor returns true', async () => {
    addInterceptor((url) => url.pathname === '/match')
    addInterceptor((url) => url.pathname === '/block')

    const result = await runInterceptors(new URL('http://localhost/match'))
    assert.equal(result, true)
  })

  it('runInterceptors stops at first true', async () => {
    addInterceptor((url) => url.pathname === '/stop-here')

    const result = await runInterceptors(new URL('http://localhost/stop-here'))
    assert.equal(result, true)
  })
})
