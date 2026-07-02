/**
 * Comprehensive tests for h.ts — low-level DOM factory
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { ref, computed } from '../signal.ts'

const dom = new JSDOM('<!DOCTYPE html>', { url: 'http://localhost' })
;(global as any).document = dom.window.document
;(global as any).Node = dom.window.Node
;(global as any).HTMLElement = dom.window.HTMLElement
;(global as any).HTMLInputElement = dom.window.HTMLInputElement
;(global as any).HTMLButtonElement = dom.window.HTMLButtonElement
;(global as any).HTMLDivElement = dom.window.HTMLDivElement
;(global as any).Text = dom.window.Text
;(global as any).DocumentFragment = dom.window.DocumentFragment
;(global as any).Event = dom.window.Event

import { h, text, fragment } from '../h.ts'

// ═══════════════════════════════════════════════════════════════
// Element creation
// ═══════════════════════════════════════════════════════════════

describe('h() — element creation', () => {
  it('creates element with correct tag', () => {
    assert.equal(h('div', null).tagName, 'DIV')
    assert.equal(h('span', null).tagName, 'SPAN')
    assert.equal(h('button', null).tagName, 'BUTTON')
    assert.equal(h('input', null).tagName, 'INPUT')
  })

  it('sets string attributes', () => {
    const el = h('a', { href: '/page', title: 'Go to page' })
    assert.equal(el.getAttribute('href'), '/page')
    assert.equal(el.getAttribute('title'), 'Go to page')
  })

  it('sets boolean attributes to true', () => {
    const el = h('input', { type: 'checkbox', checked: true, disabled: true })
    assert.ok(el.hasAttribute('checked'))
    assert.ok(el.hasAttribute('disabled'))
  })

  it('omits boolean attributes when false', () => {
    const el = h('input', { type: 'checkbox', checked: false, disabled: false })
    assert.ok(!el.hasAttribute('checked'))
    assert.ok(!el.hasAttribute('disabled'))
  })

  it('skips null/undefined attributes', () => {
    const el = h('div', { id: null as any, title: undefined as any })
    assert.equal(el.attributes.length, 0)
  })

  it('handles className as class alias', () => {
    assert.equal(h('div', { className: 'foo' }).getAttribute('class'), 'foo')
  })

  it('handles data-* attributes', () => {
    const el = h('div', { 'data-id': '123', 'data-type': 'card' })
    assert.equal(el.dataset.id, '123')
    assert.equal(el.dataset.type, 'card')
  })

  it('handles style attribute as string', () => {
    const el = h('div', { style: 'color: red; font-size: 14px' })
    assert.equal(el.getAttribute('style'), 'color: red; font-size: 14px')
  })

  it('handles empty string attribute', () => {
    const el = h('div', { title: '' })
    assert.equal(el.getAttribute('title'), '')
  })

  it('handles number attribute values', () => {
    const el = h('div', { tabindex: 0 })
    assert.equal(el.getAttribute('tabindex'), '0')
  })

  it('creates element with no children', () => {
    assert.equal(h('br', null).outerHTML, '<br>')
  })

  it('creates element with no attrs and no children', () => {
    assert.equal(h('hr', null).outerHTML, '<hr>')
  })
})

// ═══════════════════════════════════════════════════════════════
// Children
// ═══════════════════════════════════════════════════════════════

describe('h() — children', () => {
  it('adds string child as text', () => {
    assert.equal(h('span', null, 'Hello').textContent, 'Hello')
  })

  it('adds number child as text', () => {
    assert.equal(h('span', null, 42).textContent, '42')
  })

  it('adds boolean child as text', () => {
    assert.equal(h('span', null, true).textContent, 'true')
  })

  it('skips null/undefined/false children', () => {
    const el = h('div', null, null, 'a', undefined, 'b', false)
    assert.equal(el.textContent, 'ab')
  })

  it('adds nested elements', () => {
    const el = h('ul', null,
      h('li', { class: 'a' }, 'A'),
      h('li', { class: 'b' }, 'B'),
      h('li', { class: 'c' }, 'C'),
    )
    assert.equal(el.children.length, 3)
    assert.equal(el.children[0].textContent, 'A')
    assert.equal(el.children[1].textContent, 'B')
    assert.equal(el.children[2].textContent, 'C')
  })

  it('flattens arrays in children', () => {
    const el = h('ul', null, ['a', 'b', 'c'])
    assert.equal(el.textContent, 'abc')
  })

  it('flattens nested arrays', () => {
    const el = h('div', null, [['a', ['b']], 'c'])
    assert.equal(el.textContent, 'abc')
  })

  it('mixes text and elements', () => {
    const el = h('p', null, 'Hello ', h('strong', null, 'World'), '!')
    assert.equal(el.textContent, 'Hello World!')
    assert.equal(el.children.length, 1)
    assert.equal(el.children[0].tagName, 'STRONG')
  })

  it('handles deep nesting (5+ levels)', () => {
    const el = h('div', null,
      h('div', null,
        h('div', null,
          h('div', null,
            h('span', null, 'deep'),
          ),
        ),
      ),
    )
    assert.equal(el.querySelector('span')!.textContent, 'deep')
  })

  it('handles many children (100+)', () => {
    const items = Array.from({ length: 100 }, (_, i) => h('li', null, String(i)))
    const el = h('ul', null, ...items)
    assert.equal(el.children.length, 100)
    assert.equal(el.children[99].textContent, '99')
  })

  it('preserves child order', () => {
    const el = h('div', null, '1', h('span', null, '2'), '3', h('i', null, '4'))
    assert.equal(el.childNodes.length, 4)
    assert.equal(el.childNodes[0].textContent, '1')
    assert.equal((el.childNodes[1] as HTMLElement).tagName, 'SPAN')
    assert.equal(el.childNodes[2].textContent, '3')
    assert.equal((el.childNodes[3] as HTMLElement).tagName, 'I')
  })
})

// ═══════════════════════════════════════════════════════════════
// Events
// ═══════════════════════════════════════════════════════════════

describe('h() — events', () => {
  it('binds onclick', () => {
    let count = 0
    const btn = h('button', { onclick: () => count++ })
    btn.click()
    assert.equal(count, 1)
    btn.click()
    assert.equal(count, 2)
  })

  it('binds multiple event types', () => {
    const events: string[] = []
    const el = h('div', {
      onclick: () => events.push('click'),
      onmouseenter: () => events.push('enter'),
      onmouseleave: () => events.push('leave'),
    })
    el.click()
    el.dispatchEvent(new dom.window.Event('mouseenter'))
    el.dispatchEvent(new dom.window.Event('mouseleave'))
    assert.deepEqual(events, ['click', 'enter', 'leave'])
  })

  it('binds oninput with event object', () => {
    let value = ''
    const input = h('input', {
      oninput: (e: Event) => { value = (e.target as HTMLInputElement).value }
    }) as HTMLInputElement
    input.value = 'hello'
    input.dispatchEvent(new dom.window.Event('input'))
    assert.equal(value, 'hello')
  })

  it('binds onchange', () => {
    let checked = false
    const input = h('input', {
      type: 'checkbox',
      onchange: () => { checked = true },
    })
    input.dispatchEvent(new dom.window.Event('change'))
    assert.equal(checked, true)
  })

  it('binds onsubmit on form', () => {
    let submitted = false
    const form = h('form', { onsubmit: (e: Event) => { e.preventDefault(); submitted = true } })
    form.dispatchEvent(new dom.window.Event('submit'))
    assert.equal(submitted, true)
  })

  it('passes event to handler', () => {
    let received: Event | null = null
    const el = h('button', { onclick: (e: Event) => { received = e } })
    el.click()
    assert.ok(received instanceof dom.window.Event)
    assert.equal(received!.type, 'click')
  })

  it('handles multiple elements with independent handlers', () => {
    const counts = [0, 0, 0]
    const items = [0, 1, 2].map(i =>
      h('button', { onclick: () => counts[i]++ }, String(i))
    )
    const container = h('div', null, ...items)
    container.children[0].click()
    container.children[1].click()
    container.children[1].click()
    container.children[2].click()
    container.children[2].click()
    container.children[2].click()
    assert.deepEqual(counts, [1, 2, 3])
  })
})

// ═══════════════════════════════════════════════════════════════
// Signal reactive bindings (attributes)
// ═══════════════════════════════════════════════════════════════

describe('h() — reactive attribute bindings', () => {
  it('binds value property from signal', () => {
    const val = ref('hello')
    const input = h('input', { value: val }) as HTMLInputElement
    assert.equal(input.value, 'hello')
    val.value = 'world'
    assert.equal(input.value, 'world')
  })

  it('binds multiple value properties', () => {
    const min = ref(0)
    const max = ref(100)
    const input = h('input', { type: 'number', min, max }) as HTMLInputElement
    assert.equal(input.getAttribute('min'), '0')
    assert.equal(input.getAttribute('max'), '100')
    min.value = 10
    max.value = 50
    assert.equal(input.getAttribute('min'), '10')
    assert.equal(input.getAttribute('max'), '50')
  })

  it('binds boolean attribute from signal', () => {
    const checked = ref(true)
    const input = h('input', { type: 'checkbox', checked })
    assert.ok(input.hasAttribute('checked'))
    checked.value = false
    assert.ok(!input.hasAttribute('checked'))
  })

  it('toggles boolean attribute repeatedly', () => {
    const disabled = ref(false)
    const btn = h('button', { disabled })
    assert.ok(!btn.hasAttribute('disabled'))
    disabled.value = true
    assert.ok(btn.hasAttribute('disabled'))
    disabled.value = false
    assert.ok(!btn.hasAttribute('disabled'))
    disabled.value = true
    assert.ok(btn.hasAttribute('disabled'))
  })

  it('binds multiple boolean attributes', () => {
    const checked = ref(true)
    const disabled = ref(false)
    const input = h('input', { type: 'checkbox', checked, disabled })
    assert.ok(input.hasAttribute('checked'))
    assert.ok(!input.hasAttribute('disabled'))
    checked.value = false
    disabled.value = true
    assert.ok(!input.hasAttribute('checked'))
    assert.ok(input.hasAttribute('disabled'))
  })

  it('binds class attribute from signal', () => {
    const cls = ref('active')
    const el = h('div', { class: cls })
    assert.equal(el.className, 'active')
    cls.value = 'inactive hidden'
    assert.equal(el.className, 'inactive hidden')
  })

  it('binds placeholder from signal', () => {
    const placeholder = ref('Enter name')
    const input = h('input', { placeholder }) as HTMLInputElement
    assert.equal(input.getAttribute('placeholder'), 'Enter name')
    placeholder.value = 'Enter email'
    assert.equal(input.getAttribute('placeholder'), 'Enter email')
  })

  it('binds href from signal', () => {
    const url = ref('/page/1')
    const a = h('a', { href: url })
    assert.equal(a.getAttribute('href'), '/page/1')
    url.value = '/page/2'
    assert.equal(a.getAttribute('href'), '/page/2')
  })

  it('binds mixed static and reactive attributes', () => {
    const label = ref('Save')
    const btn = h('button', { class: 'btn primary', onclick: () => {}, 'aria-label': label })
    assert.equal(btn.className, 'btn primary')
    assert.equal(btn.getAttribute('aria-label'), 'Save')
    label.value = 'Submit'
    assert.equal(btn.getAttribute('aria-label'), 'Submit')
  })
})

// ═══════════════════════════════════════════════════════════════
// Signal reactive children
// ═══════════════════════════════════════════════════════════════

describe('h() — reactive children (Signal)', () => {
  it('renders initial signal value', () => {
    const count = ref(0)
    const el = h('span', null, count)
    assert.equal(el.textContent, '0')
  })

  it('updates text on signal change', () => {
    const text = ref('hello')
    const el = h('p', null, text)
    assert.equal(el.textContent, 'hello')
    text.value = 'world'
    assert.equal(el.textContent, 'world')
  })

  it('updates on multiple signal changes', () => {
    const count = ref(0)
    const el = h('span', null, count)
    assert.equal(el.textContent, '0')
    count.value = 1
    assert.equal(el.textContent, '1')
    count.value = 2
    assert.equal(el.textContent, '2')
    count.value = 42
    assert.equal(el.textContent, '42')
  })

  it('handles null signal value as empty', () => {
    const val = ref<string | null>('text')
    const el = h('span', null, val)
    assert.equal(el.textContent, 'text')
    val.value = null
    assert.equal(el.textContent, '')
  })

  it('renders number signal', () => {
    const n = ref(0)
    const el = h('span', null, n)
    assert.equal(el.textContent, '0')
    n.value = -5
    assert.equal(el.textContent, '-5')
    n.value = 3.14
    assert.equal(el.textContent, '3.14')
  })

  it('renders multiple signal children in order', () => {
    const first = ref('John')
    const last = ref('Doe')
    const el = h('p', null, first, ' ', last)
    assert.equal(el.textContent, 'John Doe')
    first.value = 'Jane'
    assert.equal(el.textContent, 'Jane Doe')
    last.value = 'Smith'
    assert.equal(el.textContent, 'Jane Smith')
  })

  it('mixes signal and static children', () => {
    const count = ref(0)
    const el = h('div', null, 'Count: ', count, ' items')
    assert.equal(el.textContent, 'Count: 0 items')
    count.value = 5
    assert.equal(el.textContent, 'Count: 5 items')
  })

  it('renders computed initial value as child', () => {
    const a = ref(1)
    const b = ref(2)
    const sum = computed(() => a.value + b.value)
    const el = h('span', null, sum)
    assert.equal(el.textContent, '3')
  })

  it('updates computed child when dependencies change', () => {
    const a = ref(1)
    const b = ref(2)
    const sum = computed(() => a.value + b.value)
    const el = h('span', null, sum)
    assert.equal(el.textContent, '3')
    a.value = 10
    assert.equal(el.textContent, '12')
    b.value = 5
    assert.equal(el.textContent, '15')
  })

  it('updates computed child with string value', () => {
    const name = ref('World')
    const greeting = computed(() => `Hello ${name.value}!`)
    const el = h('p', null, greeting)
    assert.equal(el.textContent, 'Hello World!')
    name.value = 'Jane'
    assert.equal(el.textContent, 'Hello Jane!')
  })

  it('updates computed child nested in elements', () => {
    const count = ref(0)
    const double = computed(() => count.value * 2)
    const el = h('div', null,
      h('span', null, 'Value: '),
      h('strong', null, double),
    )
    assert.equal(el.textContent, 'Value: 0')
    count.value = 5
    assert.equal(el.textContent, 'Value: 10')
  })

  it('renders signal child inside nested elements', () => {
    const name = ref('World')
    const el = h('div', { class: 'greeting' },
      h('h1', null, 'Hello'),
      h('p', null, name),
      h('small', null, 'from weifuwu'),
    )
    assert.equal(el.querySelector('h1')!.textContent, 'Hello')
    assert.equal(el.querySelector('p')!.textContent, 'World')
    name.value = 'Jane'
    assert.equal(el.querySelector('p')!.textContent, 'Jane')
    assert.equal(el.querySelector('h1')!.textContent, 'Hello') // unchanged
  })

  it('renders signal deep in tree', () => {
    const count = ref(0)
    const el = h('div', null,
      h('ul', null,
        h('li', null,
          h('span', null, count),
        ),
      ),
    )
    assert.equal(el.querySelector('span')!.textContent, '0')
    count.value = 99
    assert.equal(el.querySelector('span')!.textContent, '99')
  })

  it('handles multiple independent signals in same parent', () => {
    const firstName = ref('John')
    const lastName = ref('Doe')
    const el = h('div', null,
      h('span', { class: 'first' }, firstName),
      ' ',
      h('span', { class: 'last' }, lastName),
    )
    assert.equal(el.textContent!.trim(), 'John Doe')
    firstName.value = 'Jane'
    assert.equal(el.textContent!.trim(), 'Jane Doe')
    lastName.value = 'Smith'
    assert.equal(el.textContent!.trim(), 'Jane Smith')
  })
})

// ═══════════════════════════════════════════════════════════════
// text() and fragment()
// ═══════════════════════════════════════════════════════════════

describe('text()', () => {
  it('creates text node with string', () => {
    const t = text('hello')
    assert.equal(t.nodeType, Node.TEXT_NODE)
    assert.equal(t.textContent, 'hello')
  })

  it('converts numbers', () => {
    assert.equal(text(42).textContent, '42')
    assert.equal(text(0).textContent, '0')
    assert.equal(text(-1).textContent, '-1')
  })

  it('handles null/undefined/boolean', () => {
    assert.equal(text(null).textContent, '')
    assert.equal(text(undefined).textContent, '')
    assert.equal(text(true).textContent, 'true')
    assert.equal(text(false).textContent, 'false')
  })

  it('handles empty string', () => {
    assert.equal(text('').textContent, '')
  })
})

describe('fragment()', () => {
  it('creates fragment', () => {
    const frag = fragment(h('p', null, 'a'), h('p', null, 'b'))
    assert.ok(frag instanceof dom.window.DocumentFragment)
    assert.equal(frag.childNodes.length, 2)
  })

  it('handles empty fragment', () => {
    const frag = fragment()
    assert.equal(frag.childNodes.length, 0)
  })

  it('handles single node', () => {
    const frag = fragment(h('div', null, 'x'))
    assert.equal(frag.childNodes.length, 1)
  })

  it('handles mixed arguments', () => {
    const frag = fragment(h('p', null, 'a'), text('b'), h('p', null, 'c'))
    assert.equal(frag.childNodes.length, 3)
  })
})

// ═══════════════════════════════════════════════════════════════
// Integration: real-world patterns
// ═══════════════════════════════════════════════════════════════

describe('h() — real world patterns', () => {
  it('builds a form with validation state', () => {
    const value = ref('')
    const error = ref('')
    const form = h('form', { class: 'wui-form' },
      h('div', { class: 'field' },
        h('label', { class: 'wui-label' }, 'Name'),
        h('input', {
          class: 'wui-input',
          value,
          oninput: (e: Event) => {
            const v = (e.target as HTMLInputElement).value
            value.value = v
            error.value = v.length < 2 ? 'Too short' : ''
          },
        }),
        h('span', { class: 'wui-badge wui-badge--danger' }, error),
      ),
      h('button', {
        class: 'wui-btn wui-btn--primary',
        onclick: () => {},
      }, 'Submit'),
    )

    assert.equal(form.getAttribute('class'), 'wui-form')
    assert.ok(form.querySelector('.wui-input'))
    assert.ok(form.querySelector('.wui-btn'))
  })

  it('builds a todo list with conditional items', () => {
    const items = ['Task 1', 'Task 2', 'Task 3']
    const active = ref(0)

    const list = h('ul', null,
      ...items.map((item, i) =>
        h('li', {
          class: i === active.value ? 'active' : '',
          onclick: () => { active.value = i },
        }, item)
      ),
    )

    assert.equal(list.children.length, 3)
    assert.equal(list.children[0].className, 'active')
    list.children[1].click()
    // Note: active is a signal, but the list was built with static value
    // This tests that h() creates the correct initial structure
    assert.equal(list.children[1].className, '')
  })

  it('builds a card component', () => {
    function Card(title: string, body: string) {
      return h('div', { class: 'wui-card' },
        h('div', { class: 'wui-card__header' }, title),
        h('div', { class: 'wui-card__body' }, body),
      )
    }

    const el = Card('Hello', 'World')
    assert.equal(el.className, 'wui-card')
    assert.equal(el.children[0].textContent, 'Hello')
    assert.equal(el.children[1].textContent, 'World')
  })

  it('builds a tab navigation', () => {
    const tabs = ['Home', 'About', 'Contact']
    const activeTab = ref(0)

    const nav = h('div', { class: 'wui-tabs' },
      ...tabs.map((tab, i) =>
        h('button', {
          class: `wui-tab${i === activeTab.value ? ' wui-tab--active' : ''}`,
          onclick: () => { activeTab.value = i },
        }, tab)
      ),
    )

    assert.equal(nav.children.length, 3)
    assert.ok(nav.children[0].className.includes('wui-tab--active'))
  })

  it('builds a table with rows', () => {
    const headers = ['Name', 'Age', 'Role']
    const rows = [
      ['Alice', '30', 'Admin'],
      ['Bob', '25', 'User'],
    ]

    const table = h('table', { class: 'wui-table' },
      h('thead', null,
        h('tr', null, ...headers.map(label => h('th', null, label))),
      ),
      h('tbody', null,
        ...rows.map(row =>
          h('tr', null, ...row.map(cell => h('td', null, cell)))
        ),
      ),
    )

    assert.equal(table.querySelectorAll('th').length, 3)
    assert.equal(table.querySelectorAll('td').length, 6)
    assert.equal(table.querySelector('td')!.textContent, 'Alice')
  })
})

// ═══════════════════════════════════════════════════════════════
// Edge cases
// ═══════════════════════════════════════════════════════════════

describe('h() — edge cases', () => {
  it('handles special characters in text', () => {
    const el = h('span', null, '<script>alert("xss")</script> & "quotes"')
    // textContent handles this safely, no HTML injection
    assert.equal(el.textContent, '<script>alert("xss")</script> & "quotes"')
    assert.equal(el.innerHTML, '&lt;script&gt;alert("xss")&lt;/script&gt; &amp; "quotes"')
  })

  it('handles empty children array', () => {
    const el = h('div', null, [])
    assert.equal(el.children.length, 0)
  })

  it('handles null attrs object', () => {
    const el = h('div', null)
    assert.equal(el.tagName, 'DIV')
  })

  it('handles deeply nested empty elements', () => {
    const el = h('div', null, h('div', null, h('div', null)))
    assert.equal(el.querySelector('div')!.querySelector('div')!.tagName, 'DIV')
  })

  it('handles zero as child', () => {
    assert.equal(h('span', null, 0).textContent, '0')
  })

  it('handles empty string as child', () => {
    assert.equal(h('span', null, '').textContent, '')
  })

  it('handles self-closing tag pattern', () => {
    const br = h('br', null)
    assert.equal(br.tagName, 'BR')
  })

  it('handles void elements with attributes', () => {
    const input = h('input', { type: 'text', placeholder: 'Enter...', disabled: true })
    assert.equal(input.tagName, 'INPUT')
    assert.equal(input.getAttribute('placeholder'), 'Enter...')
    assert.ok(input.hasAttribute('disabled'))
  })
})
