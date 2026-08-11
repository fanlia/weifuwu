import type { Component } from '../../ui-dom/vnode.ts'
import type { WfuiContext } from '../../ui-dom/types.ts'
import { h } from '../../ui-dom/vnode.ts'
import { Icon } from '../Icon/Icon.ts'
import { getCalendarGrid, getWeekdays, formatDate } from '../DatePicker/calendar-utils.ts'

export interface CalendarEvent {
  key: string
  /** 日期 'YYYY-MM-DD' */
  date: string
  title: string
  color?: string
}

export interface CalendarProps {
  events?: CalendarEvent[]
  /** 受控年月：month 0-11，year 四位数 */
  month?: number
  year?: number
  onMonthChange?: (month: number, year: number) => void
  onSelectDate?: (date: string) => void
  selectedDate?: string
  'aria-label'?: string
}

const MONTH_NAMES = ['1 月', '2 月', '3 月', '4 月', '5 月', '6 月', '7 月', '8 月', '9 月', '10 月', '11 月', '12 月']

/** 月历（对应 antd/EP Calendar）：月视图网格 + 事件点 + 月切换 + 日期选择。
 * 裁剪：周/日视图、拖拽创建事件、事件详情弹层。 */
export const Calendar: Component<CalendarProps> = async (_init, ctx) => {
  // ── mount（只一次）──
  const $ = ctx.ui.$()
  const now = new Date()
  $.viewMonth = now.getMonth()
  $.viewYear = now.getFullYear()

  return (props) => {
    const {
      events = [], month, year, onMonthChange, onSelectDate, selectedDate,
      'aria-label': ariaLabel,
    } = props

    const isControlled = month !== undefined && year !== undefined
    const viewMonth: number = isControlled ? month : $.viewMonth
    const viewYear: number = isControlled ? year : $.viewYear

    const shiftMonth = (delta: number) => {
      if (isControlled && !onMonthChange) {
        // 受控（month/year 已传）但无 onMonthChange：点击无法切换——开发期提示（与 Collapse/Tree 一致）
        console.warn(`[weifuwu/Calendar] 受控模式（month/year 已传）但未提供 onMonthChange，月份切换无法生效。\n非受控：去掉 month/year；受控：传入 onMonthChange={(m, y) => setView(m, y)}`)
        return
      }
      let m = viewMonth + delta
      let y = viewYear
      if (m < 0) { m = 11; y-- }
      else if (m > 11) { m = 0; y++ }
      if (isControlled) onMonthChange?.(m, y)
      else { $.viewMonth = m; $.viewYear = y }
    }

    const goToday = () => {
      if (isControlled) onMonthChange?.(now.getMonth(), now.getFullYear())
      else { $.viewMonth = now.getMonth(); $.viewYear = now.getFullYear() }
    }

    const grid = getCalendarGrid(viewYear, viewMonth)
    const weekdays = getWeekdays()

    const header = h('div', { class: 'wf-calendar-header' }, [
      h('div', { class: 'wf-calendar-title' }, `${viewYear} 年 ${MONTH_NAMES[viewMonth]}`),
      h('div', { class: 'wf-calendar-nav' }, [
        h('button', { type: 'button', class: 'wf-calendar-nav-btn', 'aria-label': '上个月', onClick: () => shiftMonth(-1) }, h(Icon, { name: 'chevron-left', size: 14 })),
        h('button', { type: 'button', class: 'wf-calendar-nav-btn', 'aria-label': '今天', onClick: goToday }, '今天'),
        h('button', { type: 'button', class: 'wf-calendar-nav-btn', 'aria-label': '下个月', onClick: () => shiftMonth(1) }, h(Icon, { name: 'chevron-right', size: 14 })),
      ]),
    ])

    const weeks = grid.map((week, wi) => {
      const cells = week.map(day => {
        const dateStr = formatDate(day.year, day.month, day.day)
        const dayEvents = events.filter(e => e.date === dateStr)
        const selected = selectedDate === dateStr
        return h('div', {
          class: [
            'wf-calendar-cell',
            day.isOtherMonth ? 'wf-calendar-cell--other' : '',
            day.isToday ? 'wf-calendar-cell--today' : '',
            selected ? 'wf-calendar-cell--selected' : '',
          ].filter(Boolean).join(' '),
          key: `${day.year}-${day.month}-${day.day}`,
          role: 'button',
          tabIndex: 0, // P1：可点击必须可聚焦（否则键盘用户无法选择日期）
          onClick: () => onSelectDate?.(dateStr),
          onKeyDown: (e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelectDate?.(dateStr) }
          },
        }, [
          h('span', { class: 'wf-calendar-day-num' }, String(day.day)),
          ...dayEvents.slice(0, 3).map(e =>
            h('div', {
              class: 'wf-calendar-event',
              style: e.color ? { '--wf-event-color': e.color } : undefined,
              key: e.key,
            }, e.title)
          ),
          dayEvents.length > 3 ? h('div', { class: 'wf-calendar-more' }, `+${dayEvents.length - 3} 更多`) : null,
        ])
      })
      return h('div', { class: 'wf-calendar-week', key: wi }, cells)
    })

    const gridView = h('div', { class: 'wf-calendar-grid' }, [
      h('div', { class: 'wf-calendar-weekdays' }, weekdays.map((d, i) =>
        h('div', { class: 'wf-calendar-weekday', key: i }, d))),
      ...weeks,
    ])

    return h('div', {
      class: 'wf-calendar',
      'aria-label': ariaLabel,
    }, [header, gridView])
  }
}
