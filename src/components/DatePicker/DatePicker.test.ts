import { describe, it } from 'node:test'
import assert from 'node:assert'
import { DatePicker } from './DatePicker.ts'
import { Portal } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  return { ui: { $: {}, render: () => {}, dirty: () => {}, ready: false } } as any
}

/** 两阶段组件：先 mount 获取 renderFn，再修改状态后调用 renderFn(props) */
function prepare(Comp: any, props: any, ctx: WfuiContext) {
  const result = Comp(props, ctx)
  const renderFn = typeof result === 'function' ? result : null
  return {
    renderFn,
    render: (overrides: Record<string, any> = {}) => {
      // 合入指定状态后再渲染
      Object.assign(ctx.ui.$, overrides)
      return renderFn ? renderFn(props) : result
    }
  }
}

const inner = (v: any) => v?.type === Portal ? v.props.children : v

describe('DatePicker', () => {
  it('renders input with placeholder', () => {
    const ctx = mockCtx()
    // mount
    const result = DatePicker({ placeholder: '选择日期' }, ctx)
    const renderFn = typeof result === 'function' ? result : null
    const vnode = renderFn ? renderFn({ placeholder: '选择日期' }) : result
    const input = vnode!.props.children[0]
    assert.equal(input.props.type, 'text')
    assert.equal(input.props.placeholder, '选择日期')
    assert.ok(input.props.readonly)
  })

  it('applies disabled class', () => {
    const ctx = mockCtx()
    const result = DatePicker({ disabled: true }, ctx)
    const renderFn = typeof result === 'function' ? result : null
    const vnode = renderFn ? renderFn({ disabled: true }) : result
    assert.match(vnode!.props.class, /wf-datepicker--disabled/)
  })

  it('mode=date shows calendar panel via portal when open', () => {
    const ctx = mockCtx()
    const result = DatePicker({ mode: 'date' }, ctx)
    const renderFn = typeof result === 'function' ? result : null
    // 设置打开状态
    ctx.ui.$.show = true; ctx.ui.$.viewYear = 2025; ctx.ui.$.viewMonth = 6
    const vnode = renderFn!({ mode: 'date' })!

    const portal = vnode.props.children[1]
    assert.equal(portal?.type, Portal)
    const panel = portal?.props?.children?.find((c: any) => c?.props?.class === 'wf-datepicker-dropdown')
    assert.ok(panel, '日历面板应在 Portal 中')
    assert.ok(panel?.props?.role === 'dialog')
  })

  it('mode=time shows time picker', () => {
    const ctx = mockCtx()
    const result = DatePicker({ mode: 'time' }, ctx)
    const renderFn = typeof result === 'function' ? result : null
    ctx.ui.$.show = true; ctx.ui.$.hour = 12; ctx.ui.$.minute = 0
    const vnode = renderFn!({ mode: 'time' })!
    const portal = vnode.props.children[1]
    const timePanel = portal?.props?.children?.find((c: any) => c?.props?.class === 'wf-time-picker')
    assert.ok(timePanel, '时间选择面板应在 Portal 中')
  })

  it('mode=range shows dual month panels', () => {
    const ctx = mockCtx()
    const result = DatePicker({ mode: 'range' }, ctx)
    const renderFn = typeof result === 'function' ? result : null
    ctx.ui.$.show = true; ctx.ui.$.viewYear = 2025; ctx.ui.$.viewMonth = 6
    const vnode = renderFn!({ mode: 'range' })!
    const portal = vnode.props.children[1]
    const rangeWrap = portal?.props?.children?.find((c: any) => c?.props?.class === 'wf-datepicker-range-wrap')
    assert.ok(rangeWrap, '区间面板应在 Portal 中')
    assert.equal(rangeWrap?.props?.children?.length, 2)
  })

  it('does not show panel when closed', () => {
    const ctx = mockCtx()
    const result = DatePicker({ mode: 'date' }, ctx)
    const renderFn = typeof result === 'function' ? result : null
    ctx.ui.$.show = false
    const vnode = renderFn!({ mode: 'date' })!
    assert.equal(vnode.props.children.length, 1)
  })

  it('calls onChange on date select', () => {
    let val = ''
    const ctx = mockCtx()
    const result = DatePicker({ mode: 'date', onChange: (v: string) => { val = v } }, ctx)
    const renderFn = typeof result === 'function' ? result : null
    ctx.ui.$.show = true; ctx.ui.$.viewYear = 2025; ctx.ui.$.viewMonth = 6
    const vnode = renderFn!({ mode: 'date', onChange: (v: string) => { val = v } })!
    const portal = vnode.props.children[1]
    const panel = portal?.props?.children?.find((c: any) => c?.props?.class === 'wf-datepicker-dropdown')
    const calPanel = panel?.props?.children?.[0]
    const gridRows = calPanel?.props?.children?.slice(2) || []
    let clicked = false
    for (const row of gridRows) {
      for (const cell of row?.props?.children || []) {
        if (cell?.props?.class && !cell.props.class.includes('other-month') && !clicked) {
          cell.props.onClick()
          clicked = true
        }
      }
    }
    assert.ok(val.length > 0, 'onChange should be called with date string')
  })
})
