/**
 * Tests for error-boundary.ts
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { ref } from '../signal.ts'

const dom = new JSDOM('<!DOCTYPE html>', { url: 'http://localhost' })
;(global as any).document = dom.window.document
;(global as any).Node = dom.window.Node
;(global as any).HTMLElement = dom.window.HTMLElement
;(global as any).Text = dom.window.Text
;(global as any).Event = dom.window.Event
;(global as any).DocumentFragment = dom.window.DocumentFragment
;(global as any).location = dom.window.location

import { h } from '../h.ts'
import { render, reactiveRender } from '../render.ts'
import { errorBoundary, wrapWithErrorBoundary, onRenderError } from '../error-boundary.ts'

describe('errorBoundary', () => {
  it('should return normal result when no error', () => {
    const safe = errorBoundary(() => h('span', null, 'OK'))
    const result = safe()
    assert.equal((result as HTMLElement).textContent, 'OK')
  })

  it('should catch sync error and show default UI', () => {
    const safe = errorBoundary(() => {
      throw new Error('test error')
    })
    const result = safe() as HTMLElement
    assert.ok(result.textContent!.includes('Render Error'))
    assert.ok(result.textContent!.includes('test error'))
  })

  it('should use custom fallback when provided', () => {
    const safe = errorBoundary(
      () => { throw new Error('boom') },
      (err) => h('p', { style: 'color: red' }, `Custom: ${err.message}`),
    )
    const result = safe() as HTMLElement
    assert.equal(result.textContent, 'Custom: boom')
    assert.equal((result as HTMLElement).style.color, 'red')
  })

  it('should catch non-Error throws', () => {
    const safe = errorBoundary(() => { throw 'string error' as any })
    const result = safe() as HTMLElement
    assert.ok(result.textContent!.includes('Render Error'))
    assert.ok(result.textContent!.includes('string error'))
  })
})

describe('wrapWithErrorBoundary', () => {
  it('should pass through normal renders', () => {
    const safe = wrapWithErrorBoundary(() => h('div', null, 'hello'))
    assert.equal(safe().textContent, 'hello')
  })
})

describe('onRenderError', () => {
  it('should call global handler on error', () => {
    const errors: Error[] = []
    onRenderError((err) => errors.push(err))

    const safe = wrapWithErrorBoundary(() => {
      throw new Error('global test')
    })
    safe()
    assert.equal(errors.length, 1)
    assert.equal(errors[0].message, 'global test')
  })
})

describe('reactiveRender with error boundary', () => {
  it('should show error UI when template throws', () => {
    const container = dom.window.document.createElement('div')
    const trigger = ref(0)

    reactiveRender(container, () => {
      if (trigger.value > 0) throw new Error('render failed')
      return h('span', null, 'OK')
    })

    assert.equal(container.textContent, 'OK')

    trigger.value = 1
    // Should show error UI instead of crashing
    assert.ok(container.textContent!.includes('Render Error'))
    assert.ok(container.textContent!.includes('render failed'))
  })

  it('should recover after error on next render', () => {
    const container = dom.window.document.createElement('div')
    const trigger = ref(0)

    reactiveRender(container, () => {
      if (trigger.value === 1) throw new Error('temp error')
      return h('span', null, `State: ${trigger.value}`)
    })

    assert.equal(container.textContent, 'State: 0')

    trigger.value = 1
    assert.ok(container.textContent!.includes('Render Error'))

    trigger.value = 2
    assert.equal(container.textContent, 'State: 2')
  })

  it('should use custom fallback in reactiveRender', () => {
    const container = dom.window.document.createElement('div')
    const trigger = ref(0)

    reactiveRender(container,
      () => {
        if (trigger.value > 0) throw new Error('fail')
        return h('span', null, 'OK')
      },
      (err) => h('p', null, `Fallback: ${err.message}`),
    )

    assert.equal(container.textContent, 'OK')
    trigger.value = 1
    assert.equal(container.textContent, 'Fallback: fail')
  })
})
