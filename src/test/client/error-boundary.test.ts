/**
 * ErrorBoundary 测试
 */

import { describe, it, before, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { setupJsdom } from './setup.ts'
import { jsx } from '../../client/vnode.ts'
import { render, mountVNode } from '../../client/render.ts'
import { ErrorBoundary } from '../../client/error-boundary.ts'
import type { WfuiContext } from '../../client/types.ts'

let ctx: WfuiContext
before(setupJsdom)

beforeEach(() => {
  ctx = { ui: { render: () => {}, $: () => ({}) } }
})

describe('ErrorBoundary', () => {
  it('正常渲染子组件', () => {
    const v = jsx(ErrorBoundary, { children: jsx('span', { children: 'ok' }) })
    const el = render(v, ctx) as HTMLElement
    assert.equal(el.tagName, 'SPAN')
    assert.equal(el.textContent, 'ok')
  })

  it('无 children 返回空', () => {
    const v = jsx(ErrorBoundary, {})
    const n = render(v, ctx) as Text
    assert.equal(n.textContent, '')
  })

  it('子组件不抛错时正常渲染', () => {
    const OK = () => () => jsx('main', { children: 'content' })
    const v = jsx(ErrorBoundary, {
      fallback: jsx('p', null),
      children: jsx(OK, {}),
    })
    const el = render(v, ctx) as HTMLElement
    assert.equal(el.tagName, 'MAIN')
    assert.equal(el.textContent, 'content')
  })

  it('无 fallback 时返回空', () => {
    const v = jsx(ErrorBoundary, { children: jsx('span', null) })
    v._$ = { error: new Error('test') }
    const n = render(v, ctx) as Text
    assert.equal(n.textContent, '')
  })
})
