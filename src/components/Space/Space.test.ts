import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Space } from './Space.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const r = Comp(props, ctx)
  return typeof r === 'function' ? r(props) : r
}
const mockCtx = () => ({ ui: { $: () => ({}), render: () => {}, dirty: () => {} } }) as any

describe('Space', () => {
  test('flex 行布局 + gap', () => {
    const v = renderVNode(Space, { children: ['a', 'b'] }, mockCtx())
    assert.match(v.props.class, /wf-space/)
    assert.equal(v.props.style.gap, 'var(--wf-space-md, 16px)')
  })
  test('direction=vertical → column', () => {
    const v = renderVNode(Space, { direction: 'vertical', children: ['a'] }, mockCtx())
    assert.match(v.props.class, /wf-space--vertical/)
  })
  test('size 自定义', () => {
    const v = renderVNode(Space, { size: 8, children: ['a'] }, mockCtx())
    assert.equal(v.props.style.gap, '8px')
  })
  test('wrap 换行', () => {
    const v = renderVNode(Space, { wrap: true, children: ['a'] }, mockCtx())
    assert.equal(v.props.style.flexWrap, 'wrap')
  })
  test('split 分隔符', () => {
    const v = renderVNode(Space, { split: '|', children: ['a', 'b', 'c'] }, mockCtx())
    const kids = v.props.children
    assert.equal(kids.length, 5, '分隔符插入')
    assert.equal(kids[1].props.children, '|')
  })
})
