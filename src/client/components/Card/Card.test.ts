import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Card } from './Card.ts'
import type { UIContext } from '../../vdom/index.ts'
import { renderVNode, createTestCtx } from '../../vdom/testing.ts'

/** Call component and get VNode (two-phase compat) */



describe('Card', () => {
  it('renders as a div', async () => {
    const vnode = await renderVNode(Card, { children: '内容' }, createTestCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-card/)
  })

  it('renders children', async () => {
    const vnode = await renderVNode(Card, { children: '卡片内容' }, createTestCtx())!
    assert.equal(vnode.props.children, '卡片内容')
  })

  it('applies clickable class and cursor', async () => {
    const vnode = await renderVNode(Card, { clickable: true, children: '点击' }, createTestCtx())!
    assert.match(vnode.props.class, /wf-card--clickable/)
    assert.equal(vnode.props.role, 'button')
  })

  it('applies outlined variant', async () => {
    const vnode = await renderVNode(Card, { variant: 'outlined', children: '内容' }, createTestCtx())!
    assert.match(vnode.props.class, /wf-card--outlined/)
  })

  it('applies padding classes', async () => {
    const sm = await renderVNode(Card, { padding: 'sm', children: '小' }, createTestCtx())!
    const lg = await renderVNode(Card, { padding: 'lg', children: '大' }, createTestCtx())!
    assert.match(sm.props.class, /wf-card--pad-sm/)
    assert.match(lg.props.class, /wf-card--pad-lg/)
  })

  it('applies hover lift class', async () => {
    const vnode = await renderVNode(Card, { hover: true, children: '悬停' }, createTestCtx())!
    assert.match(vnode.props.class, /wf-card--hover/)
  })

  it('clickable + hover can combine', async () => {
    const vnode = await renderVNode(Card, { clickable: true, hover: true, children: 'x' }, createTestCtx())!
    assert.match(vnode.props.class, /wf-card--clickable/)
    assert.match(vnode.props.class, /wf-card--hover/)
  })

  it('applies active selected state', async () => {
    const vnode = await renderVNode(Card, { active: true, children: 'x' }, createTestCtx())!
    assert.match(vnode.props.class, /wf-card--active/)
  })

  it('可点击卡片键盘 Enter/Space 触发 onClick（role=button 可操作红线）', async () => {
    let clicks = 0
    const vnode = await renderVNode(Card, { clickable: true, onClick: () => clicks++ }, createTestCtx())!
    assert.equal(vnode.props.role, 'button')
    assert.equal(vnode.props.tabindex, 0)
    vnode.props.onKeyDown({ key: 'Enter', preventDefault: () => {} })
    vnode.props.onKeyDown({ key: ' ', preventDefault: () => {} })
    assert.equal(clicks, 2)
    // 不可点击卡片无键盘处理
    const plain = await renderVNode(Card, { children: 'x' }, createTestCtx())!
    assert.equal(plain.props.onKeyDown, undefined)
  })
})
