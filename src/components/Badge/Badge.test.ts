import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Badge } from './Badge.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Badge', () => {
  it('renders text badge', () => {
    const vnode = Badge({ children: '管理员' }, mockCtx())!
    assert.match(vnode.props.class, /wf-badge/)
    assert.equal(vnode.props.children, '管理员')
  })

  it('renders all variants', () => {
    for (const v of ['default', 'primary', 'success', 'warning', 'danger', 'info'] as const) {
      const vnode = Badge({ variant: v, children: v }, mockCtx())!
      assert.match(vnode.props.class, new RegExp(`wf-badge--${v}`))
    }
  })

  it('renders dot variant', () => {
    const vnode = Badge({ dot: true, variant: 'success' }, mockCtx())!
    assert.match(vnode.props.class, /wf-badge-dot/)
    assert.match(vnode.props.class, /wf-badge-dot--success/)
  })

  it('renders dot with default variant', () => {
    const vnode = Badge({ dot: true }, mockCtx())!
    assert.match(vnode.props.class, /wf-badge-dot--default/)
  })

  it('renders empty string when no children', () => {
    const vnode = Badge({}, mockCtx())!
    assert.equal(vnode.props.children, '')
  })

  it('renders each variant dot', () => {
    for (const v of ['default', 'primary', 'success', 'warning', 'danger', 'info'] as const) {
      const vnode = Badge({ dot: true, variant: v }, mockCtx())!
      assert.match(vnode.props.class, new RegExp(`wf-badge-dot--${v}`))
    }
  })
})
