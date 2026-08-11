import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Tabs } from './Tabs.ts'
import { mountVNode } from '../../ui-dom/render.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */

function createTestCtx(): WfuiContext {
  const uncontrolled = new Map<string, any>()
  const state: any = {}
  return { ui: { $: () => state
, render: () => {}, dirty: () => {}, ready: true,
    useControlled: (opts: any) => {
      const controlled = opts.value !== undefined
      const key = opts.name ?? 'default'
      if (!uncontrolled.has(key)) uncontrolled.set(key, opts.value)
      const setValue = (v: any) => {
        if (controlled) opts.onChange?.(v)
        else { uncontrolled.set(key, v); }
      }
      return { value: controlled ? opts.value : uncontrolled.get(key), setValue, controlled }
    },
  } } as any
}

describe('Tabs', () => {
  const items = [
    { key: 'a', label: '标签A', content: '内容A' },
    { key: 'b', label: '标签B', content: '内容B' },
  ]

  it('renders tab buttons', async () => {
    const vnode = await renderVNode(Tabs, { items }, createTestCtx())!
    const tabList = vnode.props.children[0]
    // tabList.children = [...tabButtons, inkBar]（末位为滑动指示器）
    const tabs = tabList.props.children.filter((c: any) => c.props?.role === 'tab')
    assert.equal(tabs.length, 2)
    assert.equal(tabs[0].props.children, '标签A')
    assert.equal(tabs[1].props.children, '标签B')
    // ink bar 存在
    assert.ok(tabList.props.children.some((c: any) => c.props?.class === 'wf-tab-ink'))
  })

  it('returns null when no items', async () => {
    const result = await renderVNode(Tabs, { items: [] }, createTestCtx())
    assert.equal(result, null)
  })

  it('activates first tab by default', async () => {
    const vnode = await renderVNode(Tabs, { items }, createTestCtx())!
    const tabList = vnode.props.children[0]
    assert.match(tabList.props.children[0].props.class, /wf-tab--active/)
    assert.ok(!tabList.props.children[1].props.class?.includes('wf-tab--active'))
  })

  it('activates specified tab', async () => {
    const vnode = await renderVNode(Tabs, { items, active: 'b' }, createTestCtx())!
    const tabList = vnode.props.children[0]
    assert.ok(!tabList.props.children[0].props.class?.includes('wf-tab--active'))
    assert.match(tabList.props.children[1].props.class, /wf-tab--active/)
  })

  it('renders active tab content', async () => {
    const vnode = await renderVNode(Tabs, { items }, createTestCtx())!
    const content = vnode.props.children[1]
    assert.equal(content.props.class, 'wf-tab-content')
    assert.equal(content.props.children, '内容A')
  })

  it('roving tabindex：仅激活 tab 可 Tab 聚焦', async () => {
    const vnode = await renderVNode(Tabs, { items }, createTestCtx())!
    const tabs = vnode.props.children[0].props.children
    assert.equal(tabs[0].props.tabindex, 0)
    assert.equal(tabs[1].props.tabindex, -1)
    assert.equal(tabs[0].props['aria-selected'], 'true')
    assert.equal(tabs[1].props['aria-selected'], 'false')
  })

  it('方向键环形切换 + 焦点跟随（DOM 事件）', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container) // jsdom：未连接文档的元素 .focus() 无效
    const changed: string[] = []
    const vnode = await renderVNode(Tabs, { items, onChange: (k: string) => changed.push(k) }, createTestCtx())!
    await mountVNode(container, vnode, createTestCtx())
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

it('受控 active + onChange（点击切换通知）', async () => {
  let got: string | undefined
  const items = [{ key: 'a', label: 'A', children: 'ca' }, { key: 'b', label: 'B', children: 'cb' }]
  const vnode = await renderVNode(Tabs, { items, active: 'a', onChange: (k: string) => { got = k } }, createTestCtx())!
  const find = (n: any, acc: any[] = []): any[] => {
    if (!n || typeof n !== 'object') return acc
    if (n.props?.role === 'tab') acc.push(n)
    const k = n.props?.children
    if (Array.isArray(k)) k.forEach(c => find(c, acc))
    return acc
  }
  const tabs = find(vnode)
  assert.ok(tabs.length === 2, '两个 tab')
  tabs[1].props.onClick()
  assert.equal(got, 'b', '点击 B 通知 onChange(b)')
})
