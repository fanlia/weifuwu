import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Breadcrumb } from './Breadcrumb.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */


describe('Breadcrumb', () => {
  it('renders items with separators', async () => {
    const items = [
      { label: '首页', href: '/' },
      { label: '用户管理', href: '/users' },
      { label: '编辑' },
    ]
    const vnode = await renderVNode(Breadcrumb, { items }, createTestCtx())!
    // nav > [a, sep, a, sep, span]
    const children = vnode.props.children
    assert.equal(children.length, 5)
    assert.equal(children[0].type, 'a')
    assert.equal(children[0].props.children, '首页')
    assert.equal(children[2].type, 'a')
    assert.equal(children[2].props.children, '用户管理')
    assert.equal(children[4].type, 'span')
    assert.equal(children[4].props.children, '编辑')
  })

  it('renders nav with aria-label', async () => {
    const vnode = await renderVNode(Breadcrumb, { items: [{ label: '首页' }] }, createTestCtx())!
    assert.equal(vnode.type, 'nav')
    assert.equal(vnode.props['aria-label'], '面包屑')
  })

  it('marks last item with aria-current', async () => {
    const items = [
      { label: '首页', href: '/' },
      { label: '当前页' },
    ]
    const vnode = await renderVNode(Breadcrumb, { items }, createTestCtx())!
    const last = vnode.props.children[2]
    assert.equal(last.props['aria-current'], 'page')
  })

  it('renders items without href as span', async () => {
    const vnode = await renderVNode(Breadcrumb, { items: [{ label: '首页' }, { label: '二级' }] }, createTestCtx())!
    const first = vnode.props.children[0]
    assert.equal(first.type, 'span')
    assert.equal(first.props.children, '首页')
  })
})

it('末项 aria-current=page（当前位置语义）', async () => {
  const vnode = await renderVNode(Breadcrumb, { items: [{ label: '首页', href: '/' }, { label: '详情' }] }, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-breadcrumb-current'), '末项 current 类')
  assert.ok(s.includes('aria-current'), '末项 aria-current')
})

it('分隔符渲染（/ 隐藏于辅助树）', async () => {
  const vnode = await renderVNode(Breadcrumb, { items: [{ label: 'A', href: '/a' }, { label: 'B' }] }, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-breadcrumb-sep'), '分隔符存在')
  assert.ok(s.includes('aria-hidden'), '分隔符 aria-hidden')
})

it('无 href 中间项渲染为文本（不可点）', async () => {
  const vnode = await renderVNode(Breadcrumb, { items: [{ label: 'A' }, { label: 'B' }] }, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-breadcrumb-text'), '文本项类')
})

it('nav aria-label 面包屑', async () => {
  const vnode = await renderVNode(Breadcrumb, { items: [{ label: 'A' }] }, createTestCtx())!
  assert.equal(vnode.type, 'nav')
  assert.equal(vnode.props['aria-label'], '面包屑')
})

it('单一项（只有当前页）', async () => {
  const vnode = await renderVNode(Breadcrumb, { items: [{ label: '首页' }] }, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-breadcrumb-current'))
  assert.ok(!s.includes('wf-breadcrumb-sep'), '单项无分隔符')
})
