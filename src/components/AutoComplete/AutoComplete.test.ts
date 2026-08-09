import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { AutoComplete, filterOptions } from './AutoComplete.ts'

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

function findVNode(vnode: any, pred: (v: any) => boolean): any | null {
  if (!vnode || typeof vnode !== 'object') return null
  if (pred(vnode)) return vnode
  const kids = vnode.props?.children
  if (Array.isArray(kids)) {
    for (const k of kids) {
      const found = findVNode(k, pred)
      if (found) return found
    }
  } else if (kids && typeof kids === 'object') {
    return findVNode(kids, pred)
  }
  return null
}

function mount(Comp: any, props: any, ctx: any) {
  const factory = Comp({}, ctx)
  return { render: (p: any = props) => factory(p) }
}

const mockCtx = () => {
  // useControlledInput 需要跨 render 保持内部态——mock 用 Map 缓存
  const states = new Map<string, { keyword: string; selectedLabel: string }>()
  return {
    ui: {
      $: () => ({}),
      render: () => {},
      dirty: () => {},
      usePopup: (opts: any) => ({
        get open() { return opts.isOpen() },
        setOpen: opts.setOpen,
        refresh: () => {},
        portal: (content: any) => (opts.isOpen() ? content : null),
        wrapProps: {},
      }),
      useControlledInput: (opts: any) => {
        const key = opts.name ?? 'default'
        if (!states.has(key)) states.set(key, { keyword: '', selectedLabel: '' })
        const st = states.get(key)!
        return {
          value: opts.value,
          setValue: (v: string) => opts.onChange?.(v),
          controlled: opts.value !== undefined,
          get keyword() { return st.keyword },
          setKeyword: (v: string) => { st.keyword = v },
          get selectedLabel() { return st.selectedLabel },
          setSelectedLabel: (v: string) => { st.selectedLabel = v },
        }
      },
    },
  } as any
}

function optionLabels(vnode: any): string[] {
  const out: string[] = []
  const walk = (v: any) => {
    if (!v || typeof v !== 'object') return
    if (String(v.props?.class ?? '').includes('wf-autocomplete-option')) out.push(v.props.children)
    const kids = v.props?.children
    if (Array.isArray(kids)) kids.forEach(walk)
    else if (kids && typeof kids === 'object') walk(kids)
  }
  walk(vnode)
  return out
}

const options = [
  { value: 'pay-admin', label: '支付平台管理' },
  { value: 'pay-account', label: '支付平账系统' },
  { value: 'order', label: '订单中心' },
]

describe('filterOptions（纯函数）', () => {
  test('包含匹配不区分大小写', () => {
    assert.deepEqual(filterOptions(options, '支付').map(o => o.value), ['pay-admin', 'pay-account'])
    assert.deepEqual(filterOptions(options, 'PAY').map(o => o.value), ['pay-admin', 'pay-account'])
  })
  test('空 query → 全部', () => {
    assert.equal(filterOptions(options, '').length, 3)
  })
  test('无匹配 → 空', () => {
    assert.equal(filterOptions(options, 'xyz').length, 0)
  })
})

describe('AutoComplete', () => {
  test('渲染输入框 + 下拉默认关闭', () => {
    const vnode = renderVNode(AutoComplete, { options, value: '' }, mockCtx())
    const input = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-autocomplete-input'))
    assert.ok(input, '存在输入框')
    const dropdown = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-autocomplete-dropdown'))
    assert.equal(dropdown, null, '默认关闭（portal 关闭时不渲染）')
  })

  test('value 驱动过滤渲染', () => {
    const vnode = renderVNode(AutoComplete, { options, value: '支付', open: true }, mockCtx())
    const labels = optionLabels(vnode)
    assert.equal(labels.length, 2, '过滤出 2 条')
    assert.ok(labels.includes('支付平台管理'))
  })

  test('点击选项 → onChange + 回填', () => {
    let selected = ''
    const ctx = mockCtx()
    const inst = mount(AutoComplete, { options, value: '', onChange: (v: string) => { selected = v } }, ctx)
    const vnode = inst.render({ options, value: '', open: true, onChange: (v: string) => { selected = v } })
    const opt = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-autocomplete-option'))
    opt.props.onMouseDown?.({ stopPropagation: () => {} })
    assert.equal(selected, 'pay-admin')
  })

  test('键盘导航：↓ 高亮 → Enter 选中', () => {
    let selected = ''
    const ctx = mockCtx()
    const inst = mount(AutoComplete, { options, value: '', onChange: (v: string) => { selected = v } }, ctx)
    const props = { options, value: '', open: true, onChange: (v: string) => { selected = v } }
    let vnode = inst.render(props)
    const input = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-autocomplete-input'))
    input.props.onKeyDown?.({ key: 'ArrowDown', preventDefault: () => {} })
    vnode = inst.render(props)
    const active = findVNode(vnode, (v: any) => String(v.props?.class ?? '').includes('wf-autocomplete-option--active'))
    assert.ok(active, '↓ 后出现高亮项')
    const input2 = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-autocomplete-input'))
    input2.props.onKeyDown?.({ key: 'Enter', preventDefault: () => {} })
    assert.equal(selected, 'pay-admin', 'Enter 选中高亮项')
  })

  test('选中后 input 回填选中 label（关闭状态）', () => {
    const ctx = mockCtx()
    const inst = mount(AutoComplete, { options, value: '', onChange: () => {} }, ctx)
    // 打开 + 点击选项选中
    let vnode = inst.render({ options, value: '', open: true, onChange: () => {} })
    const opt = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-autocomplete-option'))
    opt.props.onMouseDown?.({ stopPropagation: () => {} })
    // 关闭后重新渲染：input 应显示选中 label
    vnode = inst.render({ options, value: '' })
    const input = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-autocomplete-input'))
    assert.equal(input.props.value, '支付平台管理', '关闭后回填选中 label')
  })

  test('IME 组合期间不处理 onChange（中文输入不被重置打断）', () => {
    let changed = 0
    const ctx = mockCtx()
    const inst = mount(AutoComplete, { options, value: '', onChange: () => { changed++ } }, ctx)
    const vnode = inst.render({ options, value: '', onChange: () => { changed++ } })
    const input = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-autocomplete-input'))
    // 组合开始（拼音输入中）
    input.props.onCompositionStart()
    input.props.onInput({ target: { value: 'zhifu' }, isComposing: true })
    assert.equal(changed, 0, '组合期间 input 事件不触发 onChange')
    // 组合结束（选字完成）
    input.props.onCompositionEnd({ target: { value: '支付' } })
    assert.equal(changed, 1, '组合完成触发 onChange（最终中文值）')
    // 组合后正常输入
    input.props.onInput({ target: { value: '支付平' }, isComposing: false })
    assert.equal(changed, 2, '组合后 input 正常处理')
  })

  test('Escape 关闭下拉', () => {
    const ctx = mockCtx()
    const inst = mount(AutoComplete, { options, value: '' }, ctx)
    let vnode = inst.render({ options, value: '', open: true })
    const input = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-autocomplete-input'))
    input.props.onKeyDown?.({ key: 'Escape', preventDefault: () => {} })
    vnode = inst.render({ options, value: '' })
    const dropdown = findVNode(vnode, (v: any) => v.props?.class?.includes('wf-autocomplete-dropdown'))
    assert.equal(dropdown, null, 'Escape 关闭（portal 不渲染）')
  })
})
