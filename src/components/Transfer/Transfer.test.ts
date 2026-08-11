import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Transfer } from './Transfer.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { renderVNode } from '../../ui-dom/testing.ts'

function createTestCtx(): WfuiContext {
  const state = new Proxy({}, {
    set(t: any, k, v) { t[k] = v; return true },
    get(t: any, k) { return t[k] },
  })
  return { ui: { $: () => state, render: () => {}, dirty: () => {}, ready: true } } as any
}


const data = [
  { key: 'a', label: '选项A' },
  { key: 'b', label: '选项B' },
  { key: 'c', label: '选项C' },
  { key: 'd', label: '选项D' },
]

describe('Transfer', () => {
  it('renders two lists and actions', async () => {
    const vnode = await renderVNode(Transfer, { data, targetKeys: ['a'] }, createTestCtx())!
    assert.match(vnode.props.class, /wf-transfer/)
    // 结构：左列表 + 按钮区 + 右列表
    assert.equal(vnode.props.children.length, 3)
  })

  it('left list excludes target keys', async () => {
    const vnode = await renderVNode(Transfer, { data, targetKeys: ['a', 'c'] }, createTestCtx())!
    const leftItems = vnode.props.children[0].props.children[1].props.children
    const labels = leftItems.map((i: any) => i.props.children)
    assert.deepEqual(labels, ['选项B', '选项D'])
  })

  it('right list shows target keys', async () => {
    const vnode = await renderVNode(Transfer, { data, targetKeys: ['a', 'c'] }, createTestCtx())!
    const rightItems = vnode.props.children[2].props.children[1].props.children
    const labels = rightItems.map((i: any) => i.props.children)
    assert.deepEqual(labels, ['选项A', '选项C'])
  })

  it('selecting left item and moving adds to target', async () => {
    let got: string[] = ['a']
    const ctx = createTestCtx()
    const result = await Transfer({ data, targetKeys: ['a'], onChange: (k: string[]) => { got = k } }, ctx)
    const render = result as any
    let v = render({ data, targetKeys: ['a'], onChange: (k: string[]) => { got = k } })
    // 左列点击 B（选中）→ 点击 → 按钮
    const leftItem = v.props.children[0].props.children[1].props.children[0]
    leftItem.props.onClick()
    v = render({ data, targetKeys: ['a'], onChange: (k: string[]) => { got = k } })
    const rightBtn = v.props.children[1].props.children[1] // 右侧按钮（→）
    rightBtn.props.onClick()
    assert.deepEqual(got, ['a', 'b'])
  })

  it('selecting right item and moving back removes', async () => {
    let got: string[] = ['a', 'b']
    const ctx = createTestCtx()
    const result = await Transfer({ data, targetKeys: ['a', 'b'], onChange: (k: string[]) => { got = k } }, ctx)
    const render = result as any
    let v = render({ data, targetKeys: ['a', 'b'], onChange: (k: string[]) => { got = k } })
    const rightItem = v.props.children[2].props.children[1].props.children[0]
    rightItem.props.onClick()
    v = render({ data, targetKeys: ['a', 'b'], onChange: (k: string[]) => { got = k } })
    const leftBtn = v.props.children[1].props.children[0] // 左侧按钮（←）
    leftBtn.props.onClick()
    assert.deepEqual(got, ['b'])
  })

  it('move button disabled when nothing selected', async () => {
    const vnode = await renderVNode(Transfer, { data, targetKeys: [] }, createTestCtx())!
    const rightBtn = vnode.props.children[1].props.children[1]
    assert.equal(rightBtn.props.disabled, true)
  })

  it('renders titles', async () => {
    const vnode = await renderVNode(Transfer, { data, targetKeys: [], titles: ['源列表', '目标列表'] }, createTestCtx())!
    assert.equal(vnode.props.children[0].props.children[0].props.children, '源列表')
    assert.equal(vnode.props.children[2].props.children[0].props.children, '目标列表')
  })

  it('disabled items not selectable', async () => {
    const withDis = [{ key: 'a', label: 'A', disabled: true }, { key: 'b', label: 'B' }]
    const vnode = await renderVNode(Transfer, { data: withDis, targetKeys: [] }, createTestCtx())!
    const leftItem = vnode.props.children[0].props.children[1].props.children[0]
    assert.equal(leftItem.props.onClick, undefined)
    assert.match(leftItem.props.class, /--dis/)
  })
})

it('showSearch：输入过滤两侧列表 + 无匹配提示', async () => {
  const ctx = createTestCtx()
  const factory = await Transfer({}, ctx)
  let vnode = factory({ data, targetKeys: ['a'], showSearch: true })
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-transfer-search'), '搜索框渲染')
  // 模拟左侧输入「B」（render-only：onInput 事件驱动内部状态）
  vnode.props.children[0].props.children[1].props.onInput({ target: { value: 'B' } })
  vnode = factory({ data, targetKeys: ['a'], showSearch: true })
  const leftItems = vnode.props.children[0].props.children[2].props.children
  const labels = leftItems.map((i: any) => i.props?.children).filter(Boolean)
  // 左侧原 [B,D]（a 在 target），过滤 B → 仅「选项B」
  assert.deepEqual(labels, ['选项B'])
  // 无匹配：输入 Z
  vnode.props.children[0].props.children[1].props.onInput({ target: { value: 'Z' } })
  vnode = factory({ data, targetKeys: ['a'], showSearch: true })
  assert.ok(JSON.stringify(vnode).includes('无匹配'), '无匹配提示')
})
