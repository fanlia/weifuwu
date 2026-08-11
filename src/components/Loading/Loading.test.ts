import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Loading } from './Loading.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */

function createTestCtx(): WfuiContext {
  return { ui: { $: {}
, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Loading', () => {
  it('renders loading container', () => {
    const vnode = renderVNode(Loading, {}, createTestCtx())!
    assert.match(vnode.props.class, /wf-loading/)
  })

  it('renders default text', () => {
    const vnode = renderVNode(Loading, {}, createTestCtx())!
    const text = vnode.props.children[1]
    assert.equal(text.props.children, '加载中...')
  })

  it('renders custom text', () => {
    const vnode = renderVNode(Loading, { text: '提交中...' }, createTestCtx())!
    const text = vnode.props.children[1]
    assert.equal(text.props.children, '提交中...')
  })

  it('renders spinner element', () => {
    const vnode = renderVNode(Loading, {}, createTestCtx())!
    const spinner = vnode.props.children[0]
    assert.match(spinner.props.class, /wf-loading-spinner/)
  })
})

  it('has role status attribute', () => {
    const vnode = renderVNode(Loading, {}, createTestCtx())!
    assert.equal(vnode.props.role, 'status')
  })

  it('has aria-live polite', () => {
    const vnode = renderVNode(Loading, {}, createTestCtx())!
    assert.equal(vnode.props['aria-live'], 'polite')
  })
