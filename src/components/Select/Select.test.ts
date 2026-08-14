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
    const vnode = await render({ options: [{ value: 'a', label: 'A' }] })
    const select = childrenOf(vnode).find((c: any) => c?.type === 'select')
    assert.ok(select)
  })

  it('renders options from options prop', async () => {
    const ctx = nativeCtx()
    const render = await Select({}, ctx)!
    const vnode = await render({ options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] })
    const select = childrenOf(vnode).find((c: any) => c?.type === 'select')
    const options = Array.isArray(select.props.children) ? select.props.children : [select.props.children]
    assert.equal(options.length, 2)
    assert.equal(options[0].props.value, 'a')
    assert.equal(options[0].props.children, 'A')
  })

  it('renders label when provided', async () => {
    const ctx = nativeCtx()
    const render = await Select({}, ctx)!
    const vnode = await render({ label: '角色', options: [{ value: 'admin', label: '管理员' }] })
    const labels = childrenOf(vnode).filter((c: any) => c?.props?.class === 'wf-select-label')
    assert.ok(labels.length > 0)
  })

  it('shows placeholder option', async () => {
    const ctx = nativeCtx()
    const render = await Select({}, ctx)!
    const vnode = await render({ placeholder: '请选择', options: [{ value: 'a', label: 'A' }] })
    const select = childrenOf(vnode).find((c: any) => c?.type === 'select')
    const options = Array.isArray(select.props.children) ? select.props.children : [select.props.children]
    assert.equal(options.length, 2)
    assert.equal(options[0].props.value, '')
    assert.equal(options[0].props.children, '请选择')
  })

  it('shows error message', async () => {
    const ctx = nativeCtx()
    const render = await Select({}, ctx)!
    const vnode = await render({ error: '请选择', options: [{ value: 'a', label: 'A' }] })
    const err = childrenOf(vnode).find((c: any) => c?.props?.class === 'wf-select-err')
    assert.ok(err)
    assert.equal(err.props.children, '请选择')
  })
})

describe('Select (searchable)', () => {
  async function searchableCtx(){
    const ctx = { ui: { $: () => ({}), render: () => {}, dirty: () => {}, usePopup: (opts: any) => ({ get open() { return opts.isOpen() }, setOpen: opts.setOpen, refresh: () => {}, portal: (c: any) => (opts.isOpen() ? c : null), wrapProps: {} }) } } as any
    // render-only：内部状态为闭包 let——测试通过真实交互处理器（onClick/onInput）驱动
    const render = await Select({}, ctx)!
    return { ctx, render }
  }

  it('renders trigger input', async () => {
    const { render } = await searchableCtx()
    const vnode = await render({ searchable: true, options: [{ value: 'a', label: 'A' }] })
    const nodes = allNodes(vnode)
    const input = nodes.find((n: any) => n?.props?.class === 'wf-select-search-input')
    assert.ok(input, 'should render search input')
  })

  it('shows menu when opened (click trigger)', async () => {
    const { render } = await searchableCtx()
    const props = { searchable: true, options: [{ value: 'a', label: 'A' }] }
    let vnode = await render(props)
    let nodes = allNodes(vnode)
    const trigger = nodes.find((n: any) => n?.props?.class === 'wf-select-search-trigger')
    assert.ok(trigger)
    trigger.props.onClick()          // 驱动内部 open = true
    vnode = await render(props)            // 同实例 re-render
    nodes = allNodes(vnode)
    const menu = nodes.find((n: any) => n?.props?.class?.startsWith?.('wf-select-search-menu'))
    assert.ok(menu, 'should render menu when open')
  })

  it('shows selected value in trigger when closed', async () => {
    const { render, state } = await searchableCtx()
    const vnode = await render({ searchable: true, value: 'a', options: [{ value: 'a', label: 'A选项' }] })
    const nodes = allNodes(vnode)
    const input = nodes.find((n: any) => n?.props?.class === 'wf-select-search-input')
    assert.ok(input)
    assert.equal(input.props.value, 'A选项')
  })

  it('filters options on keyword', async () => {
    const { render } = await searchableCtx()
    const props = {
      searchable: true,
      options: [
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
        { value: 'c', label: 'Gamma' },
      ],
    }
    let vnode = await render(props)
    let nodes = allNodes(vnode)
    nodes.find((n: any) => n?.props?.class === 'wf-select-search-trigger').props.onClick() // 打开
    const input = allNodes(await render(props)).find((n: any) => n?.props?.class === 'wf-select-search-input')
    await input.props.onInput({ target: { value: 'Beta' } })    // 驱动 keyword 过滤
    vnode = await render(props)
    nodes = allNodes(vnode)
    const opts = nodes.filter((n: any) => n?.props?.class?.startsWith?.('wf-select-search-opt'))
    assert.equal(opts.length, 1)
    assert.equal(opts[0].props.children, 'Beta')
  })

  it('shows empty message when no match', async () => {
    const { render } = await searchableCtx()
    const props = { searchable: true, options: [{ value: 'a', label: 'A' }] }
    render(props)
    const input = allNodes(await render(props)).find((n: any) => n?.props?.class === 'wf-select-search-input')
    await input.props.onInput({ target: { value: 'XYZ' } })     // 驱动 keyword
    const vnode = await render(props)
    const nodes = allNodes(vnode)
    const empty = nodes.find((n: any) => n?.props?.class === 'wf-select-search-empty')
    assert.ok(empty)
    assert.equal(empty.props.children, '无匹配')
  })

  it('calls onChange on option select', async () => {
    let captured = ''
    const { render } = await searchableCtx()
    const props = { searchable: true, options: [{ value: 'x', label: 'X' }], onChange: (v: string) => { captured = v } }
    let vnode = await render(props)
    let nodes = allNodes(vnode)
    nodes.find((n: any) => n?.props?.class === 'wf-select-search-trigger').props.onClick() // 打开
    vnode = await render(props)
    nodes = allNodes(vnode)
    const opt = nodes.find((n: any) => n?.props?.class?.startsWith?.('wf-select-search-opt'))
    assert.ok(opt)
    opt.props.onMouseDown({ preventDefault: () => {} })
    assert.equal(captured, 'x')
  })

  it('multiple 多选：value 数组 → 选中标签渲染', async () => {
    const { render } = await searchableCtx()
    const props = {
      searchable: true, multiple: true,
      options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
      value: ['a', 'b'],
      onChange: () => {},
    }
    const vnode = await render(props)
    const s = JSON.stringify(vnode)
    assert.ok(s.includes('A') && s.includes('B'), '多选值回显为标签')
    assert.ok(s.includes('wf-select-tag'), '标签类存在')
  })

  it('disabled 透传（原生 select 禁用）', async () => {
    const ctx = { ui: { $: () => ({}), render: () => {}, dirty: () => {}, usePopup: (opts: any) => ({ get open() { return opts.isOpen() }, setOpen: opts.setOpen, refresh: () => {}, portal: (c: any) => (opts.isOpen() ? c : null), wrapProps: {} }) } } as any
    const render = await Select({}, ctx)!
    const vnode = await render({ disabled: true, options: [{ value: 'a', label: 'A' }] })
    const select = childrenOf(vnode).find((c: any) => c?.type === 'select')
    assert.equal(select.props.disabled, true, 'disabled 透传原生 select')
  })
})
