import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Select } from './Select.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'

function childrenOf(vnode: any){
  if (!vnode) return []
  return Array.isArray(vnode.props.children) ? vnode.props.children : [vnode.props.children]
}

/** 创建一个可追踪状态的 $ proxy */
function createState(initial: Record<string, any>){
  const state: any = { ...initial }
  return new Proxy(state, {
    set(t, k, v) { t[k as any] = v; return true },
    get(t, k) { return t[k as any] },
  })
}

/** 展平取所有后代 VNode */
function allNodes(vnode: any){
  if (!vnode || typeof vnode !== 'object') return []
  const result: any[] = [vnode]
  const kids = vnode.props?.children
  if (kids) {
    const arr = Array.isArray(kids) ? kids : [kids]
    for (const kid of arr) result.push(...allNodes(kid))
  }
  return result
}

describe('Select (native)', () => {
  function nativeCtx(){
    const ctx = { ui: { $: () => ({}), render: () => {}, dirty: () => {}, usePopup: (opts: any) => ({ get open() { return opts.isOpen() }, setOpen: opts.setOpen, refresh: () => {}, portal: (c: any) => (opts.isOpen() ? c : null), wrapProps: {} }) } } as any
    return ctx
  }

  it('renders a select element', async () => {
    const ctx = nativeCtx()
    const render = await Select({}, ctx)!
    const vnode = render({ options: [{ value: 'a', label: 'A' }] })
    const select = childrenOf(vnode).find((c: any) => c?.type === 'select')
    assert.ok(select)
  })

  it('renders options from options prop', async () => {
    const ctx = nativeCtx()
    const render = await Select({}, ctx)!
    const vnode = render({ options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] })
    const select = childrenOf(vnode).find((c: any) => c?.type === 'select')
    const options = Array.isArray(select.props.children) ? select.props.children : [select.props.children]
    assert.equal(options.length, 2)
    assert.equal(options[0].props.value, 'a')
    assert.equal(options[0].props.children, 'A')
  })

  it('renders label when provided', async () => {
    const ctx = nativeCtx()
    const render = await Select({}, ctx)!
    const vnode = render({ label: '角色', options: [{ value: 'admin', label: '管理员' }] })
    const labels = childrenOf(vnode).filter((c: any) => c?.props?.class === 'wf-select-label')
    assert.ok(labels.length > 0)
  })

  it('shows placeholder option', async () => {
    const ctx = nativeCtx()
    const render = await Select({}, ctx)!
    const vnode = render({ placeholder: '请选择', options: [{ value: 'a', label: 'A' }] })
    const select = childrenOf(vnode).find((c: any) => c?.type === 'select')
    const options = Array.isArray(select.props.children) ? select.props.children : [select.props.children]
    assert.equal(options.length, 2)
    assert.equal(options[0].props.value, '')
    assert.equal(options[0].props.children, '请选择')
  })

  it('shows error message', async () => {
    const ctx = nativeCtx()
    const render = await Select({}, ctx)!
    const vnode = render({ error: '请选择', options: [{ value: 'a', label: 'A' }] })
    const err = childrenOf(vnode).find((c: any) => c?.props?.class === 'wf-select-err')
    assert.ok(err)
    assert.equal(err.props.children, '请选择')
  })
})

describe('Select (searchable)', () => {
  async function searchableCtx(){
    const state = createState({ open: false, keyword: '', filteredOptions: [] })
    const ctx = { ui: { $: () => state, render: () => {}, dirty: () => {}, usePopup: (opts: any) => ({ get open() { return opts.isOpen() }, setOpen: opts.setOpen, refresh: () => {}, portal: (c: any) => (opts.isOpen() ? c : null), wrapProps: {} }) } } as any
    // mount: 此时组件内会 $.open = false（与 state 一致）
    const render = await Select({}, ctx)!
    return { ctx, state, render }
  }

  it('renders trigger input', async () => {
    const { render } = await searchableCtx()
    const vnode = render({ searchable: true, options: [{ value: 'a', label: 'A' }] })
    const nodes = allNodes(vnode)
    const input = nodes.find((n: any) => n?.props?.class === 'wf-select-search-input')
    assert.ok(input, 'should render search input')
  })

  it('shows menu when state.open is true', async () => {
    const { render, state } = await searchableCtx()
    state.open = true  // 修改状态后 re-render
    const vnode = render({ searchable: true, options: [{ value: 'a', label: 'A' }] })
    const nodes = allNodes(vnode)
    const menu = nodes.find((n: any) => n?.props?.class?.startsWith?.('wf-select-search-menu'))
    assert.ok(menu, 'should render menu when open')
  })

  it('shows selected value in trigger when closed', async () => {
    const { render, state } = await searchableCtx()
    const vnode = render({ searchable: true, value: 'a', options: [{ value: 'a', label: 'A选项' }] })
    const nodes = allNodes(vnode)
    const input = nodes.find((n: any) => n?.props?.class === 'wf-select-search-input')
    assert.ok(input)
    assert.equal(input.props.value, 'A选项')
  })

  it('filters options on keyword', async () => {
    const { render, state } = await searchableCtx()
    state.open = true
    state.keyword = 'Beta'
    const vnode = render({
      searchable: true,
      options: [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
        { value: 'c', label: 'Gamma' },
      ],
    })
    const nodes = allNodes(vnode)
    const opts = nodes.filter((n: any) => n?.props?.class?.startsWith?.('wf-select-search-opt'))
    assert.equal(opts.length, 1)
    assert.equal(opts[0].props.children, 'Beta')
  })

  it('shows empty message when no match', async () => {
    const { render, state } = await searchableCtx()
    state.open = true
    state.keyword = 'XYZ'
    const vnode = render({ searchable: true, options: [{ value: 'a', label: 'A' }] })
    const nodes = allNodes(vnode)
    const empty = nodes.find((n: any) => n?.props?.class === 'wf-select-search-empty')
    assert.ok(empty)
    assert.equal(empty.props.children, '无匹配')
  })

  it('calls onChange on option select', async () => {
    let captured = ''
    const { render, state } = await searchableCtx()
    state.open = true
    state.keyword = ''
    const vnode = render({ searchable: true, options: [{ value: 'x', label: 'X' }], onChange: (v: string) => { captured = v } })
    const nodes = allNodes(vnode)
    const opt = nodes.find((n: any) => n?.props?.class?.startsWith?.('wf-select-search-opt'))
    assert.ok(opt)
    opt.props.onMouseDown({ preventDefault: () => {} })
    assert.equal(captured, 'x')
  })
})
