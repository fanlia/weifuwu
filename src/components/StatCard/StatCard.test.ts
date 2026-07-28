import { describe, it } from 'node:test'
import assert from 'node:assert'
import { StatCard } from './StatCard.ts'
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

describe('StatCard', () => {
  it('renders label and value', () => {
    const vnode = renderVNode(StatCard, { label: '用户数', value: 128 }, mockCtx())!
    assert.match(vnode.props.class, /wf-stat/)
    const valueEl = vnode.props.children[0]
    const labelEl = vnode.props.children[1]
    assert.equal(valueEl.props.children, '128')
    assert.equal(labelEl.props.children, '用户数')
  })

  it('renders icon when provided', () => {
    const vnode = renderVNode(StatCard, { label: '收入', value: '¥899', icon: '💰' }, mockCtx())!
    const icon = vnode.props.children[0]
    assert.equal(icon.props.class, 'wf-stat-icon')
    assert.equal(icon.props.children, '💰')
  })

  it('renders up trend', () => {
    const vnode = renderVNode(StatCard, { label: '用户', value: '100', trend: 'up', trendLabel: '12%' }, mockCtx())!
    const trend = vnode.props.children[vnode.props.children.length - 1]
    assert.match(trend.props.class, /wf-stat-trend--up/)
    const arrow = trend.props.children[0]
    assert.equal(arrow.props.children, '↑')
  })

  it('renders down trend', () => {
    const vnode = renderVNode(StatCard, { label: '用户', value: '100', trend: 'down' }, mockCtx())!
    const trend = vnode.props.children[vnode.props.children.length - 1]
    assert.match(trend.props.class, /wf-stat-trend--down/)
  })
})
