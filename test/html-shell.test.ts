import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { buildHtmlShell } from '../html-shell.ts'

describe('buildHtmlShell', () => {
  it('returns an html element with head and body', () => {
    const body = createElement('div', { id: 'app' }, 'Hello')
    const result = buildHtmlShell('Test Page', body, [])
    const html = renderToString(result)

    assert.ok(html.includes('<html'))
    assert.ok(html.includes('<head'))
    assert.ok(html.includes('<body'))
    assert.ok(html.includes('<title>Test Page'))
    assert.ok(html.includes('<div id="app">Hello</div>'))
  })

  it('includes charset and viewport meta tags', () => {
    const body = createElement('div', null)
    const result = buildHtmlShell('Test', body, [])
    const html = renderToString(result)

    // React 19 SSR preserves the camelCase prop as charSet
    assert.ok(html.includes('charSet="utf-8"') || html.includes('charset="utf-8"'),
      'Expected charset meta tag in: ' + html)
    assert.ok(html.includes('name="viewport"'))
  })

  it('wraps body in layout components in reverse order', () => {
    const LayoutA = ({ children }: any) => createElement('div', { 'data-layout': 'A' }, children)
    const LayoutB = ({ children }: any) => createElement('div', { 'data-layout': 'B' }, children)
    const body = createElement('div', { id: 'page' }, 'Content')

    const result = buildHtmlShell('Test', body, [LayoutA, LayoutB])
    const html = renderToString(result)

    // layout components are applied in reversed order via .toReversed():
    // [LayoutA, LayoutB] → reversed = [LayoutB, LayoutA]
    // LayoutB wraps body first, then LayoutA wraps everything
    // Final HTML opening order: LayoutA, LayoutB, page
    const aIdx = html.indexOf('data-layout="A"')
    const bIdx = html.indexOf('data-layout="B"')
    const pIdx = html.indexOf('id="page"')
    assert.ok(aIdx >= 0, 'LayoutA rendered')
    assert.ok(bIdx >= 0, 'LayoutB rendered')
    assert.ok(pIdx >= 0, 'Page rendered')
    assert.ok(aIdx < bIdx && bIdx < pIdx, 'Expected opening order: LayoutA → LayoutB → page')
  })

  it('handles empty layout array', () => {
    const body = createElement('div', null, 'Hello')
    const result = buildHtmlShell('Empty', body, [])
    const html = renderToString(result)

    assert.ok(html.includes('<body><div>Hello</div></body>'))
  })
})
