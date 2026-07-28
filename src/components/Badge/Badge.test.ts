import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Badge } from './Badge.ts'
import type { WfuiContext } from '../../client/types.ts'

/** Call component and get VNode (two-phase compat) */
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}
, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Badge', () => {
  it('renders text badge', () => {
    const vnode = renderVNode(Badge, { children: '管理员' }, mockCtx())!
    assert.match(vnode.props.class, /wf-badge/)
    assert.equal(vnode.props.children, '管理员')
  })

  it('renders all variants', () => {
    for (const v of ['default', 'primary', 'success', 'warning', 'danger', 'info'] as const) {
      const vnode = renderVNode(Badge, { variant: v, children: v }, mockCtx())!
      assert.match(vnode.props.class, new RegExp(`wf-badge--${v}`))
    }
  })

  it('renders dot variant', () => {
    const vnode = renderVNode(Badge, { dot: true, variant: 'success' }, mockCtx())!
    assert.match(vnode.props.class, /wf-badge-dot/)
    assert.match(vnode.props.class, /wf-badge-dot--success/)
  })

  it('renders dot with default variant', () => {
    const vnode = renderVNode(Badge, { dot: true }, mockCtx())!
    assert.match(vnode.props.class, /wf-badge-dot--default/)
  })

  it('renders empty string when no children', () => {
    const vnode = renderVNode(Badge, {}, mockCtx())!
    assert.equal(vnode.props.children, '')
  })

  it('renders each variant dot', () => {
    for (const v of ['default', 'primary', 'success', 'warning', 'danger', 'info'] as const) {
      const vnode = renderVNode(Badge, { dot: true, variant: v }, mockCtx())!
      assert.match(vnode.props.class, new RegExp(`wf-badge-dot--${v}`))
    }
  })
})
