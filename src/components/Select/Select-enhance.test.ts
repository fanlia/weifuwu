import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Select } from './Select.ts'
import type { WfuiContext } from '../../client/types.ts'

function childrenOf(vnode: any): any[] {
  if (!vnode) return []
  return Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children]
}

/** 创建一个可追踪状态的 $ proxy */
function createState(initial: Record<string, any>) {
  const state: any = { ...initial }
  return new Proxy(state, {
    set(t, k, v) { t[k as any] = v; return true },
    get(t, k) { return t[k as any] },
  })
}

/** 展平取所有后代 VNode */
function allNodes(vnode: any): any[] {
  if (!vnode || typeof vnode !== 'object') return []
  const result: any[] = [vnode]
  const kids = vnode.props?.children
  if (kids) {
    const arr = Array.isArray(kids) ? kids : [kids]
    for (const kid of arr) result.push(...allNodes(kid))
  }
  return result
}

function mockCtx(): WfuiContext {
  const state = createState({})
  return { ui: { $: () => state, render: () => {}, dirty: () => {}, ready: true, usePopup: (opts: any) => ({ get open() { return opts.isOpen() }, setOpen: opts.setOpen, refresh: () => {}, portal: (c: any) => (opts.isOpen() ? c : null), wrapProps: {} }) } } as any
}

