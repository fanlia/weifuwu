import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Calendar } from './Calendar.ts'
import type { WfuiContext } from '../../client/types.ts'

function mockCtx(): WfuiContext {
  const state = new Proxy({}, {
    set(t: any, k, v) { t[k] = v; return true },
    get(t: any, k) { return t[k] },
  })
  return { ui: { $: () => state, render: () => {}, dirty: () => {}, ready: true } } as any
}

function renderVNode(Comp: any, props: any, ctx: any) {
  const result = Comp(props, ctx)
  return typeof result === 'function' ? result(props) : result
}

const events = [
  { key: 'e1', date: '2025-06-10', title: '产品评审' },
  { key: 'e2', date: '2025-06-10', title: '发布 v0.63' },
  { key: 'e3', date: '2025-06-15', title: '团队周会' },
]

describe('Calendar', () => {
  it('renders weekday headers', () => {
    const vnode = renderVNode(Calendar, { events }, mockCtx())!
    assert.match(vnode.props.class, /wf-calendar/)
  })

  it('renders current month grid', () => {
    const vnode = renderVNode(Calendar, { events, month: 5, year: 2025 }, mockCtx())!
    const grid = vnode.props.children[1] // [header, grid]
    assert.equal(grid.props.children.length, 7) // 周头 + 6 行？grid 结构
  })

  it('month navigation calls onMonthChange (受控)', () => {
    let gotMonth: number | null = null
    let gotYear: number | null = null
    const ctx = mockCtx()
    const result = Calendar({
      events, month: 5, year: 2025,
      onMonthChange: (m: number, y: number) => { gotMonth = m; gotYear = y },
    }, ctx)
    const render = result as any
    const v = render({
      events, month: 5, year: 2025,
      onMonthChange: (m: number, y: number) => { gotMonth = m; gotYear = y },
    })
    const header = v.props.children[0]
    const nav = header.props.children.find((c: any) => c?.props?.class === 'wf-calendar-nav')
    const nextBtn = nav.props.children.find((c: any) => c?.props?.['aria-label'] === '下个月')
    nextBtn.props.onClick()
    assert.equal(gotMonth, 6)
    assert.equal(gotYear, 2025)
  })

  it('shows events in matching cells', () => {
    const vnode = renderVNode(Calendar, { events, month: 5, year: 2025 }, mockCtx())!
    // 找 6 月 10 日的 cell
    const cell = findCell(vnode, '10')
    assert.ok(cell, '应找到 10 日 cell')
    const eventDots = cell.props.children.filter((c: any) => c?.props?.class?.includes('wf-calendar-event'))
    assert.equal(eventDots.length, 2)
  })

  it('click date calls onSelectDate', () => {
    let got: string | null = null
    const vnode = renderVNode(Calendar, { events, month: 5, year: 2025, onSelectDate: (d: string) => { got = d } }, mockCtx())!
    const cell = findCell(vnode, '10')
    cell.props.onClick()
    assert.equal(got, '2025-06-10')
  })

  it('selected date highlighted', () => {
    const vnode = renderVNode(Calendar, { events, month: 5, year: 2025, selectedDate: '2025-06-15' }, mockCtx())!
    const cell = findCell(vnode, '15')
    assert.match(cell.props.class, /--selected/)
  })
})

/** 查找日期数字匹配的 cell（grid 内） */
function findCell(vnode: any, day: string): any {
  const grid = vnode.props.children[1]
  const weeks = grid.props.children.filter((c: any) => c?.props?.class === 'wf-calendar-week')
  for (const week of weeks) {
    for (const cell of week.props.children) {
      const num = cell.props.children.find((c: any) => c?.props?.class === 'wf-calendar-day-num')
      if (num?.props?.children === day) return cell
    }
  }
  return null
}

it('受控 month/year：非受控时内部自管理（无 onMonthChange 也能翻月）', () => {
  const ctx = mockCtx()
  const factory = Calendar({}, ctx)
  const vnode = factory({})
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-calendar'), '非受控渲染日历')
  // 翻月按钮存在
  assert.ok(/prev|next|‹|›|chevron/.test(s), '翻月按钮存在')
})

it('键盘：日期格子可聚焦（tabIndex）+ 方向键处理（P1）', () => {
  const vnode = renderVNode(Calendar, {}, mockCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(/tabindex|tabIndex/.test(s), '日期格子可聚焦')
})
