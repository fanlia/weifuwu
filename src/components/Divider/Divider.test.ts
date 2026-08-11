import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Divider } from './Divider.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */

function createTestCtx(): WfuiContext {
  return { ui: { $: {}
, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Divider', () => {
  it('renders horizontal divider', () => {
    const vnode = renderVNode(Divider, {}, createTestCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-divider/)
    assert.equal(vnode.props.role, 'separator')
  })

  it('renders vertical divider', () => {
    const vnode = renderVNode(Divider, { vertical: true }, createTestCtx())!
    assert.match(vnode.props.class, /wf-divider--vertical/)
  })

  it('renders divider with text', () => {
    const vnode = renderVNode(Divider, { children: '或' }, createTestCtx())!
    assert.match(vnode.props.class, /wf-divider--with-text/)
    assert.equal(vnode.props.children.type, 'span')
    assert.equal(vnode.props.children.props.class, 'wf-divider-text')
    assert.equal(vnode.props.children.props.children, '或')
  })
})
