import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Label } from './Label.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */


describe('Label', () => {
  it('renders label with text', async () => {
    const vnode = await renderVNode(Label, { children: '用户名' }, createTestCtx())!
    assert.equal(vnode.type, 'label')
    assert.match(vnode.props.class, /wf-label/)
    assert.equal(vnode.props.children, '用户名')
  })

  it('sets htmlFor', async () => {
    const vnode = await renderVNode(Label, { htmlFor: 'username', children: '用户名' }, createTestCtx())!
    assert.equal(vnode.props.htmlFor, 'username')
  })

  it('renders required star', async () => {
    const vnode = await renderVNode(Label, { required: true, children: '用户名' }, createTestCtx())!
    const star = vnode.props.children[1]
    assert.match(star.props.class, /wf-label-req/)
    assert.equal(star.props.children, '*')
  })

  it('merges className', async () => {
    const vnode = await renderVNode(Label, { className: 'custom', children: 'x' }, createTestCtx())!
    assert.match(vnode.props.class, /custom/)
  })
})
