/**
 * Tests for bind.ts — two-way form binding
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { ref } from '../signal.ts'

const dom = new JSDOM('<!DOCTYPE html>', { url: 'http://localhost' })
;(global as any).document = dom.window.document
;(global as any).Node = dom.window.Node
;(global as any).HTMLElement = dom.window.HTMLElement
;(global as any).HTMLInputElement = dom.window.HTMLInputElement
;(global as any).Event = dom.window.Event

import { h } from '../h.ts'
import { bind } from '../bind.ts'

describe('bind() — text input', () => {
  it('binds value and oninput to a Signal', () => {
    const name = ref('hello')
    const input = h('input', bind(name)) as HTMLInputElement
    assert.equal(input.value, 'hello')

    // Simulate user input
    input.value = 'world'
    input.dispatchEvent(new dom.window.Event('input'))
    assert.equal(name.value, 'world')
  })

  it('updates input when Signal changes', () => {
    const name = ref('initial')
    const input = h('input', bind(name)) as HTMLInputElement
    assert.equal(input.value, 'initial')
    name.value = 'updated'
    assert.equal(input.value, 'updated')
  })

  it('handles empty string', () => {
    const val = ref('')
    const input = h('input', bind(val)) as HTMLInputElement
    assert.equal(input.value, '')
    input.value = 'abc'
    input.dispatchEvent(new dom.window.Event('input'))
    assert.equal(val.value, 'abc')
  })
})

describe('bind() — checkbox', () => {
  it('binds checked and onchange', () => {
    const agreed = ref(false)
    const input = h('input', { type: 'checkbox', ...bind(agreed) }) as HTMLInputElement
    assert.equal(input.checked, false)
    assert.ok(!input.hasAttribute('checked'))

    input.checked = true
    input.dispatchEvent(new dom.window.Event('change'))
    assert.equal(agreed.value, true)
  })

  it('updates when Signal changes', () => {
    const agreed = ref(true)
    const input = h('input', { type: 'checkbox', ...bind(agreed) }) as HTMLInputElement
    assert.equal(input.checked, true)
    agreed.value = false
    assert.equal(input.checked, false)
  })

  it('toggles correctly', () => {
    const flag = ref(false)
    const input = h('input', { type: 'checkbox', ...bind(flag) }) as HTMLInputElement

    input.checked = true
    input.dispatchEvent(new dom.window.Event('change'))
    assert.equal(flag.value, true)

    input.checked = false
    input.dispatchEvent(new dom.window.Event('change'))
    assert.equal(flag.value, false)
  })
})

describe('bind() — number input', () => {
  it('parses number on input', () => {
    const age = ref(0)
    const input = h('input', { type: 'number', ...bind(age, { number: true }) }) as HTMLInputElement
    assert.equal(input.value, '0')

    input.value = '25'
    input.dispatchEvent(new dom.window.Event('input'))
    assert.equal(age.value, 25)
  })

  it('handles decimal numbers', () => {
    const price = ref(0)
    const input = h('input', { type: 'number', ...bind(price, { number: true }) }) as HTMLInputElement

    input.value = '19.99'
    input.dispatchEvent(new dom.window.Event('input'))
    assert.equal(price.value, 19.99)
  })
})

describe('bind() — textarea', () => {
  it('binds value and oninput', () => {
    const text = ref('some text')
    const ta = h('textarea', bind(text)) as HTMLInputElement
    assert.equal(ta.value, 'some text')

    ta.value = 'new text'
    ta.dispatchEvent(new dom.window.Event('input'))
    assert.equal(text.value, 'new text')
  })
})
