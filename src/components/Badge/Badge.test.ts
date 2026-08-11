import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Badge } from './Badge.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */

function createTestCtx(): WfuiContext {
  return { ui: { $: {}
, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Badge', () => {
  it('renders text badge', () => {
    const vnode = renderVNode(Badge, { children: '管理员' }, createTestCtx())!
    assert.match(vnode.props.class, /wf-badge/)
    assert.equal(vnode.props.children, '管理员')
  })

  it('renders all variants', () => {
    for (const v of ['default', 'primary', 'success', 'warning', 'danger', 'info'] as const) {
      const vnode = renderVNode(Badge, { variant: v, children: v }, createTestCtx())!
      assert.match(vnode.props.class, new RegExp(`wf-badge--${v}`))
    }
  })

  it('renders dot variant', () => {
    const vnode = renderVNode(Badge, { dot: true, variant: 'success' }, createTestCtx())!
    assert.match(vnode.props.class, /wf-badge-dot/)
    assert.match(vnode.props.class, /wf-badge-dot--success/)
  })

  it('renders dot with default variant', () => {
    const vnode = renderVNode(Badge, { dot: true }, createTestCtx())!
    assert.match(vnode.props.class, /wf-badge-dot--default/)
  })

  it('renders empty string when no children', () => {
    const vnode = renderVNode(Badge, {}, createTestCtx())!
    assert.equal(vnode.props.children, '')
  })

  it('renders each variant dot', () => {
    for (const v of ['default', 'primary', 'success', 'warning', 'danger', 'info'] as const) {
      const vnode = renderVNode(Badge, { dot: true, variant: v }, createTestCtx())!
      assert.match(vnode.props.class, new RegExp(`wf-badge-dot--${v}`))
    }
  })
})

it('count 数值角标 + overflow 显示 N+', () => {
  const v1 = renderVNode(Badge, { count: 5 }, createTestCtx())!
  assert.equal(v1.props.children, '5')
  assert.ok(v1.props.class.includes('wf-badge--count'))
  const v2 = renderVNode(Badge, { count: 150, overflowCount: 99 }, createTestCtx())!
  assert.equal(v2.props.children, '99+')
})

it('count=0 默认隐藏 + showZero 显示', () => {
  assert.equal(renderVNode(Badge, { count: 0 }, createTestCtx()), null)
  const v = renderVNode(Badge, { count: 0, showZero: true }, createTestCtx())!
  assert.equal(v.props.children, '0')
})
