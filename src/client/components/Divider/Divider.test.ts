import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Divider } from './Divider.ts'
import type { UIContext } from '../../vdom/index.ts'
import { renderVNode, createTestCtx } from '../../vdom/testing.ts'

/** Call component and get VNode (two-phase compat) */



describe('Divider', () => {
  it('renders horizontal divider', async () => {
    const vnode = await renderVNode(Divider, {}, createTestCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-divider/)
    assert.equal(vnode.props.role, 'separator')
  })

  it('renders vertical divider', async () => {
    const vnode = await renderVNode(Divider, { vertical: true }, createTestCtx())!
    assert.match(vnode.props.class, /wf-divider--vertical/)
  })

  it('renders divider with text', async () => {
    const vnode = await renderVNode(Divider, { children: '或' }, createTestCtx())!
    assert.match(vnode.props.class, /wf-divider--with-text/)
    assert.equal(vnode.props.children.type, 'span')
    assert.equal(vnode.props.children.props.class, 'wf-divider-text')
    assert.equal(vnode.props.children.props.children, '或')
  })
})

it('children 文本渲染（text 分隔）', async () => {
  const vnode = await renderVNode(Divider, { children: '或' }, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-divider-text'), '文本标签类')
  assert.ok(s.includes('或'), '文本渲染')
})

it('无 children 纯线（无标签结构）', async () => {
  const vnode = await renderVNode(Divider, {}, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(!s.includes('wf-divider-text'), '纯线无标签')
})

it('role=separator（语义分隔）', async () => {
  const vnode = await renderVNode(Divider, {}, createTestCtx())!
  assert.equal(vnode.props.role, 'separator')
})
