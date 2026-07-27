import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Tabs } from './Tabs.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Tabs', () => {
  const items = [
    { key: 'a', label: '标签A', content: '内容A' },
    { key: 'b', label: '标签B', content: '内容B' },
  ]

  it('renders tab buttons', () => {
    const vnode = Tabs({ items }, mockCtx())!
    const tabList = vnode.props.children[0]
    assert.equal(tabList.props.children.length, 2)
    assert.equal(tabList.props.children[0].props.children, '标签A')
    assert.equal(tabList.props.children[1].props.children, '标签B')
  })

  it('returns null when no items', () => {
    const result = Tabs({ items: [] }, mockCtx())
    assert.equal(result, null)
  })

  it('activates first tab by default', () => {
    const vnode = Tabs({ items }, mockCtx())!
    const tabList = vnode.props.children[0]
    assert.match(tabList.props.children[0].props.class, /wf-tab--active/)
    assert.ok(!tabList.props.children[1].props.class?.includes('wf-tab--active'))
  })

  it('activates specified tab', () => {
    const vnode = Tabs({ items, active: 'b' }, mockCtx())!
    const tabList = vnode.props.children[0]
    assert.ok(!tabList.props.children[0].props.class?.includes('wf-tab--active'))
    assert.match(tabList.props.children[1].props.class, /wf-tab--active/)
  })

  it('renders active tab content', () => {
    const vnode = Tabs({ items }, mockCtx())!
    const content = vnode.props.children[1]
    assert.equal(content.props.class, 'wf-tab-content')
    assert.equal(content.props.children, '内容A')
  })
})
