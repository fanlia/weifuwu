import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { html, raw } from '../core/html.ts'

describe('html', () => {
  it('renders plain string', () => {
    assert.equal(html`<h1>Hello</h1>`, '<h1>Hello</h1>')
  })

  it('escapes interpolated values', () => {
    assert.equal(html`<p>${'<script>alert(1)</script>'}</p>`, '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>')
  })

  it('escapes &, <, >, ", \'', () => {
    assert.equal(html`<div>${'&<>"\''}</div>`, '<div>&amp;&lt;&gt;&quot;&#39;</div>')
  })

  it('handles multiple interpolated values', () => {
    const title = 'Title'
    const body = '<x>'
    assert.equal(html`<h1>${title}</h1><p>${body}</p>`, '<h1>Title</h1><p>&lt;x&gt;</p>')
  })

  it('handles numbers', () => {
    assert.equal(html`<span>${42}</span>`, '<span>42</span>')
  })

  it('handles booleans', () => {
    assert.equal(html`<span>${true}</span>`, '<span>true</span>')
  })

  it('skips null and undefined', () => {
    assert.equal(html`<div>${null}${undefined}</div>`, '<div></div>')
  })

  it('skips false', () => {
    assert.equal(html`<div>${false}</div>`, '<div></div>')
  })

  it('raw() bypasses escaping', () => {
    const trusted = '<strong>bold</strong>'
    assert.equal(html`<div>${raw(trusted)}</div>`, '<div><strong>bold</strong></div>')
  })

  it('raw() works standalone too', () => {
    assert.equal(html`<div>${raw('<br>')}</div>`, '<div><br></div>')
  })

  it('joins arrays without separator', () => {
    const items = ['a', 'b', 'c']
    assert.equal(html`<ul>${items.map(i => html`<li>${i}</li>`)}</ul>`, '<ul><li>a</li><li>b</li><li>c</li></ul>')
  })

  it('nested html strings get escaped (use raw() to embed)', () => {
    // html`` returns a plain string. When used as interpolation,
    // it gets escaped like any other string. Use raw() to embed.
    const inner = html`<span>${'<x>'}</span>`
    const withRaw = html`<div>${raw(inner)}</div>`
    assert.equal(withRaw, '<div><span>&lt;x&gt;</span></div>')
  })

  it('html`` string gets escaped when nested (without raw)', () => {
    const inner = html`<span>hello</span>`
    const outer = html`<div>${inner}</div>`
    assert.equal(outer, '<div>&lt;span&gt;hello&lt;/span&gt;</div>')
  })

  it('conditional rendering with null', () => {
    const show = false
    assert.equal(html`<div>${show && html`<span>hidden</span>`}</div>`, '<div></div>')
  })

  it('conditional rendering with truthy (use raw() to embed)', () => {
    const show = true
    const rendered = show && html`<span>visible</span>`
    assert.equal(html`<div>${raw(rendered)}</div>`, '<div><span>visible</span></div>')
  })

  it('raw + escaped mixed', () => {
    assert.equal(html`<div>${raw('<b>safe</b>')} ${'<i>escaped</i>'}</div>`, '<div><b>safe</b> &lt;i&gt;escaped&lt;/i&gt;</div>')
  })
})
