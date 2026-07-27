import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Divider } from './Divider.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Divider', () => {
  it('renders horizontal divider', () => {
    const vnode = Divider({}, mockCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-divider/)
    assert.equal(vnode.props.role, 'separator')
  })

  it('renders vertical divider', () => {
    const vnode = Divider({ vertical: true }, mockCtx())!
    assert.match(vnode.props.class, /wf-divider--vertical/)
  })

  it('renders divider with text', () => {
    const vnode = Divider({ children: '或' }, mockCtx())!
    assert.match(vnode.props.class, /wf-divider--with-text/)
    assert.equal(vnode.props.children.type, 'span')
    assert.equal(vnode.props.children.props.class, 'wf-divider-text')
    assert.equal(vnode.props.children.props.children, '或')
  })
})
