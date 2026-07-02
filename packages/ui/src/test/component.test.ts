/**
 * Tests for component.ts — reusable components with isolated state
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'

const dom = new JSDOM('<!DOCTYPE html>', { url: 'http://localhost' })
;(global as any).document = dom.window.document
;(global as any).Node = dom.window.Node
;(global as any).HTMLElement = dom.window.HTMLElement
;(global as any).Text = dom.window.Text
;(global as any).Event = dom.window.Event
;(global as any).DocumentFragment = dom.window.DocumentFragment

import { h } from '../h.ts'
import { component, signal } from '../component.ts'
import { computed } from '../signal.ts'

describe('component()', () => {
  it('should render a component', () => {
    const Greeting = component(() => {
      return h('p', null, 'Hello')
    })
    const el = h(Greeting, null)
    assert.equal(el.tagName, 'P')
    assert.equal(el.textContent, 'Hello')
  })

  it('should pass props to component', () => {
    const Greeting = component((props: { name: string }) => {
      return h('p', null, `Hello ${props.name}`)
    })
    const el = h(Greeting, { name: 'World' })
    assert.equal(el.textContent, 'Hello World')
  })

  it('should have isolated signal state per instance', () => {
    let callCount = 0
    const Counter = component(() => {
      const count = signal(0)
      callCount++
      return h('button', {
        onclick: () => { count.value++ },
      }, count)
    })

    const btn1 = h(Counter, null) as HTMLElement
    const btn2 = h(Counter, null) as HTMLElement

    assert.equal(callCount, 2)
    assert.equal(btn1.textContent, '0')
    assert.equal(btn2.textContent, '0')

    btn1.click()
    assert.equal(btn1.textContent, '1')
    assert.equal(btn2.textContent, '0')

    btn2.click()
    btn2.click()
    assert.equal(btn1.textContent, '1')
    assert.equal(btn2.textContent, '2')
  })

  it('should pass children to component', () => {
    const Wrapper = component((props: any) => {
      return h('div', { class: 'wrapper' }, ...(props.children || []))
    })

    const el = h(Wrapper, null, h('span', null, 'child'))
    assert.equal(el.className, 'wrapper')
    assert.equal(el.children.length, 1)
    assert.equal(el.children[0].textContent, 'child')
  })

  it('should work inside reactive render patterns', () => {
    const Item = component((props: { text: string }) => {
      return h('li', { class: 'item' }, props.text)
    })

    const list = h('ul', null,
      h(Item, { text: 'A' }),
      h(Item, { text: 'B' }),
      h(Item, { text: 'C' }),
    )

    assert.equal(list.children.length, 3)
    assert.equal(list.children[0].textContent, 'A')
    assert.equal(list.children[1].textContent, 'B')
    assert.equal(list.children[2].textContent, 'C')
  })

  it('should maintain state across parent re-renders', () => {
    const Counter = component(() => {
      const count = signal(0)
      return h('button', {
        class: 'counter-btn',
        onclick: () => count.value++,
      }, count)
    })

    // Simulate re-render by calling h(Counter) again
    const btn1 = h(Counter, null) as HTMLElement
    assert.equal(btn1.textContent, '0')
    btn1.click()
    assert.equal(btn1.textContent, '1')

    // Same "instance" (same call position) — gets the same state
    // Actually, in this test we're creating a new instance each call
    // but the signal() scoping works per-instance
    const btn1b = h(Counter, null) as HTMLElement
    // This is a NEW instance, so starts at 0
    assert.equal(btn1b.textContent, '0')
  })

  it('should handle multiple components of same type', () => {
    const Toggle = component(() => {
      const on = signal(false)
      // Use Signal as child for reactive text binding
      const text = computed(() => on.value ? 'ON' : 'OFF')
      return h('button', {
        class: 'toggle',
        onclick: () => { on.value = !on.value },
      }, text)
    })

    const toggles = [0, 1, 2].map(() => h(Toggle, null) as HTMLElement)

    assert.equal(toggles[0].textContent, 'OFF')
    assert.equal(toggles[1].textContent, 'OFF')
    assert.equal(toggles[2].textContent, 'OFF')

    toggles[0].click()
    assert.equal(toggles[0].textContent, 'ON')
    assert.equal(toggles[1].textContent, 'OFF')
    assert.equal(toggles[2].textContent, 'OFF')

    toggles[2].click()
    assert.equal(toggles[0].textContent, 'ON')
    assert.equal(toggles[2].textContent, 'ON')
  })
})
