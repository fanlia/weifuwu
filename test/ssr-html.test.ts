import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { html, raw } from '../ssr/html.ts'
import type { RawString } from '../ssr/html.ts'

function val(v: RawString): string {
  return v.value
}

describe('html — tagged template literal', () => {
  // ── Basic ────────────────────────────────────────────────────────────

  it('renders plain strings', () => {
    assert.equal(val(html`<h1>Hello</h1>`), '<h1>Hello</h1>')
  })

  it('interpolates values', () => {
    const name = 'World'
    assert.equal(val(html`<h1>${name}</h1>`), '<h1>World</h1>')
  })

  it('interpolates numbers', () => {
    assert.equal(val(html`<span>${42}</span>`), '<span>42</span>')
    assert.equal(val(html`<span>${0}</span>`), '<span>0</span>')
  })

  // ── XSS Escaping ─────────────────────────────────────────────────────

  it('escapes HTML special chars', () => {
    const evil = '<script>alert("xss")</script>'
    const result = html`<div>${evil}</div>`
    assert.equal(val(result), '<div>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</div>')
    assert.doesNotMatch(val(result), /<script>/)
  })

  it('escapes ampersand first', () => {
    const v = 'a&b<c'
    assert.equal(val(html`${v}`), 'a&amp;b&lt;c')
  })

  // ── raw() ────────────────────────────────────────────────────────────

  it('raw() bypasses escaping', () => {
    const content = raw('<strong>bold</strong>')
    const result = html`<div>${content}</div>`
    assert.equal(val(result), '<div><strong>bold</strong></div>')
  })

  it('raw() produces RawString type', () => {
    const r = raw('test')
    const rs: RawString = r
    assert.equal(rs.value, 'test')
  })

  // ── null / undefined / false ────────────────────────────────────────

  it('renders null as empty', () => {
    assert.equal(val(html`<div>${null}</div>`), '<div></div>')
  })

  it('renders undefined as empty', () => {
    assert.equal(val(html`<div>${undefined}</div>`), '<div></div>')
  })

  it('renders false as empty', () => {
    assert.equal(val(html`<div>${false}</div>`), '<div></div>')
  })

  it('supports conditional rendering with &&', () => {
    const isAdmin = true
    const isGuest = false
    assert.equal(val(html`${isAdmin && raw('<button>Admin</button>')}`), '<button>Admin</button>')
    assert.equal(val(html`${isGuest && raw('<button>Guest</button>')}`), '')
  })

  // ── Arrays ───────────────────────────────────────────────────────────

  it('renders arrays by joining', () => {
    const items = ['a', 'b', 'c']
    const result = val(html`${items.map((i) => html`<li>${i}</li>`)}`)
    assert.equal(result, '<li>a</li><li>b</li><li>c</li>')
  })

  it('renders nested arrays', () => {
    const rows = [[{ name: 'Alice' }, { name: 'Bob' }]]
    const result = val(
      html`${rows.map((row) => html`${row.map((cell) => html`<td>${cell.name}</td>`)}`)}`,
    )
    assert.equal(result, '<td>Alice</td><td>Bob</td>')
  })

  it('filters out nulls in arrays', () => {
    const items = ['a', null, 'b', undefined, 'c']

    assert.equal(
      val(html`${items.map((i: any) => (i ? html`<li>${i}</li>` : ''))}`),
      '<li>a</li><li>b</li><li>c</li>',
    )
  })

  // ── Nested html() ────────────────────────────────────────────────────

  it('supports nested html calls (no double escaping)', () => {
    const inner = html`<span>inner</span>`
    const outer = html`<div>${inner}</div>`
    assert.equal(val(outer), '<div><span>inner</span></div>')
  })

  it('supports triple nesting', () => {
    const result = html`<div>${html`<span>${html`<b>deep</b>`}</span>`}</div>`
    assert.equal(val(result), '<div><span><b>deep</b></span></div>')
  })

  // ── Edge Cases ──────────────────────────────────────────────────────

  it('handles empty template', () => {
    assert.equal(val(html``), '')
  })

  it('handles template with no interpolations', () => {
    assert.equal(val(html`<div></div>`), '<div></div>')
  })

  it('handles true value', () => {
    assert.equal(val(html`${true}`), 'true')
  })

  it('handles zero', () => {
    assert.equal(val(html`${0}`), '0')
  })

  // ── toString() ───────────────────────────────────────────────────────

  it('supports toString() for use in Response body', () => {
    const h = html`<h1>Hello</h1>`
    assert.equal(String(h), '<h1>Hello</h1>')
    assert.equal(h.toString(), '<h1>Hello</h1>')
  })
})
