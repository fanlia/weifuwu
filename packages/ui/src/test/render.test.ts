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
;(global as any).HTMLElement = dom.window.HTMLElement
;(global as any).Text = dom.window.Text
;(global as any).DocumentFragment = dom.window.DocumentFragment
;(global as any).Element = dom.window.Element
;(global as any).Event = dom.window.Event

import { h } from '../h.ts'
import { render, reactiveRender } from '../render.ts'

describe('render()', () => {
  it('should render a single element', () => {
    const container = dom.window.document.createElement('div')
    render(container, () => h('h1', null, 'Hello'))
    assert.equal(container.innerHTML, '<h1>Hello</h1>')
  })

  it('should replace previous content', () => {
    const container = dom.window.document.createElement('div')
    container.innerHTML = '<p>old</p>'
    render(container, () => h('h1', null, 'new'))
    assert.equal(container.innerHTML, '<h1>new</h1>')
  })

  it('should return cleanup function', () => {
    const container = dom.window.document.createElement('div')
    const dispose = render(container, () => h('p', null, 'test'))
    assert.equal(typeof dispose, 'function')
    dispose()
    assert.equal(container.innerHTML, '')
  })
})

describe('reactiveRender()', () => {
  it('should render initial template', () => {
    const container = dom.window.document.createElement('div')
    const count = ref(0)
    reactiveRender(container, () => h('span', null, count))
    assert.equal(container.textContent, '0')
  })

  it('should update DOM when signal changes', () => {
    const container = dom.window.document.createElement('div')
    const count = ref(0)
    reactiveRender(container, () => h('span', null, count))
    assert.equal(container.textContent, '0')
    count.value = 42
    assert.equal(container.textContent, '42')
  })

  it('should re-render on signal change', () => {
    const container = dom.window.document.createElement('div')
    const items = ref<string[]>(['a', 'b'])

    reactiveRender(container, () => {
      return h('ul', null,
        ...items.value.map(i => h('li', null, i))
      )
    })

    assert.equal(container.querySelectorAll('li').length, 2)
    items.value = ['a', 'b', 'c']
    assert.equal(container.querySelectorAll('li').length, 3)
  })

  it('should work with onclick and ref in combination', () => {
    const container = dom.window.document.createElement('div')
    const count = ref(0)
    reactiveRender(container, () =>
      h('button', { onclick: () => { count.value++ } }, count)
    )
    assert.equal(container.textContent.trim(), '0')
    container.querySelector('button')!.click()
    assert.equal(container.textContent.trim(), '1')
  })

  it('should invoke onmount after render', () => {
    const container = dom.window.document.createElement('div')
    let mounted = false
    render(container, () =>
      h('div', { onmount: () => { mounted = true } }, 'content')
    )
    assert.equal(mounted, true)
  })

  it('should invoke onmount on nested elements', () => {
    const container = dom.window.document.createElement('div')
    const calls: string[] = []
    render(container, () =>
      h('div', null,
        h('span', { onmount: () => calls.push('span') }, 'a'),
        h('p', { onmount: () => calls.push('p') }, 'b'),
      )
    )
    assert.deepEqual(calls, ['span', 'p'])
  })

  it('should invoke onmount on each reactiveRender', () => {
    const container = dom.window.document.createElement('div')
    let mountCount = 0
    const show = ref(true)
    reactiveRender(container, () =>
      h('div', { onmount: () => mountCount++ },
        show.value ? 'visible' : 'hidden'
      )
    )
    assert.equal(mountCount, 1)
    show.value = false
    assert.equal(mountCount, 2)  // re-rendered, onmount called again
  })
})
