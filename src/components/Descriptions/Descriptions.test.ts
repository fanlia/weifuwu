import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Descriptions } from './Descriptions.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'


const items = [
  { label: '名称', value: '小码' },
  { label: '类型', value: 'AI Agent' },
  { label: '状态', value: '运行中' },
]

describe('Descriptions', () => {
  it('渲染 dl 结构（语义）', () => {
    const vnode = renderVNode(Descriptions, { items }, createTestCtx())!
    assert.equal(vnode.type, 'dl')
    assert.match(vnode.props.class, /wf-descriptions/)
    assert.equal(vnode.props.children.length, 3)
    assert.equal(vnode.props.children[0].type, 'div') // item 容器
  })

  it('每项含 dt(label) + dd(value)', () => {
    const vnode = renderVNode(Descriptions, { items }, createTestCtx())!
    const item = vnode.props.children[0]
    const dt = item.props.children.find((c: any) => c.type === 'dt')
    const dd = item.props.children.find((c: any) => c.type === 'dd')
    assert.equal(dt.props.children, '名称')
    assert.equal(dd.props.children, '小码')
  })

  it('column 控制栅格列数类', () => {
    const vnode = renderVNode(Descriptions, { items, column: 2 }, createTestCtx())!
    assert.match(vnode.props.class, /wf-descriptions--2/)
  })

  it('bordered 类', () => {
    const vnode = renderVNode(Descriptions, { items, bordered: true }, createTestCtx())!
    assert.match(vnode.props.class, /wf-descriptions--bordered/)
  })

  it('span 跨列（grid-column）', () => {
    const vnode = renderVNode(Descriptions, { items: [{ label: 'a', value: '1', span: 2 }], column: 2 }, createTestCtx())!
    const item = vnode.props.children[0]
    assert.match(item.props.style.gridColumn, /span 2/)
  })

  it('VNode value 支持（自定义渲染）', () => {
    const vnode = renderVNode(Descriptions, { items: [{ label: 'x', value: { tag: 'strong', props: {}, children: '加粗' } }] }, createTestCtx())!
    const dd = vnode.props.children[0].props.children.find((c: any) => c.type === 'dd')
    assert.equal(dd.props.children.tag, 'strong')
  })
})
