import { describe, it } from 'node:test'
import assert from 'node:assert'
import { setupJsdom } from '../../test/client/setup.ts'
setupJsdom()
import { DatePicker } from './DatePicker.ts'
import { Portal, h } from '../../ui-dom/vnode.ts'
import { mountToDom, patchToDom, buildToDom } from '../../ui-dom/testing.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { createTestCtx } from '../../ui-dom/testing.ts'

function makeCtx(): WfuiContext {
  return createTestCtx({ ui: {
    $: () => ({}), render: () => {}, dirty: () => {},
    usePopupPosition: () => ({ top: 0, left: 0, refresh() {} }),
    useAnimationEnd: () => () => {},
    useGlobalKey: () => () => {},
  } }) as any
}

/** 两阶段组件：mount → 获取 renderFn，后续反复调用 renderFn(props) 获取 VNode */
async function mount(Comp: any, props: any, ctx: WfuiContext) {
  const result = await Comp(props, ctx)
  const renderFn = typeof result === 'function' ? result : null
  return (overrides?: any) => renderFn!(overrides ?? props)
}

describe('DatePicker', () => {
  it('renders input with placeholder', async () => {
    const render = await mount(DatePicker, { placeholder: '选择日期' }, makeCtx())
    const vnode = await render()
    const input = vnode.props.children[0]
    assert.equal(input.props.type, 'text')
    assert.equal(input.props.placeholder, '选择日期')
    assert.ok(input.props.readonly)
  })

  it('applies disabled class', async () => {
    const render = await mount(DatePicker, { disabled: true }, makeCtx())
    const vnode = await render()
    assert.match(vnode.props.class, /wf-datepicker--disabled/)
  })

  it('mode=date shows calendar panel via portal when open', async () => {
    const render = await mount(DatePicker, { mode: 'date', placeholder: '日期' }, makeCtx())
    // 点击 input 触发打开
    let vnode = await render()
    vnode.props.children[0].props.onClick({ preventDefault: () => {} })
    // 重新 render，此时 show=true
    vnode = await render()
    const portal = vnode.props.children[1]
    assert.equal(portal?.type, Portal, '应渲染 Portal')
    const panel = portal?.props?.children?.find((c: any) => c?.props?.class === 'wf-datepicker-dropdown')
    assert.ok(panel, '日历面板应在 Portal 中')
    assert.equal(panel?.props?.role, 'dialog')
  })

  it('mode=time shows time picker', async () => {
    const render = await mount(DatePicker, { mode: 'time', placeholder: '时间' }, makeCtx())
    let vnode = await render()
    vnode.props.children[0].props.onClick({ preventDefault: () => {} })
    vnode = await render()
    const portal = vnode.props.children[1]
    const timePanel = portal?.props?.children?.find((c: any) => c?.props?.class === 'wf-time-picker')
    assert.ok(timePanel, '时间选择面板应在 Portal 中')
  })

  it('mode=range shows dual month panels', async () => {
    const render = await mount(DatePicker, { mode: 'range', placeholder: '范围' }, makeCtx())
    let vnode = await render()
    vnode.props.children[0].props.onClick({ preventDefault: () => {} })
    vnode = await render()
    const portal = vnode.props.children[1]
    const rangeWrap = portal?.props?.children?.find((c: any) => c?.props?.class === 'wf-datepicker-range-wrap')
    assert.ok(rangeWrap, '区间面板应在 Portal 中')
    // 两个月份面板
    assert.equal(rangeWrap?.props?.children?.length, 2)
  })

  it('does not show panel when closed', async () => {
    const render = await mount(DatePicker, { mode: 'date' }, makeCtx())
    const vnode = await render()
    assert.equal(vnode.props.children.length, 1, '关闭状态下只有一个 input')
  })

  it('calls onChange on date select', async () => {
    let val = ''
    const render = await mount(DatePicker, { mode: 'date', onChange: (v: string) => { val = v } }, makeCtx())
    let vnode = await render()
    // 打开日历
    vnode.props.children[0].props.onClick({ preventDefault: () => {} })
    vnode = await render()
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

  it('日历方向键导航 + Escape 关闭（patch 管线）', async () => {
    let renderFn: (() => any) | null = null
    let prev: any = null
    const container = document.createElement('div')
    document.body.appendChild(container) // jsdom：未连接文档的元素 .focus() 无效
    const ctx: any = {
      ui: {
        $: () => ({}), dirty: () => {},
        // 模拟真实 ctx.ui.render：同树 patch（含 portal 增删），避免 remount 留脏节点
        render: async () => {
          const next = await renderFn!()
          await patchToDom(container, container.firstChild, prev, next, ctx)
          prev = next
        },
        usePopupPosition: () => ({ top: 0, left: 0, refresh() {} }),
        useAnimationEnd: () => () => {},
        useGlobalKey: () => () => {},
      },
    }
    const result = await (DatePicker as any)({}, ctx)
    renderFn = typeof result === 'function' ? () => result({}) : null
    prev = await renderFn!()
    await mountToDom(container, prev, ctx)

    // 点击输入框打开面板（toggle）
    const input = container.querySelector('.wf-datepicker-input') as HTMLElement
    input.click()
    await new Promise(r => setTimeout(r, 0))   // vdom 异步渲染
    const panel = document.querySelector('#__wf_portal .wf-datepicker-dropdown') as HTMLElement
    assert.ok(panel, '面板应打开')

    const cells = Array.from(panel.querySelectorAll<HTMLElement>('.wf-datepicker-cell'))
    assert.ok(cells.length >= 28, `应有日历网格: ${cells.length}`)
    // 聚焦某格，ArrowRight → 焦点右移一格
    cells[10].focus()
    cells[10].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    assert.equal(document.activeElement, cells[11], 'ArrowRight 焦点右移')
    // ArrowUp → 焦点上移一行（7 格）
    cells[11].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    assert.equal(document.activeElement, cells[4], 'ArrowUp 焦点上移一行')
    // Escape 关闭面板
    cells[4].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
    assert.ok(!document.querySelector('#__wf_portal .wf-datepicker-dropdown'), 'Escape 应关闭面板')
  })
})
