import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { DatePicker } from './DatePicker.ts'
import { Portal } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: () => ({}), render: () => {}, dirty: () => {},  } } as any
}

/** 两阶段组件：mount → 获取 renderFn，后续反复调用 renderFn(props) 获取 VNode */
function mount(Comp: any, props: any, ctx: WfuiContext) {
  const result = Comp(props, ctx)
  const renderFn = typeof result === 'function' ? result : null
  return (overrides?: any) => renderFn!(overrides ?? props)
}

describe('DatePicker', () => {
  it('renders input with placeholder', () => {
    const render = mount(DatePicker, { placeholder: '选择日期' }, mockCtx())
    const vnode = render()
    const input = vnode.props.children[0]
    assert.equal(input.props.type, 'text')
    assert.equal(input.props.placeholder, '选择日期')
    assert.ok(input.props.readonly)
  })

  it('applies disabled class', () => {
    const render = mount(DatePicker, { disabled: true }, mockCtx())
    const vnode = render()
    assert.match(vnode.props.class, /wf-datepicker--disabled/)
  })

  it('mode=date shows calendar panel via portal when open', () => {
    const render = mount(DatePicker, { mode: 'date', placeholder: '日期' }, mockCtx())
    // 点击 input 触发打开
    let vnode = render()
    vnode.props.children[0].props.onClick({ preventDefault: () => {} })
    // 重新 render，此时 show=true
    vnode = render()
    const portal = vnode.props.children[1]
    assert.equal(portal?.type, Portal, '应渲染 Portal')
    const panel = portal?.props?.children?.find((c: any) => c?.props?.class === 'wf-datepicker-dropdown')
    assert.ok(panel, '日历面板应在 Portal 中')
    assert.equal(panel?.props?.role, 'dialog')
  })

  it('mode=time shows time picker', () => {
    const render = mount(DatePicker, { mode: 'time', placeholder: '时间' }, mockCtx())
    let vnode = render()
    vnode.props.children[0].props.onClick({ preventDefault: () => {} })
    vnode = render()
    const portal = vnode.props.children[1]
    const timePanel = portal?.props?.children?.find((c: any) => c?.props?.class === 'wf-time-picker')
    assert.ok(timePanel, '时间选择面板应在 Portal 中')
  })

  it('mode=range shows dual month panels', () => {
    const render = mount(DatePicker, { mode: 'range', placeholder: '范围' }, mockCtx())
    let vnode = render()
    vnode.props.children[0].props.onClick({ preventDefault: () => {} })
    vnode = render()
    const portal = vnode.props.children[1]
    const rangeWrap = portal?.props?.children?.find((c: any) => c?.props?.class === 'wf-datepicker-range-wrap')
    assert.ok(rangeWrap, '区间面板应在 Portal 中')
    // 两个月份面板
    assert.equal(rangeWrap?.props?.children?.length, 2)
  })

  it('does not show panel when closed', () => {
    const render = mount(DatePicker, { mode: 'date' }, mockCtx())
    const vnode = render()
    assert.equal(vnode.props.children.length, 1, '关闭状态下只有一个 input')
  })

  it('calls onChange on date select', () => {
    let val = ''
    const render = mount(DatePicker, { mode: 'date', onChange: (v: string) => { val = v } }, mockCtx())
    let vnode = render()
    // 打开日历
    vnode.props.children[0].props.onClick({ preventDefault: () => {} })
    vnode = render()
    const portal = vnode.props.children[1]
    const panel = portal?.props?.children?.find((c: any) => c?.props?.class === 'wf-datepicker-dropdown')
    const calPanel = panel?.props?.children?.[0]
    const gridRows = calPanel?.props?.children?.slice(2) || []
    // 找到一个可点击的日期单元格（非 other-month）
    for (const row of gridRows) {
      for (const cell of row?.props?.children || []) {
        const cls = cell?.props?.class || ''
        if (!cls.includes('other-month') && !val) {
          cell.props.onClick()
        }
      }
    }
    assert.ok(val.length > 0, 'onChange 应被调用并返回日期字符串')
  })
})
