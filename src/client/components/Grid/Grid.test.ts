import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Grid, Col, gridColumns } from './Grid.ts'
import { renderVNode, createTestCtx } from '../../vdom/testing.ts'


describe('gridColumns（纯函数）', () => {
  test('span → 百分比宽度', async () => {
    assert.equal(gridColumns(6), '25%')
    assert.equal(gridColumns(12), '50%')
    assert.equal(gridColumns(24), '100%')
  })
  test('flex=1 → 剩余空间', async () => {
    assert.equal(gridColumns(0), '1')
  })
})

describe('Grid', () => {
  test('渲染栅格容器 + gutter', async () => {
    const v = await renderVNode(Grid, { gutter: 16, children: ['a'] }, createTestCtx())
    assert.match(v.props.class, /wf-grid-comp/)
    assert.equal(v.props.style.margin, '0 -8px')
  })
  test('Col 百分比宽度 + 内 padding', async () => {
    const col = await renderVNode(Col, { span: 6, children: 'x' }, createTestCtx())
    assert.equal(col.props.style.width, '25%')
  })
  test('gutter 传递到 Col padding', async () => {
    const col = await renderVNode(Col, { span: 6, gutter: 16, children: 'x' }, createTestCtx())
    assert.equal(col.props.style.padding, '0 8px')
  })
  test('flex 容器模式（antd Flex 等价）', async () => {
    const v = await renderVNode(Grid, { flex: true, children: ['a', 'b'] }, createTestCtx())
    assert.match(v.props.class, /wf-grid-comp--flex/)
  })
})
