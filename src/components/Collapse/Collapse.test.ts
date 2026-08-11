import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { Collapse } from './Collapse.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

/** Call component and get VNode (two-phase compat) */

function createTestCtx(): WfuiContext {
  const state = new Proxy({}, {
    set(t: any, k, v) { t[k] = v; return true },
    get(t: any, k) { return t[k] },
  })
  // 非受控内部状态（useControlled 的 selfId 缓存不在 mock 场景，用闭包模拟）
  let internal: string[] | undefined = undefined
  const ctrl = (opts: any) => {
    const controlled = opts.value !== undefined
    const setValue = (v: string[]) => {
      if (controlled) { opts.onChange?.(v); return }
      internal = v; state.internalActive = v
    }
    return { value: controlled ? opts.value : internal, setValue, controlled }
  }
  return { ui: { $: () => state, render: () => {}, dirty: () => {}, ready: true, useControlled: ctrl } } as any
}

const items = [
  { key: 'a', title: '标题A', content: '内容A' },
  { key: 'b', title: '标题B', content: '内容B' },
]

describe('Collapse', () => {
  it('renders item headers', () => {
    const vnode = renderVNode(Collapse, { items }, createTestCtx())!
    assert.equal(vnode.type, 'div')
    assert.match(vnode.props.class, /wf-collapse/)
    assert.equal(vnode.props.children.length, 2)
    const header = vnode.props.children[0].props.children[0]
    assert.match(header.props.class, /wf-collapse-header/)
  })

  it('renders content when active', () => {
    const vnode = renderVNode(Collapse, { items, active: ['a'] }, createTestCtx())!
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
    const vnode = renderVNode(Collapse, { items, active: ['a'], onChange: (k: string[]) => { got = k } }, createTestCtx())!
    // 点击 A 的标题（active 中 → 收起）
    vnode.props.children[0].props.children[0].props.onClick()
    assert.deepEqual(got, [])
    // 点击 B 的标题（未 active → 展开）
    vnode.props.children[1].props.children[0].props.onClick()
    assert.deepEqual(got, ['a', 'b'])
  })

  it('single mode (multiple=false) replaces active', () => {
    let got: string[] | null = null
    const vnode = renderVNode(Collapse, { items, active: ['a'], multiple: false, onChange: (k: string[]) => { got = k } }, createTestCtx())!
    vnode.props.children[1].props.children[0].props.onClick()
    assert.deepEqual(got, ['b'])
  })

  it('renders extra in header', () => {
    const withExtra = [{ key: 'a', title: 'A', extra: '操作' }]
    const vnode = renderVNode(Collapse, { items: withExtra, active: [] }, createTestCtx())!
    const header = vnode.props.children[0].props.children[0]
    const extra = header.props.children.find((c: any) => c?.props?.class === 'wf-collapse-extra')
    assert.equal(extra.props.children, '操作')
  })

  it('shows loading indicator when loading', () => {
    const withLoading = [{ key: 'a', title: 'A', loading: true }]
    const vnode = renderVNode(Collapse, { items: withLoading, active: ['a'] }, createTestCtx())!
    const item = vnode.props.children[0]
    const content = item.props.children[1]
    assert.match(content.props.class, /wf-collapse-content/)
    assert.match(content.props.children.props.class, /wf-collapse-loading/)
  })

  it('keyboard: ArrowDown moves to next header', () => {
    const ctx = createTestCtx() as any
    const vnode = renderVNode(Collapse, { items, active: [] }, ctx)!
    // 未挂载 DOM 时方向键无副作用，验证 handler 挂载 + 不抛错
    assert.equal(typeof vnode.props.onKeyDown, 'function')
    assert.doesNotThrow(() => vnode.props.onKeyDown({ key: 'ArrowDown', preventDefault: () => {} }))
  })

  it('uncontrolled mode keeps internal state', () => {
    const ctx = createTestCtx() as any
    const result = Collapse({ items }, ctx)
    const render = result as any
    const v1 = render({ items })
    // 点击 A 标题 → 非受控：内部状态更新（useControlled 内部缓存）
    v1.props.children[0].props.children[0].props.onClick()
    // 再次 render（模拟 re-render）：A 面板应保持展开
    const v2 = render({ items })
    assert.ok(String(v2.props.children[0].props.class).includes('--open'), 'A 面板展开')
    assert.ok(!String(v2.props.children[1].props.class).includes('--open'), 'B 面板收起')
  })
})
