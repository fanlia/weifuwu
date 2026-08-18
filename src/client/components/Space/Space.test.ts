import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Space } from './Space.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'


describe('Space', () => {
  test('flex 行布局 + gap', async () => {
    const v = await renderVNode(Space, { children: ['a', 'b'] }, createTestCtx())
    assert.match(v.props.class, /wf-space/)
    assert.equal(v.props.style.gap, 'var(--wf-space-md, 16px)')
  })
  test('direction=vertical → column', async () => {
    const v = await renderVNode(Space, { direction: 'vertical', children: ['a'] }, createTestCtx())
    assert.match(v.props.class, /wf-space--vertical/)
  })
  test('size 自定义', async () => {
    const v = await renderVNode(Space, { size: 8, children: ['a'] }, createTestCtx())
    assert.equal(v.props.style.gap, '8px')
  })
  test('wrap 换行', async () => {
    const v = await renderVNode(Space, { wrap: true, children: ['a'] }, createTestCtx())
    assert.equal(v.props.style.flexWrap, 'wrap')
  })
  test('split 分隔符', async () => {
    const v = await renderVNode(Space, { split: '|', children: ['a', 'b', 'c'] }, createTestCtx())
    const kids = v.props.children
    assert.equal(kids.length, 5, '分隔符插入')
    assert.equal(kids[1].props.children, '|')
  })
})
