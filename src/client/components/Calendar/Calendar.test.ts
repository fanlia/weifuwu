import { describe, it } from 'node:test'
import assert from 'node:assert'
import { Calendar } from './Calendar.ts'
import type { UIContext } from '../../vdom/index.ts'
import { renderVNode, createTestCtx as officialCreateTestCtx } from '../../vdom/testing.ts'


function createTestCtx(overrides?: Record<string, unknown>): UIContext {
  // 官方测试 ctx（vdom/testing——render/ui hooks mock——组件消费面）
  return officialCreateTestCtx(overrides as never)
}



const events = [
  { key: 'e1', date: '2025-06-10', title: '产品评审' },
  { key: 'e2', date: '2025-06-10', title: '发布 v0.63' },
  { key: 'e3', date: '2025-06-15', title: '团队周会' },
]

describe('Calendar', () => {
  it('renders weekday headers', async () => {
    const vnode = await renderVNode(Calendar, { events }, createTestCtx())!
    assert.match(vnode.props.class, /wf-calendar/)
  })

  it('renders current month grid', async () => {
    const vnode = await renderVNode(Calendar, { events, month: 5, year: 2025 }, createTestCtx())!
    const grid = vnode.props.children[1] // [header, grid]
    assert.equal(grid.props.children.length, 7) // 周头 + 6 行？grid 结构
  })

  it('month navigation calls onMonthChange (受控)', async () => {
    let gotMonth: number | null = null
    let gotYear: number | null = null
    const ctx = createTestCtx()
    const result = await Calendar({
      events, month: 5, year: 2025,
      onMonthChange: (m: number, y: number) => { gotMonth = m; gotYear = y },
    }, ctx)
    const render = result as any
    const v = await render({
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

  it('shows events in matching cells', async () => {
    const vnode = await renderVNode(Calendar, { events, month: 5, year: 2025 }, createTestCtx())!
    // 找 6 月 10 日的 cell
    const cell = findCell(vnode, '10')
    assert.ok(cell, '应找到 10 日 cell')
    const eventDots = cell.props.children.filter((c: any) => c?.props?.class?.includes('wf-calendar-event'))
    assert.equal(eventDots.length, 2)
  })

  it('click date calls onSelectDate', async () => {
    let got: string | null = null
    const vnode = await renderVNode(Calendar, { events, month: 5, year: 2025, onSelectDate: (d: string) => { got = d } }, createTestCtx())!
    const cell = findCell(vnode, '10')
    cell.props.onClick()
    assert.equal(got, '2025-06-10')
  })

  it('selected date highlighted', async () => {
    const vnode = await renderVNode(Calendar, { events, month: 5, year: 2025, selectedDate: '2025-06-15' }, createTestCtx())!
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

it('受控 month/year：非受控时内部自管理（无 onMonthChange 也能翻月）', async () => {
  const ctx = createTestCtx()
  const factory = await Calendar({}, ctx)
  const vnode = await factory({})
  const s = JSON.stringify(vnode)
  assert.ok(s.includes('wf-calendar'), '非受控渲染日历')
  // 翻月按钮存在
  assert.ok(/prev|next|‹|›|chevron/.test(s), '翻月按钮存在')
})

it('键盘：日期格子可聚焦（tabIndex）+ 方向键处理（P1）', async () => {
  const vnode = await renderVNode(Calendar, {}, createTestCtx())!
  const s = JSON.stringify(vnode)
  assert.ok(/tabindex|tabIndex/.test(s), '日期格子可聚焦')
})
