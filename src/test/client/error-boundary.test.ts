/**
 * ErrorBoundary 测试
 *
 * 组件级 $ 后，组件状态存在 vnode._$ 上。
 * 预设错误状态时，直接操作 vnode._$ 而不是 ctx.ui.$。
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
    const v = jsx(ErrorBoundary, {
      fallback: jsx('p', { children: '出错了' }),
      children: jsx('span', { children: 'ok' }),
    })
    v._$ = { error: new Error('test') }
    const el = render(v, ctx) as HTMLElement
    assert.equal(el.tagName, 'P')
    assert.equal(el.textContent, '出错了')
  })

  it('fallback 可以是函数', () => {
    const fb = (p: any) => jsx('p', { children: p.error.message })
    const v = jsx(ErrorBoundary, { fallback: fb, children: jsx('span', null) })
    v._$ = { error: new Error('boom') }
    const el = render(v, ctx) as HTMLElement
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
    const v = jsx(ErrorBoundary, {
      fallback: () => jsx('p', { children: 'error' }),
      children: jsx('span', { children: 'ok' }),
    })

    // 有错误状态 → 显示 fallback
    v._$ = { error: new Error('test') }
    mountVNode(container, v, ctx)
    assert.equal(container.textContent, 'error')

    // 清除错误 → 重新渲染（patchValue 复用 vnode）
    v._$.error = null
    mountVNode(container, v, ctx)
    assert.equal(container.textContent, 'ok')
  })

  it('子组件抛错时设置 $.error', () => {
    const Throws = () => { throw new Error('boom') }
    const v = jsx(ErrorBoundary, {
      fallback: () => jsx('p', { children: 'error' }),
      children: jsx(Throws, {}),
    })

    const container = document.createElement('div')
    mountVNode(container, v, ctx)
    // 子组件抛错后，ErrorBoundary 的 vnode._$.error 被设置
    assert.ok(v._$?.error instanceof Error)
    assert.equal(v._$?.error?.message, 'boom')
  })

  it('无 fallback 时返回空', () => {
    const v = jsx(ErrorBoundary, { children: jsx('span', null) })
    v._$ = { error: new Error('test') }
    const n = render(v, ctx) as Text
    assert.equal(n.textContent, '')
  })
})
