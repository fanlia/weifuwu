import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Loading } from './Loading.ts'
import type { UIContext } from '../../vdom/index.ts'
import { renderVNode, createTestCtx } from '../../vdom/testing.ts'

/** Call component and get VNode (two-phase compat) */



describe('Loading', () => {
  it('renders loading container', async () => {
    const vnode = await renderVNode(Loading, {}, createTestCtx())!
    assert.match(vnode.props.class, /wf-loading/)
  })

  it('renders default text', async () => {
    const vnode = await renderVNode(Loading, {}, createTestCtx())!
    const text = vnode.props.children[1]
    assert.equal(text.props.children, '加载中...')
  })

  it('renders custom text', async () => {
    const vnode = await renderVNode(Loading, { text: '提交中...' }, createTestCtx())!
    const text = vnode.props.children[1]
    assert.equal(text.props.children, '提交中...')
  })

  it('renders spinner element', async () => {
    const vnode = await renderVNode(Loading, {}, createTestCtx())!
    const spinner = vnode.props.children[0]
    assert.match(spinner.props.class, /wf-loading-spinner/)
  })
})

  it('has role status attribute', async () => {
    const vnode = await renderVNode(Loading, {}, createTestCtx())!
    assert.equal(vnode.props.role, 'status')
  })

  it('has aria-live polite', async () => {
    const vnode = await renderVNode(Loading, {}, createTestCtx())!
    assert.equal(vnode.props['aria-live'], 'polite')
  })
