import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../ui-dom/setup.ts'
setupJsdom()
import { Accordion } from './Accordion.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */

function createTestCtx(): WfuiContext {
  const state = new Proxy({}, {
    set(t: any, k, v) { t[k] = v; return true },
    get(t: any, k) { return t[k] },
  })
  return { ui: { $: () => state, render: () => {}, dirty: () => {}, ready: true } } as any
}

describe('Accordion', () => {
  const items = [
    { key: 'a', title: '标题A', content: '内容A' },
    { key: 'b', title: '标题B', content: '内容B' },
  ]

  it('renders accordion items', async () => {
    const vnode = await renderVNode(Accordion, { items }, createTestCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-accordion/)
    assert.equal(vnode.props.children.length, 2)
  })

  it('returns null when no items', async () => {
    const result = await renderVNode(Accordion, { items: [] }, createTestCtx())
    assert.equal(result, null)
  })

  it('renders titles in summaries', async () => {
    const vnode = await renderVNode(Accordion, { items }, createTestCtx())!
    const summary = vnode.props.children[0].props.children[0]
    assert.equal(summary.props.class, 'wf-accordion-summary')
    // children = [title, chevronIcon]
    const titlePart = Array.isArray(summary.props.children) ? summary.props.children[0] : summary.props.children
    assert.equal(titlePart, '标题A')
  })

  it('renders content (非受控默认全展开，向后兼容)', async () => {
    const vnode = await renderVNode(Accordion, { items }, createTestCtx())!
    const content = vnode.props.children[0].props.children[1]
    assert.equal(content.props.class, 'wf-accordion-content')
    assert.equal(content.props.children, '内容A')
  })

  it('click summary toggles (非受控收起)', async () => {
    const ctx = createTestCtx()
    const result = await Accordion({ items }, ctx)
    const render = result as any
    const v1 = await render({ items })
    // 点击 A → 收起（内部状态）
    v1.props.children[0].props.children[0].props.onClick()
    const v2 = await render({ items })
    assert.equal(v2.props.children[0].props.children.length, 1) // 无 content
  })

  it('受控: active 控制展开 + onChange 回传', async () => {
    let got: string[] | null = null
    const vnode = await renderVNode(Accordion, { items, active: ['a'], onChange: (k: string[]) => { got = k } }, createTestCtx())!
    // A 展开，B 收起
    assert.ok(vnode.props.children[0].props.children[1])
    assert.equal(vnode.props.children[1].props.children.length, 1)
    // 点击 B → 手风琴互斥：['b']
    vnode.props.children[1].props.children[0].props.onClick()
    assert.deepEqual(got, ['b'])
  })

  it('multiple 模式多开', async () => {
    let got: string[] | null = null
    const vnode = await renderVNode(Accordion, { items, active: ['a'], multiple: true, onChange: (k: string[]) => { got = k } }, createTestCtx())!
    vnode.props.children[1].props.children[0].props.onClick()
    assert.deepEqual(got, ['a', 'b'])
  })

  it('aria-expanded 同步', async () => {
    const vnode = await renderVNode(Accordion, { items, active: ['a'] }, createTestCtx())!
    assert.equal(vnode.props.children[0].props.children[0].props['aria-expanded'], 'true')
    assert.equal(vnode.props.children[1].props.children[0].props['aria-expanded'], 'false')
  })

  it('disabled 项不可交互', async () => {
    const withDis = [{ key: 'a', title: 'A' }, { key: 'b', title: 'B', disabled: true }]
    const vnode = await renderVNode(Accordion, { items: withDis, active: [] }, createTestCtx())!
    assert.equal(vnode.props.children[1].props.children[0].props.onClick, undefined)
    assert.equal(vnode.props.children[1].props.children[0].props.disabled, true)
  })

  it('键盘方向键 handler 存在且不抛错', async () => {
    const vnode = await renderVNode(Accordion, { items }, createTestCtx())!
    assert.equal(typeof vnode.props.onKeyDown, 'function')
    assert.doesNotThrow(() => vnode.props.onKeyDown({ key: 'ArrowDown', preventDefault: () => {} }))
  })
})
