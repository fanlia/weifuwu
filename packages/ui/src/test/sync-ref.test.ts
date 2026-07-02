/**
 * Tests for sync-ref.ts — ref + URL 双向绑定
 *
 * Note: Tests must set up JSDOM globals before importing sync-ref,
 * so globals are set at the top of the file before the import.
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!DOCTYPE html>', { url: 'http://localhost/' })
;(global as any).window = dom.window
;(global as any).location = dom.window.location
;(global as any).history = dom.window.history

import { syncRef } from '../sync-ref.ts'

describe('syncRef — pathname mode', () => {
  it('should initialize from location.pathname', () => {
    const route = syncRef()
    assert.equal(route.value, '/')
  })

  it('should update history on value change', () => {
    const route = syncRef('/')
    route.value = '/about'
    assert.equal(globalThis.location.pathname, '/about')
  })

  it('should support multiple route changes', () => {
    const route = syncRef('/')
    route.value = '/a'
    route.value = '/b'
    route.value = '/c'
    assert.equal(globalThis.location.pathname, '/c')
  })

  it('should use initial value when window is not available', () => {
    // Remove window to test fallback
    const origWindow = (global as any).window
    ;(global as any).window = undefined
    try {
      const route = syncRef('/fallback')
      assert.equal(route.value, '/fallback')
    } finally {
      ;(global as any).window = origWindow
    }
  })
})

describe('syncRef — search params mode', () => {
  it('should create URL param with initial value', () => {
    const page = syncRef('1', { key: 'page' })
    const url = new URL(globalThis.location.href)
    assert.equal(url.searchParams.get('page'), '1')
  })

  it('should update URL param on value change', () => {
    const tab = syncRef('inbox', { key: 'tab' })
    assert.equal(new URL(globalThis.location.href).searchParams.get('tab'), 'inbox')

    tab.value = 'sent'
    assert.equal(new URL(globalThis.location.href).searchParams.get('tab'), 'sent')
  })
})
