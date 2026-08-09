import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Grid, Col, gridColumns } from './Grid.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const r = Comp(props, ctx)
  return typeof r === 'function' ? r(props) : r
}
const mockCtx = () => ({ ui: { $: () => ({}), render: () => {}, dirty: () => {} } }) as any

describe('gridColumns（纯函数）', () => {
  test('span → 百分比宽度', () => {
    assert.equal(gridColumns(6), '25%')
    assert.equal(gridColumns(12), '50%')
    assert.equal(gridColumns(24), '100%')
  })
  test('flex=1 → 剩余空间', () => {
    assert.equal(gridColumns(0), '1')
  })
})

describe('Grid', () => {
  test('渲染栅格容器 + gutter', () => {
    const v = renderVNode(Grid, { gutter: 16, children: ['a'] }, mockCtx())
    assert.match(v.props.class, /wf-grid/)
    assert.equal(v.props.style.margin, '0 -8px')
  })
  test('Col 百分比宽度 + 内 padding', () => {
    const col = renderVNode(Col, { span: 6, children: 'x' }, mockCtx())
    assert.equal(col.props.style.width, '25%')
  })
  test('gutter 传递到 Col padding', () => {
    const col = renderVNode(Col, { span: 6, gutter: 16, children: 'x' }, mockCtx())
    assert.equal(col.props.style.padding, '0 8px')
  })
  test('flex 容器模式（antd Flex 等价）', () => {
    const v = renderVNode(Grid, { flex: true, children: ['a', 'b'] }, mockCtx())
    assert.match(v.props.class, /wf-grid--flex/)
  })
})
