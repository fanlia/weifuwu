import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Collapse } from './Collapse.ts'
import type { WfuiContext } from '../../client/types.ts'

/** Call component and get VNode (two-phase compat) */
function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function mockCtx(): WfuiContext {
  const state = new Proxy({}, {
    set(t: any, k, v) { t[k] = v; return true },
    get(t: any, k) { return t[k] },
  })
  return { ui: { $: () => state, render: () => {}, dirty: () => {}, ready: true } } as any
}

const items = [
  { key: 'a', title: '标题A', content: '内容A' },
  { key: 'b', title: '标题B', content: '内容B' },
]

describe('Collapse', () => {
  it('renders item headers', () => {
    const vnode = renderVNode(Collapse, { items }, mockCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-collapse/)
    assert.equal(vnode.props.children.length, 2)
    const header = vnode.props.children[0].props.children[0]
    assert.match(header.props.class, /wf-collapse-header/)
  })

  it('renders content when active', () => {
    const vnode = renderVNode(Collapse, { items, active: ['a'] }, mockCtx())!
    const itemA = vnode.props.children[0]
    // 展开：有 content 区
    const content = itemA.props.children[1]
    assert.match(content.props.class, /wf-collapse-content/)
    assert.equal(content.props.children, '内容A')
    // 收起：无 content
    const itemB = vnode.props.children[1]
    assert.equal(itemB.props.children.length, 1)
  })

  it('click header toggles active', () => {
    let got: string[] | null = null
    const vnode = renderVNode(Collapse, { items, active: ['a'], onChange: (k: string[]) => { got = k } }, mockCtx())!
    // 点击 A 的标题（active 中 → 收起）
    vnode.props.children[0].props.children[0].props.onClick()
    assert.deepEqual(got, [])
    // 点击 B 的标题（未 active → 展开）
    vnode.props.children[1].props.children[0].props.onClick()
    assert.deepEqual(got, ['a', 'b'])
  })

  it('single mode (multiple=false) replaces active', () => {
    let got: string[] | null = null
    const vnode = renderVNode(Collapse, { items, active: ['a'], multiple: false, onChange: (k: string[]) => { got = k } }, mockCtx())!
    vnode.props.children[1].props.children[0].props.onClick()
    assert.deepEqual(got, ['b'])
  })

  it('renders extra in header', () => {
    const withExtra = [{ key: 'a', title: 'A', extra: '操作' }]
    const vnode = renderVNode(Collapse, { items: withExtra, active: [] }, mockCtx())!
    const header = vnode.props.children[0].props.children[0]
    const extra = header.props.children.find((c: any) => c?.props?.class === 'wf-collapse-extra')
    assert.equal(extra.props.children, '操作')
  })

  it('shows loading indicator when loading', () => {
    const withLoading = [{ key: 'a', title: 'A', loading: true }]
    const vnode = renderVNode(Collapse, { items: withLoading, active: ['a'] }, mockCtx())!
    const item = vnode.props.children[0]
    const content = item.props.children[1]
    assert.match(content.props.class, /wf-collapse-content/)
    assert.match(content.props.children.props.class, /wf-collapse-loading/)
  })

  it('keyboard: ArrowDown moves to next header', () => {
    const ctx = mockCtx() as any
    const vnode = renderVNode(Collapse, { items, active: [] }, ctx)!
    // 未挂载 DOM 时方向键无副作用，验证 handler 挂载 + 不抛错
    assert.equal(typeof vnode.props.onKeyDown, 'function')
    assert.doesNotThrow(() => vnode.props.onKeyDown({ key: 'ArrowDown', preventDefault: () => {} }))
  })

  it('uncontrolled mode keeps internal state', () => {
    const ctx = mockCtx() as any
    let state: string[] = []
    ctx.ui.$ = () => new Proxy({}, {
      set(t: any, k, v) { t[k] = v; state = v; return true },
      get(t: any, k) { return t[k] },
    })
    const result = Collapse({ items }, ctx)
    const render = result as any
    const v1 = render({ items })
    // 点击 A 标题 → 内部 $ 状态更新
    v1.props.children[0].props.children[0].props.onClick()
    assert.deepEqual(state, ['a'])
  })
})
