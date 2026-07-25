/**
 * ErrorBoundary 测试
 *
 * 覆盖：
 *   - 正常渲染子组件
 *   - 有错误时显示 fallback（同步：通过预置 $.error）
 *   - 错误恢复后显示正常内容
 *   - 子组件抛错时 $.error 被设置
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
  ctx = { ui: { render: () => {}, $: {}, ready: false, dirty: () => {} } }
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

  it('有错误时显示 fallback VNode', () => {
    const errorCtx = { ui: { render: () => {}, $: { error: new Error('test') }, ready: true, dirty: () => {} } }
    const v = jsx(ErrorBoundary, {
      fallback: jsx('p', { children: '出错了' }),
      children: jsx('span', { children: 'ok' }),
    })
    const el = render(v, errorCtx) as HTMLElement
    assert.equal(el.tagName, 'P')
    assert.equal(el.textContent, '出错了')
  })

  it('fallback 可以是函数', () => {
    const errorCtx = { ui: { render: () => {}, $: { error: new Error('boom') }, ready: true, dirty: () => {} } }
    const fb = (p: any) => jsx('p', { children: p.error.message })
    const v = jsx(ErrorBoundary, { fallback: fb, children: jsx('span', null) })
    const el = render(v, errorCtx) as HTMLElement
    assert.equal(el.tagName, 'P')
    assert.equal(el.textContent, 'boom')
  })

  it('子组件不抛错时正常渲染', () => {
    const OK = () => jsx('main', { children: 'content' })
    const v = jsx(ErrorBoundary, {
      fallback: jsx('p', null),
      children: jsx(OK, {}),
    })
    const el = render(v, ctx) as HTMLElement
    assert.equal(el.tagName, 'MAIN')
    assert.equal(el.textContent, 'content')
  })

  it('错误恢复后显示正常内容', () => {
    const container = document.createElement('div')
    const $ = { error: null }

    // 有错误状态 → 显示 fallback
    $.error = new Error('test')
    const v1 = jsx(ErrorBoundary, {
      fallback: () => jsx('p', { children: 'error' }),
      children: jsx('span', { children: 'ok' }),
    })
    mountVNode(container, v1, { ui: { render: () => {}, $, ready: true, dirty: () => {} } })
    assert.equal(container.textContent, 'error')

    // 清除错误 → 显示 children
    $.error = null
    const v2 = jsx(ErrorBoundary, {
      fallback: () => jsx('p', { children: 'error' }),
      children: jsx('span', { children: 'ok' }),
    })
    mountVNode(container, v2, { ui: { render: () => {}, $, ready: true, dirty: () => {} } })
    assert.equal(container.textContent, 'ok')
  })

  it('子组件抛错时设置 $.error', () => {
    const $ = {} as Record<string, any>
    const testCtx = { ui: { render: () => {}, dirty: () => {}, $, ready: false } }

    const Throws = () => { throw new Error('boom') }
    const v = jsx(ErrorBoundary, {
      fallback: () => jsx('p', { children: 'error' }),
      children: jsx(Throws, {}),
    })

    // 首次渲染 — 子组件抛错，renderComponent catch → _errorHandler → $.error 设置
    const container = document.createElement('div')
    mountVNode(container, v, testCtx)
    assert.ok($.error instanceof Error)
    assert.equal($.error.message, 'boom')
  })

  it('无 fallback 时返回空', () => {
    const $ = { error: new Error('test') }
    const errorCtx = { ui: { render: () => {}, $, ready: true, dirty: () => {} } }
    const v = jsx(ErrorBoundary, { children: jsx('span', null) })
    const n = render(v, errorCtx) as Text
    assert.equal(n.textContent, '')
  })
})
