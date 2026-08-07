import { describe, it } from 'node:test'
import assert from 'node:assert'
import { StatCard } from './StatCard.ts'
import { Icon } from '../Icon/Icon.ts'
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
    assert.equal(arrow.props.children.type, Icon, 'up 趋势应渲染箭头图标')
  })

  it('renders down trend', () => {
    const vnode = renderVNode(StatCard, { label: '用户', value: '100', trend: 'down' }, mockCtx())!
    const trend = vnode.props.children[vnode.props.children.length - 1]
    assert.match(trend.props.class, /wf-stat-trend--down/)
  })

  it('animate + reduced-motion：直接渲染终值', () => {
    const orig = globalThis.matchMedia
    globalThis.matchMedia = ((q: string) => ({ matches: q.includes('reduce'), addEventListener() {}, removeEventListener() {} })) as any
    try {
      const vnode = renderVNode(StatCard, { label: 'x', value: 42, animate: true }, mockCtx())!
      const valueEl = vnode.props.children[0]
      assert.equal(valueEl.props.children, '42', 'reduced-motion 直落终值')
      assert.match(valueEl.props.class, /wf-nums/, '数值用 tabular-nums')
    } finally {
      globalThis.matchMedia = orig
    }
  })

  it('非 animate 时字符串值原样渲染', () => {
    const vnode = renderVNode(StatCard, { label: 'x', value: '1.2k' }, mockCtx())!
    assert.equal(vnode.props.children[0].props.children, '1.2k')
  })

  it('可点击 StatCard：Enter/Space 触发 onClick（键盘可达）', () => {
    let clicks = 0
    const vnode = renderVNode(StatCard, { label: 'x', value: 1, onClick: () => clicks++ }, mockCtx())!
    assert.equal(vnode.props.role, 'button')
    assert.match(vnode.props.class, /wf-elevate/)
    vnode.props.onKeyDown({ key: 'Enter', preventDefault: () => {} })
    assert.equal(clicks, 1)
  })
})
