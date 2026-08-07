import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Tabs } from './Tabs.ts'
import { mountVNode } from '../../client/render.ts'
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

  it('roving tabindex：仅激活 tab 可 Tab 聚焦', () => {
    const vnode = renderVNode(Tabs, { items }, mockCtx())!
    const tabs = vnode.props.children[0].props.children
    assert.equal(tabs[0].props.tabindex, 0)
    assert.equal(tabs[1].props.tabindex, -1)
    assert.equal(tabs[0].props['aria-selected'], 'true')
    assert.equal(tabs[1].props['aria-selected'], 'false')
  })

  it('方向键环形切换 + 焦点跟随（DOM 事件）', () => {
    const container = document.createElement('div')
    document.body.appendChild(container) // jsdom：未连接文档的元素 .focus() 无效
    const changed: string[] = []
    const vnode = renderVNode(Tabs, { items, onChange: (k: string) => changed.push(k) }, mockCtx())!
    mountVNode(container, vnode, mockCtx())
    const tabs = container.querySelectorAll<HTMLElement>('.wf-tab')
    assert.equal(tabs.length, 2)
    tabs[0].focus()
    // ArrowRight → 第二个 tab
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    assert.deepEqual(changed, ['b'])
    assert.equal(document.activeElement, tabs[1], '焦点应跟随到下一 tab')
    // ArrowLeft → 回到第一个（环形）
    tabs[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    assert.deepEqual(changed, ['b', 'a'])
    assert.equal(document.activeElement, tabs[0])
  })
})
