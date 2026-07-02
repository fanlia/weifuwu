/**
 * Tests for html.ts — client-side reactive DOM
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { ref, Signal } from '../signal.ts'

// ── Setup jsdom ─────────────────────────────────────────────────
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
})

;(global as any).document = dom.window.document
;(global as any).Node = dom.window.Node
;(global as any).HTMLElement = dom.window.HTMLElement
;(global as any).Comment = dom.window.Comment
;(global as any).Text = dom.window.Text
;(global as any).DocumentFragment = dom.window.DocumentFragment
;(global as any).NodeFilter = dom.window.NodeFilter
;(global as any).Element = dom.window.Element
;(global as any).Event = dom.window.Event
;(global as any).KeyboardEvent = dom.window.KeyboardEvent

import { html } from '../html.ts'

describe('html() — DOM creation', () => {
  it('should create a single element', () => {
    const result = html`<h1>Title</h1>`
    assert.ok(result instanceof dom.window.HTMLElement)
    assert.equal((result as HTMLElement).tagName.toLowerCase(), 'h1')
    assert.equal(result.textContent, 'Title')
  })

  it('should create nested elements', () => {
    const result = html`<div><h2>Sub</h2><p>Content</p></div>`
    assert.ok(result instanceof dom.window.HTMLElement)
    assert.equal(result.textContent!.trim(), 'SubContent')
  })

  it('should interpolate string values', () => {
    const name = 'World'
    const result = html`<h1>Hello ${name}</h1>`
    assert.equal(result.textContent, 'Hello World')
  })

  it('should interpolate number values', () => {
    const count = 42
    const result = html`<span>${count}</span>`
    assert.equal(result.textContent, '42')
  })

  it('should handle null/undefined as empty', () => {
    const result = html`<span>${null}${undefined}</span>`
    assert.equal(result.textContent, '')
  })

  it('should handle boolean false as empty', () => {
    const result = html`<span>${false}</span>`
    assert.equal(result.textContent, '')
  })

  it('should handle boolean true', () => {
    const result = html`<span>${true}</span>`
    assert.equal(result.textContent, 'true')
  })

  it('should create multiple root nodes as fragment', () => {
    const result = html`<p>first</p><p>second</p>`
    assert.ok(result instanceof dom.window.DocumentFragment)
    assert.equal(result.childNodes.length, 2)
  })
})

describe('html() — event binding (@click)', () => {
  it('should bind @click event', () => {
    let clicked = false
    const result = html`<button @click="${() => { clicked = true }}">Click</button>` as HTMLElement
    result.click()
    assert.equal(clicked, true)
  })

  it('should bind @input event', () => {
    let value = ''
    const result = html`<input @input="${(e: Event) => { value = (e.target as HTMLInputElement).value }}" />` as HTMLInputElement
    result.value = 'test'
    result.dispatchEvent(new dom.window.Event('input'))
    assert.equal(value, 'test')
  })

  it('should bind @keydown event', () => {
    let key = ''
    const result = html`<div @keydown="${(e: Event) => { key = (e as KeyboardEvent).key }}"></div>` as HTMLElement
    result.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Enter' }))
    assert.equal(key, 'Enter')
  })
})

describe('html() — attribute binding (:value, ?checked)', () => {
  it('should bind :value with ref', () => {
    const val = ref('hello')
    const result = html`<input :value="${val}" />` as HTMLInputElement
    assert.equal(result.value, 'hello')
  })

  it('should update :value on ref change', () => {
    const val = ref('initial')
    const result = html`<input :value="${val}" />` as HTMLInputElement
    assert.equal(result.value, 'initial')
    val.value = 'updated'
    assert.equal(result.value, 'updated')
  })

  it('should bind ?checked with ref (true)', () => {
    const checked = ref(true)
    const result = html`<input type="checkbox" ?checked="${checked}" />` as HTMLInputElement
    assert.ok(result.hasAttribute('checked'))
  })

  it('should bind ?checked with ref (false)', () => {
    const checked = ref(false)
    const result = html`<input type="checkbox" ?checked="${checked}" />` as HTMLInputElement
    assert.ok(!result.hasAttribute('checked'))
  })

  it('should update ?checked when ref changes', () => {
    const checked = ref(false)
    const result = html`<input type="checkbox" ?checked="${checked}" />` as HTMLInputElement
    assert.ok(!result.hasAttribute('checked'))
    checked.value = true
    assert.ok(result.hasAttribute('checked'))
  })
})

describe('html() — reactive text binding with ref', () => {
  it('should render ref initial value as text', () => {
    const count = ref(0)
    const result = html`<span>${count}</span>` as HTMLElement
    assert.equal(result.textContent, '0')
  })

  it('should update text content when ref changes', () => {
    const text = ref('hello')
    const result = html`<p>${text}</p>` as HTMLElement
    assert.equal(result.textContent, 'hello')
    text.value = 'world'
    assert.equal(result.textContent, 'world')
  })

  it('should update text with number changes', () => {
    const count = ref(0)
    const result = html`<span>${count}</span>` as HTMLElement
    assert.equal(result.textContent, '0')
    count.value = 100
    assert.equal(result.textContent, '100')
    count.value = -5
    assert.equal(result.textContent, '-5')
  })

  it('should handle null ref value as empty', () => {
    const val = ref<string | null>('text')
    const result = html`<span>${val}</span>` as HTMLElement
    assert.equal(result.textContent, 'text')
    val.value = null
    assert.equal(result.textContent, '')
  })
})

describe('html() — complex scenarios', () => {
  it('should combine text, events, and attributes', () => {
    const count = ref(0)
    const result = html`<div><span>${count}</span><button @click="${() => { count.value++ }}">+</button></div>` as HTMLElement

    const span = result.querySelector('span')!
    assert.ok(span.textContent!.includes('0'))

    result.querySelector('button')!.click()
    assert.ok(span.textContent!.includes('1'))
  })

  it('should handle multiple refs independently', () => {
    const firstName = ref('John')
    const lastName = ref('Doe')
    const result = html`<p>${firstName} ${lastName}</p>` as HTMLElement
    assert.equal(result.textContent!.trim(), 'John Doe')
    firstName.value = 'Jane'
    assert.equal(result.textContent!.trim(), 'Jane Doe')
    lastName.value = 'Smith'
    assert.equal(result.textContent!.trim(), 'Jane Smith')
  })

  it('should handle array iteration', () => {
    const items = ['a', 'b', 'c']
    const result = html`<ul>${items.map(i => {
      const el = dom.window.document.createElement('li')
      el.textContent = i
      return el
    })}</ul>` as HTMLElement
    const lis = result.querySelectorAll('li')
    assert.equal(lis.length, 3)
    assert.equal(lis[0].textContent, 'a')
    assert.equal(lis[1].textContent, 'b')
    assert.equal(lis[2].textContent, 'c')
  })

  it('should handle conditional via ternary', () => {
    const flag = ref(true)
    const yes = dom.window.document.createElement('span')
    yes.textContent = 'yes'
    const no = dom.window.document.createElement('span')
    no.textContent = 'no'
    const result = html`<div>${flag.value ? yes : no}</div>` as HTMLElement
    assert.equal(result.querySelector('span')!.textContent, 'yes')
  })
})
