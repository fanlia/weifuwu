import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Breadcrumb } from './Breadcrumb.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode, createTestCtx } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */


describe('Breadcrumb', () => {
  it('renders items with separators', () => {
    const items = [
      { label: '首页', href: '/' },
      { label: '用户管理', href: '/users' },
      { label: '编辑' },
    ]
    const vnode = renderVNode(Breadcrumb, { items }, createTestCtx())!
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

  it('renders nav with aria-label', () => {
    const vnode = renderVNode(Breadcrumb, { items: [{ label: '首页' }] }, createTestCtx())!
    assert.equal(vnode.type, 'nav')
    assert.equal(vnode.props['aria-label'], '面包屑')
  })

  it('marks last item with aria-current', () => {
    const items = [
      { label: '首页', href: '/' },
      { label: '当前页' },
    ]
    const vnode = renderVNode(Breadcrumb, { items }, createTestCtx())!
    const last = vnode.props.children[2]
    assert.equal(last.props['aria-current'], 'page')
  })

  it('renders items without href as span', () => {
    const vnode = renderVNode(Breadcrumb, { items: [{ label: '首页' }, { label: '二级' }] }, createTestCtx())!
    const first = vnode.props.children[0]
    assert.equal(first.type, 'span')
    assert.equal(first.props.children, '首页')
  })
})
