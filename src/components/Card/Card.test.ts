import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Card } from './Card.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Card', () => {
  it('renders as a div', () => {
    const vnode = Card({ children: '内容' }, mockCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-card/)
  })

  it('renders children', () => {
    const vnode = Card({ children: '卡片内容' }, mockCtx())!
    assert.equal(vnode.props.children, '卡片内容')
  })

  it('applies clickable class and cursor', () => {
    const vnode = Card({ clickable: true, children: '点击' }, mockCtx())!
    assert.match(vnode.props.class, /wf-card--clickable/)
    assert.equal(vnode.props.role, 'button')
  })

  it('applies outlined variant', () => {
    const vnode = Card({ variant: 'outlined', children: '内容' }, mockCtx())!
    assert.match(vnode.props.class, /wf-card--outlined/)
  })

  it('applies padding classes', () => {
    const sm = Card({ padding: 'sm', children: '小' }, mockCtx())!
    const lg = Card({ padding: 'lg', children: '大' }, mockCtx())!
    assert.match(sm.props.class, /wf-card--pad-sm/)
    assert.match(lg.props.class, /wf-card--pad-lg/)
  })
})
