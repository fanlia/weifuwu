/**
 * Tests for render.ts — render() and reactiveRender()
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { ref } from '../signal.ts'

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
})
;(global as any).document = dom.window.document
;(global as any).Node = dom.window.Node
;(global as any).NodeFilter = dom.window.NodeFilter
;(global as any).HTMLElement = dom.window.HTMLElement
;(global as any).Text = dom.window.Text
;(global as any).Comment = dom.window.Comment
;(global as any).DocumentFragment = dom.window.DocumentFragment
;(global as any).Element = dom.window.Element
;(global as any).Event = dom.window.Event

import { html } from '../html.ts'
import { render, reactiveRender } from '../render.ts'

describe('render()', () => {
  it('should render a single element', () => {
    const container = dom.window.document.createElement('div')
    const r = render(container, () => html`<h1>Hello</h1>`)
    assert.equal(container.innerHTML, '<h1>Hello</h1>')
  })

  it('should replace previous content', () => {
    const container = dom.window.document.createElement('div')
    container.innerHTML = '<p>old</p>'
    render(container, () => html`<h1>new</h1>`)
    assert.equal(container.innerHTML, '<h1>new</h1>')
  })

  it('should return cleanup function', () => {
    const container = dom.window.document.createElement('div')
    const dispose = render(container, () => html`<p>test</p>`)
    assert.equal(typeof dispose, 'function')
    dispose()
    assert.equal(container.innerHTML, '')
  })
})

describe('reactiveRender()', () => {
  it('should render initial template', () => {
    const container = dom.window.document.createElement('div')
    const count = ref(0)
    reactiveRender(container, () => html`<span>${count}</span>`)
    assert.equal(container.textContent, '0')
  })

  it('should update DOM when signal changes', () => {
    const container = dom.window.document.createElement('div')
    const count = ref(0)
    reactiveRender(container, () => html`<span>${count}</span>`)
    assert.equal(container.textContent, '0')
    count.value = 42
    assert.equal(container.textContent, '42')
  })

  it('should re-render on signal change', () => {
    const container = dom.window.document.createElement('div')
    const items = ref<string[]>(['a', 'b'])

    reactiveRender(container, () => {
      return html`<ul>${items.value.map(i => {
        const li = dom.window.document.createElement('li')
        li.textContent = i
        return li
      })}</ul>`
    })

    assert.equal(container.querySelectorAll('li').length, 2)
    items.value = ['a', 'b', 'c']
    assert.equal(container.querySelectorAll('li').length, 3)
  })

  it('should work with @click and ref in combination', () => {
    const container = dom.window.document.createElement('div')
    const count = ref(0)
    reactiveRender(container, () => html`<button @click="${() => { count.value++ }}">${count}</button>`)
    assert.equal(container.textContent.trim(), '0')
    container.querySelector('button')!.click()
    assert.equal(container.textContent.trim(), '1')
  })
})
