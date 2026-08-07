import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Card } from './Card.ts'
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

describe('Card', () => {
  it('renders as a div', () => {
    const vnode = renderVNode(Card, { children: '内容' }, mockCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-card/)
  })

  it('renders children', () => {
    const vnode = renderVNode(Card, { children: '卡片内容' }, mockCtx())!
    assert.equal(vnode.props.children, '卡片内容')
  })

  it('applies clickable class and cursor', () => {
    const vnode = renderVNode(Card, { clickable: true, children: '点击' }, mockCtx())!
    assert.match(vnode.props.class, /wf-card--clickable/)
    assert.equal(vnode.props.role, 'button')
  })

  it('applies outlined variant', () => {
    const vnode = renderVNode(Card, { variant: 'outlined', children: '内容' }, mockCtx())!
    assert.match(vnode.props.class, /wf-card--outlined/)
  })

  it('applies padding classes', () => {
    const sm = renderVNode(Card, { padding: 'sm', children: '小' }, mockCtx())!
    const lg = renderVNode(Card, { padding: 'lg', children: '大' }, mockCtx())!
    assert.match(sm.props.class, /wf-card--pad-sm/)
    assert.match(lg.props.class, /wf-card--pad-lg/)
  })

  it('applies hover lift class', () => {
    const vnode = renderVNode(Card, { hover: true, children: '悬停' }, mockCtx())!
    assert.match(vnode.props.class, /wf-card--hover/)
  })

  it('clickable + hover can combine', () => {
    const vnode = renderVNode(Card, { clickable: true, hover: true, children: 'x' }, mockCtx())!
    assert.match(vnode.props.class, /wf-card--clickable/)
    assert.match(vnode.props.class, /wf-card--hover/)
  })

  it('applies active selected state', () => {
    const vnode = renderVNode(Card, { active: true, children: 'x' }, mockCtx())!
    assert.match(vnode.props.class, /wf-card--active/)
  })

  it('可点击卡片键盘 Enter/Space 触发 onClick（role=button 可操作红线）', () => {
    let clicks = 0
    const vnode = renderVNode(Card, { clickable: true, onClick: () => clicks++ }, mockCtx())!
    assert.equal(vnode.props.role, 'button')
    assert.equal(vnode.props.tabindex, 0)
    vnode.props.onKeyDown({ key: 'Enter', preventDefault: () => {} })
    vnode.props.onKeyDown({ key: ' ', preventDefault: () => {} })
    assert.equal(clicks, 2)
    // 不可点击卡片无键盘处理
    const plain = renderVNode(Card, { children: 'x' }, mockCtx())!
    assert.equal(plain.props.onKeyDown, undefined)
  })
})
