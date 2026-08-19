import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Label } from './Label.ts'
import type { UIContext } from '../../vdom/index.ts'
import { renderVNode, createTestCtx } from '../../vdom/testing.ts'

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

it('children 内容渲染', async () => {
  const vnode = await renderVNode(Label, { children: '字段名' }, createTestCtx())!
  assert.ok(JSON.stringify(vnode).includes('字段名'))
})

it('disabled 时样式类', async () => {
  const vnode = await renderVNode(Label, { children: 'x', disabled: true }, createTestCtx())!
  assert.ok(JSON.stringify(vnode).includes('disabled'), 'disabled 类')
})
