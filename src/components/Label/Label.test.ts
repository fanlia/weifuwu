import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Label } from './Label.ts'
import type { WfuiContext } from '../../client/types.ts'

/** Call component and get VNode (two-phase compat) */
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Label', () => {
  it('renders label with text', () => {
    const vnode = renderVNode(Label, { children: '用户名' }, mockCtx())!
    assert.equal(vnode.type, 'label')
    assert.match(vnode.props.class, /wf-label/)
    assert.equal(vnode.props.children, '用户名')
  })

  it('sets htmlFor', () => {
    const vnode = renderVNode(Label, { htmlFor: 'username', children: '用户名' }, mockCtx())!
    assert.equal(vnode.props.htmlFor, 'username')
  })

  it('renders required star', () => {
    const vnode = renderVNode(Label, { required: true, children: '用户名' }, mockCtx())!
    const star = vnode.props.children[1]
    assert.match(star.props.class, /wf-label-req/)
    assert.equal(star.props.children, '*')
  })

  it('merges className', () => {
    const vnode = renderVNode(Label, { className: 'custom', children: 'x' }, mockCtx())!
    assert.match(vnode.props.class, /custom/)
  })
})
