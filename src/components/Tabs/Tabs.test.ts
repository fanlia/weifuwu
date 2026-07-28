import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Tabs } from './Tabs.ts'
import type { WfuiContext } from '../../client/types.ts'

/** Call component and get VNode (two-phase compat) */
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  return { ui: { $: {}
, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Tabs', () => {
  const items = [
    { key: 'a', label: '标签A', content: '内容A' },
    { key: 'b', label: '标签B', content: '内容B' },
  ]

  it('renders tab buttons', () => {
    const vnode = renderVNode(Tabs, { items }, mockCtx())!
    const tabList = vnode.props.children[0]
    assert.equal(tabList.props.children.length, 2)
    assert.equal(tabList.props.children[0].props.children, '标签A')
    assert.equal(tabList.props.children[1].props.children, '标签B')
  })

  it('returns null when no items', () => {
    const result = renderVNode(Tabs, { items: [] }, mockCtx())
    assert.equal(result, null)
  })

  it('activates first tab by default', () => {
    const vnode = renderVNode(Tabs, { items }, mockCtx())!
    const tabList = vnode.props.children[0]
    assert.match(tabList.props.children[0].props.class, /wf-tab--active/)
    assert.ok(!tabList.props.children[1].props.class?.includes('wf-tab--active'))
  })

  it('activates specified tab', () => {
    const vnode = renderVNode(Tabs, { items, active: 'b' }, mockCtx())!
    const tabList = vnode.props.children[0]
    assert.ok(!tabList.props.children[0].props.class?.includes('wf-tab--active'))
    assert.match(tabList.props.children[1].props.class, /wf-tab--active/)
  })

  it('renders active tab content', () => {
    const vnode = renderVNode(Tabs, { items }, mockCtx())!
    const content = vnode.props.children[1]
    assert.equal(content.props.class, 'wf-tab-content')
    assert.equal(content.props.children, '内容A')
  })
})
