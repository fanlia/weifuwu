/**
 * Tests for h.ts — low-level DOM factory
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
;(global as any).DocumentFragment = dom.window.DocumentFragment
;(global as any).Event = dom.window.Event

import { h, text, fragment } from '../h.ts'

describe('h() — element creation', () => {
  it('should create an element with tag name', () => {
    const el = h('div', null)
    assert.equal(el.tagName, 'DIV')
  })

  it('should set string attributes', () => {
    const el = h('div', { id: 'main', class: 'container' })
    assert.equal(el.getAttribute('id'), 'main')
    assert.equal(el.getAttribute('class'), 'container')
  })

  it('should set boolean attributes', () => {
    const el = h('input', { type: 'checkbox', checked: true })
    assert.ok(el.hasAttribute('checked'))
  })

  it('should skip false boolean attributes', () => {
    const el = h('input', { type: 'checkbox', checked: false })
    assert.ok(!el.hasAttribute('checked'))
  })

  it('should skip null/undefined attributes', () => {
    const el = h('div', { id: null as any, title: undefined as any })
    assert.equal(el.attributes.length, 0)
  })

  it('should set className as class', () => {
    const el = h('div', { className: 'foo bar' })
    assert.equal(el.getAttribute('class'), 'foo bar')
  })

  it('should add string child as text node', () => {
    const el = h('span', null, 'Hello')
    assert.equal(el.textContent, 'Hello')
  })

  it('should add number child as text', () => {
    const el = h('span', null, 42)
    assert.equal(el.textContent, '42')
  })

  it('should skip null/undefined/false children', () => {
    const el = h('div', null, null, 'a', undefined, 'b', false)
    assert.equal(el.textContent, 'ab')
  })

  it('should add nested elements', () => {
    const el = h('ul', null,
      h('li', null, 'A'),
      h('li', null, 'B'),
    )
    assert.equal(el.children.length, 2)
    assert.equal(el.children[0].textContent, 'A')
    assert.equal(el.children[1].textContent, 'B')
  })

  it('should flatten nested arrays in children', () => {
    const el = h('div', null, ['a', 'b', 'c'])
    assert.equal(el.textContent, 'abc')
  })
})

describe('h() — event binding', () => {
  it('should bind onclick', () => {
    let clicked = false
    const el = h('button', { onclick: () => { clicked = true } }, 'Click')
    el.click()
    assert.equal(clicked, true)
  })

  it('should bind oninput', () => {
    let value = ''
    const el = h('input', { oninput: (e: Event) => {
      value = (e.target as HTMLInputElement).value
    }}) as HTMLInputElement
    el.value = 'test'
    el.dispatchEvent(new dom.window.Event('input'))
    assert.equal(value, 'test')
  })

  it('should bind onkeydown', () => {
    let key = ''
    const el = h('div', { onkeydown: (e: Event) => {
      key = (e as KeyboardEvent).key
    }})
    el.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter' }))
    assert.equal(key, 'Enter')
  })
})

describe('h() — reactive bindings', () => {
  it('should set initial value property', () => {
    const val = ref('hello')
    const el = h('input', { value: val }) as HTMLInputElement
    assert.equal(el.value, 'hello')
  })

  it('should update property on signal change', () => {
    const val = ref('initial')
    const el = h('input', { value: val }) as HTMLInputElement
    assert.equal(el.value, 'initial')
    val.value = 'updated'
    assert.equal(el.value, 'updated')
  })

  it('should set boolean attribute from signal', () => {
    const checked = ref(true)
    const el = h('input', { type: 'checkbox', checked })
    assert.ok(el.hasAttribute('checked'))
    checked.value = false
    assert.ok(!el.hasAttribute('checked'))
  })

  it('should set class attribute from signal', () => {
    const cls = ref('active')
    const el = h('div', { class: cls })
    assert.equal(el.getAttribute('class'), 'active')
    cls.value = 'inactive'
    assert.equal(el.getAttribute('class'), 'inactive')
  })
})

describe('text()', () => {
  it('should create a text node', () => {
    const t = text('hello')
    assert.equal(t.nodeType, Node.TEXT_NODE)
    assert.equal(t.textContent, 'hello')
  })

  it('should convert numbers to string', () => {
    const t = text(42)
    assert.equal(t.textContent, '42')
  })

  it('should handle null/undefined as empty', () => {
    assert.equal(text(null).textContent, '')
    assert.equal(text(undefined).textContent, '')
  })
})

describe('fragment()', () => {
  it('should create a document fragment', () => {
    const frag = fragment(h('p', null, 'a'), h('p', null, 'b'))
    assert.ok(frag instanceof dom.window.DocumentFragment)
    assert.equal(frag.childNodes.length, 2)
  })
})
