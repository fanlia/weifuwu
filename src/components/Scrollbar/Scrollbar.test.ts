import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Scrollbar } from './Scrollbar.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'


describe('Scrollbar', () => {
  test('渲染滚动容器 + maxHeight', () => {
    const v = renderVNode(Scrollbar, { maxHeight: 300, children: 'x' }, createTestCtx())
    assert.match(v.props.class, /wf-scrollbar/)
    assert.equal(v.props.style.maxHeight, '300px')
    assert.equal(v.props.style.overflowY, 'auto')
  })
  test('可见/隐藏（hover 显示滚动条）', () => {
    const v = renderVNode(Scrollbar, { always: true, children: 'x' }, createTestCtx())
    assert.match(v.props.class, /wf-scrollbar--always/)
  })
  test('横向滚动', () => {
    const v = renderVNode(Scrollbar, { orientation: 'horizontal', children: 'x' }, createTestCtx())
    assert.equal(v.props.style.overflowX, 'auto')
  })
})