describe('Select 增强（键盘导航 + multiple）', () => {
  const opts = [
    { value: 'a', label: '选项A' },
    { value: 'b', label: '选项B' },
    { value: 'c', label: '选项C' },
  ]

  function openSelect(props: any) {
    const ctx = mockCtx()
    const result = Select({ searchable: true, options: opts, ...props }, ctx)
    const render = result as any
    const vnode = render({ searchable: true, options: opts, ...props })
    // 打开菜单
    const input = allNodes(vnode).find((n: any) => n.props?.class === 'wf-select-search-input')
    input.props.onFocus()
    const vnode2 = render({ searchable: true, options: opts, ...props })
    return { ctx, render, vnode2 }
  }

  it('multiple: renders selected tags in trigger', () => {
    const { vnode2 } = openSelect({ multiple: true, value: ['a', 'c'] })
    const tags = allNodes(vnode2).filter((n: any) => n.props?.class === 'wf-select-tag')
    assert.equal(tags.length, 2)
    assert.equal(tags[0].props.children[0], '选项A')
  })

  it('multiple: click option toggles value', () => {
    let got: any = null
    const ctx = mockCtx()
    const render = Select({ searchable: true, multiple: true, options: opts, value: ['a'], onChange: (v: any) => { got = v } }, ctx) as any
    render({ searchable: true, multiple: true, options: opts, value: ['a'], onChange: (v: any) => { got = v } })
    // 打开 + 点击 option B
    const closed = render({ searchable: true, multiple: true, options: opts, value: ['a'], onChange: (v: any) => { got = v } })
    const input = allNodes(closed).find((n: any) => n.props?.class === 'wf-select-search-input')
    input.props.onFocus()
    const open = render({ searchable: true, multiple: true, options: opts, value: ['a'], onChange: (v: any) => { got = v } })
    const optB = allNodes(open).find((n: any) => n.props?.class?.includes('wf-select-search-opt') && n.props.children === '选项B')
    optB.props.onMouseDown({ preventDefault: () => {} })
    assert.deepEqual(got, ['a', 'b'])
    // 再点 B → 移除
    const open2 = render({ searchable: true, multiple: true, options: opts, value: ['a', 'b'], onChange: (v: any) => { got = v } })
    const optB2 = allNodes(open2).find((n: any) => n.props?.class?.includes('wf-select-search-opt') && n.props.children === '选项B')
    optB2.props.onMouseDown({ preventDefault: () => {} })
    assert.deepEqual(got, ['a'])
  })

  it('multiple: tag close removes value', () => {
    let got: any = null
    const ctx = mockCtx()
    const render = Select({ searchable: true, multiple: true, options: opts, value: ['a', 'b'], onChange: (v: any) => { got = v } }, ctx) as any
    const vnode = render({ searchable: true, multiple: true, options: opts, value: ['a', 'b'], onChange: (v: any) => { got = v } })
    const closeBtn = allNodes(vnode).find((n: any) => n.props?.class === 'wf-select-tag-close')
    closeBtn.props.onClick({ stopPropagation: () => {} })
    assert.deepEqual(got, ['b'])
  })

  it('keyboard: ArrowDown highlights first option, Enter selects', () => {
    let got: any = null
    const ctx = mockCtx()
    const render = Select({ searchable: true, options: opts, onChange: (v: any) => { got = v } }, ctx) as any
    const vnode = render({ searchable: true, options: opts, onChange: (v: any) => { got = v } })
    const input = allNodes(vnode).find((n: any) => n.props?.class === 'wf-select-search-input')
    // 打开 + 下移 + Enter
    input.props.onFocus()
    const vnode2 = render({ searchable: true, options: opts, onChange: (v: any) => { got = v } })
    const input2 = allNodes(vnode2).find((n: any) => n.props?.class === 'wf-select-search-input')
    input2.props.onKeyDown({ key: 'ArrowDown', preventDefault: () => {} })
    const vnode3 = render({ searchable: true, options: opts, onChange: (v: any) => { got = v } })
    const input3 = allNodes(vnode3).find((n: any) => n.props?.class === 'wf-select-search-input')
    input3.props.onKeyDown({ key: 'Enter', preventDefault: () => {} })
    assert.equal(got, 'a')
  })

  it('keyboard: ArrowDown twice then Enter selects second option', () => {
    let got: any = null
    const ctx = mockCtx()
    const render = Select({ searchable: true, options: opts, onChange: (v: any) => { got = v } }, ctx) as any
    const step = (key: string) => {
      const v = render({ searchable: true, options: opts, onChange: (v: any) => { got = v } })
      const input = allNodes(v).find((n: any) => n.props?.class === 'wf-select-search-input')
      input.props.onKeyDown({ key, preventDefault: () => {} })
    }
    step('ArrowDown'); step('ArrowDown'); step('Enter')
    assert.equal(got, 'b')
  })

  it('keyboard: Escape closes menu', () => {
    const ctx = mockCtx()
    const render = Select({ searchable: true, options: opts }, ctx) as any
    const vnode = render({ searchable: true, options: opts })
    const input = allNodes(vnode).find((n: any) => n.props?.class === 'wf-select-search-input')
    input.props.onFocus()
    let v2 = render({ searchable: true, options: opts })
    assert.ok(allNodes(v2).some((n: any) => n.props?.class === 'wf-select-search-menu'))
    const input2 = allNodes(v2).find((n: any) => n.props?.class === 'wf-select-search-input')
    input2.props.onKeyDown({ key: 'Escape', preventDefault: () => {} })
    v2 = render({ searchable: true, options: opts })
    assert.ok(!allNodes(v2).some((n: any) => n.props?.class === 'wf-select-search-menu'))
  })

  it('keyboard: highlight class applied to highlighted option', () => {
    const ctx = mockCtx()
    const render = Select({ searchable: true, options: opts }, ctx) as any
    render({ searchable: true, options: opts })
    const v1 = render({ searchable: true, options: opts })
    const input = allNodes(v1).find((n: any) => n.props?.class === 'wf-select-search-input')
    input.props.onFocus()
    const v2 = render({ searchable: true, options: opts })
    const input2 = allNodes(v2).find((n: any) => n.props?.class === 'wf-select-search-input')
    input2.props.onKeyDown({ key: 'ArrowDown', preventDefault: () => {} })
    const v3 = render({ searchable: true, options: opts })
    const hl = allNodes(v3).filter((n: any) => n.props?.class?.includes('wf-select-search-opt--hl'))
    assert.equal(hl.length, 1)
    assert.equal(hl[0].props.children, '选项A')
  })
})
