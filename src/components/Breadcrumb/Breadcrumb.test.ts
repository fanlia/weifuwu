import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Breadcrumb } from './Breadcrumb.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Breadcrumb', () => {
  it('renders items with separators', () => {
    const items = [
      { label: '首页', href: '/' },
      { label: '用户管理', href: '/users' },
      { label: '编辑' },
    ]
    const vnode = Breadcrumb({ items }, mockCtx())!
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
    const vnode = Breadcrumb({ items: [{ label: '首页' }] }, mockCtx())!
    assert.equal(vnode.type, 'nav')
    assert.equal(vnode.props['aria-label'], '面包屑')
  })

  it('marks last item with aria-current', () => {
    const items = [
      { label: '首页', href: '/' },
      { label: '当前页' },
    ]
    const vnode = Breadcrumb({ items }, mockCtx())!
    const last = vnode.props.children[2]
    assert.equal(last.props['aria-current'], 'page')
  })

  it('renders items without href as span', () => {
    const vnode = Breadcrumb({ items: [{ label: '首页' }, { label: '二级' }] }, mockCtx())!
    const first = vnode.props.children[0]
    assert.equal(first.type, 'span')
    assert.equal(first.props.children, '首页')
  })
})
