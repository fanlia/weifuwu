import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { Scrollbar } from './Scrollbar.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const r = Comp(props, ctx)
  return typeof r === 'function' ? r(props) : r
}
const mockCtx = () => ({ ui: { $: () => ({}), render: () => {}, dirty: () => {} } }) as any

describe('Scrollbar', () => {
  test('渲染滚动容器 + maxHeight', () => {
    const v = renderVNode(Scrollbar, { maxHeight: 300, children: 'x' }, mockCtx())
    assert.match(v.props.class, /wf-scrollbar/)
    assert.equal(v.props.style.maxHeight, '300px')
    assert.equal(v.props.style.overflowY, 'auto')
  })
  test('可见/隐藏（hover 显示滚动条）', () => {
    const v = renderVNode(Scrollbar, { always: true, children: 'x' }, mockCtx())
    assert.match(v.props.class, /wf-scrollbar--always/)
  })
  test('横向滚动', () => {
    const v = renderVNode(Scrollbar, { orientation: 'horizontal', children: 'x' }, mockCtx())
    assert.equal(v.props.style.overflowX, 'auto')
  })
})
