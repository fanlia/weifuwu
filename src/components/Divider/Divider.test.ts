import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Divider } from './Divider.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'

/** Call component and get VNode (two-phase compat) */
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}
, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Divider', () => {
  it('renders horizontal divider', () => {
    const vnode = renderVNode(Divider, {}, mockCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-divider/)
    assert.equal(vnode.props.role, 'separator')
  })

  it('renders vertical divider', () => {
    const vnode = renderVNode(Divider, { vertical: true }, mockCtx())!
    assert.match(vnode.props.class, /wf-divider--vertical/)
  })

  it('renders divider with text', () => {
    const vnode = renderVNode(Divider, { children: '或' }, mockCtx())!
    assert.match(vnode.props.class, /wf-divider--with-text/)
    assert.equal(vnode.props.children.type, 'span')
    assert.equal(vnode.props.children.props.class, 'wf-divider-text')
    assert.equal(vnode.props.children.props.children, '或')
  })
})
