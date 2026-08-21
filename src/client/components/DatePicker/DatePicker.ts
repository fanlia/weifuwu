/**
 * weifuwu/components — DatePicker
 *
 * 四合一日期选择器，支持 mode: date | datetime | time | range
 * 统一 usePopup：focus 触发 + mask 遮罩 + 自由定位（left 对齐 + width 跟随 trigger）。
 *
 * 状态管理：闭包变量 + ctx.render()
 */

import type { Component, VNode } from '../../vdom/index.ts'
import { createClientBrowser } from '../../vdom/index.ts'
import type { UIContext } from '../../vdom/index.ts'
import { h } from '../../vdom/index.ts'
import { Icon } from '../Icon/Icon.ts'
import type { IconName } from '../Icon/Icon.ts'
import {
  getCalendarGrid, getWeekdays, formatDate, formatTime, formatDateTime,
  hourOptions, minuteOptions,
} from './calendar-utils.ts'
import type { CalendarDay } from './calendar-utils.ts'

export type DatePickerMode = 'date' | 'datetime' | 'time' | 'range'

export interface DatePickerProps {
  mode?: DatePickerMode
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
  /** 错误态（F2 状态矩阵——输入类基线） */
  error?: string
}

export const DatePicker: Component<DatePickerProps> = async (_props, ctx) => {
  const _browser = ctx.browser ?? createClientBrowser()
  // ── mount（只一次）──
  let show = false
  let selectedValue = ''
  const now = new Date()
  let viewYear = now.getFullYear()
  let viewMonth = now.getMonth()
  let hour = now.getHours()
  let minute = Math.round(now.getMinutes() / 5) * 5
  let selYear = now.getFullYear()
  let selMonth = now.getMonth()
  let selDay = now.getDate()
  let rangeStart: string | null = null
  let rangeEnd: string | null = null

  let inputEl: HTMLElement | null = null
  const inputRef = (el: HTMLElement | null) => { inputEl = el }
  let latestMode: DatePickerMode = 'date'

  // ESC 关闭（document 级——面板 keydown 只在焦点内生效；这里覆盖全局）
  ctx.ui.useGlobalKey((e: KeyboardEvent) => {
    if (e.key === 'Escape' && show) { show = false; ctx.render() }
  })
  // 统一 usePopup：focus 触发 + mask 遮罩（点外部关）+ 自由定位（left 对齐 + width 跟随 trigger）
  const popup = ctx.ui.usePopup({
    trigger: 'focus',
    mask: true,
    maskClosable: true,
    closeOnEscape: false,   // 组件自控（useGlobalKey）
    closeDelay: 120,        // blur 延迟关闭窗口（面板内选中日期的 click 先于关闭生效）
    el: () => inputEl,
    isOpen: () => show,
    setOpen: (v) => { show = v; ctx.render() },
    position: () => {
      const r = inputEl?.getBoundingClientRect()
      if (!r) return { x: 0, y: 0 }
      // range 模式双面板自适应宽度（不塞 trigger 宽）；其余跟随 trigger
      const isRange = latestMode === 'range'
      return { x: r.left, y: r.bottom + 4, width: isRange ? undefined : r.width }
    },
  })

  return async (props: DatePickerProps) => {
    const L = (ctx as any)?.i18n?.components?.DatePicker ?? {}
    const { mode = 'date', value, onChange, placeholder = L.placeholder ?? '选择日期', disabled, error } = props
    latestMode = mode

    const isOpen = show
    const setOpen = (v: boolean) => {
      show = v
      ctx.render()
    }

    const toggle = (e: Event) => {
      if (disabled) return
      setOpen(!show)
    }

    // ── 日期选择 ──────────────────────────────────────
    const selectDate = (day: CalendarDay) => {
      if (mode === 'datetime') {
        selYear = day.year; selMonth = day.month; selDay = day.day
        viewYear = day.year; viewMonth = day.month
        ctx.render()
      } else if (mode === 'range') {
        if (!rangeStart || (rangeStart && rangeEnd)) {
          rangeStart = formatDate(day.year, day.month, day.day)
          rangeEnd = null
          ctx.render()
        } else {
          rangeEnd = formatDate(day.year, day.month, day.day)
          const ds = rangeStart < rangeEnd ? rangeStart : rangeEnd
          const de = rangeStart < rangeEnd ? rangeEnd : rangeStart
          selectedValue = `${ds} ~ ${de}`
          onChange?.(selectedValue)
          setOpen(false)
        }
      } else {
        selectedValue = formatDate(day.year, day.month, day.day)
        onChange?.(selectedValue)
        setOpen(false)
      }
    }

    const prevMonth = () => {
      if (viewMonth === 0) { viewYear--; viewMonth = 11 }
      else viewMonth--
      ctx.render()
    }

    const nextMonth = () => {
      if (viewMonth === 11) { viewYear++; viewMonth = 0 }
      else viewMonth++
      ctx.render()
    }

    const confirmTime = () => {
      selectedValue = formatTime(hour, minute)
      onChange?.(selectedValue)
      setOpen(false)
    }

    const confirmDateTime = () => {
      selectedValue = formatDateTime(selYear, selMonth, selDay, hour, minute)
      onChange?.(selectedValue)
      setOpen(false)
    }

    const grid = getCalendarGrid(viewYear, viewMonth)
    const weekdays = [L.w0, L.w1, L.w2, L.w3, L.w4, L.w5, L.w6].some(v => v) ? [L.w0, L.w1, L.w2, L.w3, L.w4, L.w5, L.w6] : getWeekdays()

    const headerBtn = (name: IconName, ariaLabel: string, onClick: () => void) =>
      h('button', { class: 'wf-datepicker-header-btn', type: 'button', 'aria-label': ariaLabel, onClick }, h(Icon, { name }))

    const header = h('div', { class: 'wf-datepicker-header' }, [
      headerBtn('chevron-left', L.prevMonth ?? '上个月', prevMonth),
      h('span', { class: 'wf-datepicker-header-title' }, `${viewYear}年${viewMonth + 1}月`),
      headerBtn('chevron-right', L.nextMonth ?? '下个月', nextMonth),
    ])

    const weekdayRow = h('div', { class: 'wf-datepicker-weekdays' },
      weekdays.map(w => h('span', { class: 'wf-datepicker-weekday' }, w)))

    const gridRows = grid.map((row, ri) =>
      h('div', { class: 'wf-datepicker-grid', key: `row-${ri}` },
        row.map((cell, ci) => {
          const classes = ['wf-datepicker-cell']
          if (cell.isOtherMonth) classes.push('wf-datepicker-cell--other-month')
          if (cell.isToday) classes.push('wf-datepicker-cell--today')
          const dateStr = formatDate(cell.year, cell.month, cell.day)
          if (mode === 'range') {
            if (dateStr === rangeStart || dateStr === rangeEnd) classes.push('wf-datepicker-cell--range-edge')
            else if (rangeStart && rangeEnd && dateStr > rangeStart && dateStr < rangeEnd) classes.push('wf-datepicker-cell--in-range')
          } else if (mode === 'datetime') {
            if (selYear === cell.year && selMonth === cell.month && selDay === cell.day) classes.push('wf-datepicker-cell--selected')
          } else {
            if (dateStr === selectedValue) classes.push('wf-datepicker-cell--selected')
          }
          return h('button', {
            class: classes.join(' '),
            key: `${cell.year}-${cell.month}-${cell.day}`,
            type: 'button',
            onClick: () => selectDate(cell),
          }, String(cell.day))
        })))

    const calendarPanel = h('div', { class: 'wf-datepicker-range-panel' }, [
      header, weekdayRow, ...gridRows,
    ])

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); return }
      // 日历网格方向键导航（time/datetime 面板无网格，跳过）
      if (mode === 'time' || mode === 'datetime') return
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return
      const panel = e.currentTarget as HTMLElement
      const cells = Array.from(panel.querySelectorAll<HTMLElement>('.wf-datepicker-cell'))
      const idx = cells.indexOf((_browser?.activeElement() ?? null) as HTMLElement)
      if (idx < 0) return
      e.preventDefault()
      const cols = 7
      let next = idx
      if (e.key === 'ArrowLeft') next--
      else if (e.key === 'ArrowRight') next++
      else if (e.key === 'ArrowUp') next -= cols
      else if (e.key === 'ArrowDown') next += cols
      if (next >= 0 && next < cells.length) cells[next].focus()
    }

    let panel: VNode | null = null

    if (isOpen) {
      if (mode === 'time') {
        const hours = hourOptions()
        const minutes = minuteOptions()
        const timePanel = h('div', {
          class: 'wf-time-picker', role: 'dialog',
          onKeyDown: handleKeyDown,
          onMouseDown: (e: Event) => e.stopPropagation(),
        }, [
          h('div', { class: 'wf-time-body' }, [
            h('div', { class: 'wf-time-col' }, [
              h('div', { class: 'wf-time-col-label' }, L.hour ?? '时'),
              h('div', { class: 'wf-time-opt-list' },
                hours.map(hv => h('button', {
                  class: `wf-time-opt${hv === hour ? ' wf-time-opt--selected' : ''}`,
                  type: 'button', key: hv,
                  onClick: () => { hour = hv; ctx.render() },
                }, String(hv).padStart(2, '0')))),
            ]),
            h('div', { class: 'wf-time-col' }, [
              h('div', { class: 'wf-time-col-label' }, L.minute ?? '分'),
              h('div', { class: 'wf-time-opt-list' },
                minutes.map(mv => h('button', {
                  class: `wf-time-opt${mv === minute ? ' wf-time-opt--selected' : ''}`,
                  type: 'button', key: mv,
                  onClick: () => { minute = mv; ctx.render() },
                }, String(mv).padStart(2, '0')))),
            ]),
          ]),
          h('div', { class: 'wf-time-footer' }, [
            h('button', { class: 'wf-datepicker-footer-btn', type: 'button', onClick: () => setOpen(false) }, L.cancel ?? '取消'),
            h('button', { class: 'wf-datepicker-footer-btn', type: 'button', onClick: confirmTime }, L.confirm ?? '确定'),
          ]),
        ])
        panel = timePanel
      } else if (mode === 'range') {
        const nextM = viewMonth === 11 ? 0 : viewMonth + 1
        const nextY = viewMonth === 11 ? viewYear + 1 : viewYear
        const nextGrid = getCalendarGrid(nextY, nextM)

        const rangeWrap = h('div', {
          class: 'wf-datepicker-range-wrap',
          onMouseDown: (e: Event) => e.stopPropagation(),
        }, [
          h('div', { class: 'wf-datepicker-range-panel' }, [
            h('div', { class: 'wf-datepicker-header' }, [
              headerBtn('chevron-left', L.prevMonth ?? '上个月', prevMonth),
              h('span', { class: 'wf-datepicker-header-title' }, `${viewYear}年${viewMonth + 1}月`),
              h('span', { class: 'wf-datepicker-header-title' }),
            ]),
            weekdayRow,
            ...gridRows,
          ]),
          h('div', { class: 'wf-datepicker-range-panel' }, [
            h('div', { class: 'wf-datepicker-header' }, [
              h('span', { class: 'wf-datepicker-header-title' }),
              h('span', { class: 'wf-datepicker-header-title' }, `${nextY}年${nextM + 1}月`),
              headerBtn('chevron-right', L.nextMonth ?? '下个月', nextMonth),
            ]),
            h('div', { class: 'wf-datepicker-weekdays' }, weekdays.map(w => h('span', { class: 'wf-datepicker-weekday' }, w))),
            ...nextGrid.map((row, ri) =>
              h('div', { class: 'wf-datepicker-grid', key: `row-${ri}` },
                row.map(cell => {
                  const dateStr = formatDate(cell.year, cell.month, cell.day)
                  const cls = ['wf-datepicker-cell']
                  if (cell.isOtherMonth) cls.push('wf-datepicker-cell--other-month')
                  if (cell.isToday) cls.push('wf-datepicker-cell--today')
                  if (dateStr === rangeStart || dateStr === rangeEnd) cls.push('wf-datepicker-cell--range-edge')
                  else if (rangeStart && rangeEnd && dateStr > rangeStart && dateStr < rangeEnd) cls.push('wf-datepicker-cell--in-range')
                  return h('button', {
                    class: cls.join(' '), key: dateStr, type: 'button',
                    onClick: () => selectDate(cell),
                  }, String(cell.day))
                }))),
          ]),
        ])
        panel = rangeWrap
      } else {
        const content: any[] = [calendarPanel]
        if (mode === 'datetime') {
          content.push(h('div', { class: 'wf-datetime-time' }, [
            h('span', { class: 'wf-datetime-time-label' }, (L.time ?? '时间') + '：'),
            h('div', { class: 'wf-datetime-time-select' }, [
              h('select', {
                class: 'wf-datetime-select',
                value: hour,
                onChange: (e: Event) => { hour = parseInt((e.target as HTMLSelectElement).value); ctx.render() },
              }, hourOptions().map(hv => h('option', { value: hv, key: hv }, String(hv).padStart(2, '0')))),
              h('span', { class: 'wf-datetime-sep' }, ':'),
              h('select', {
                class: 'wf-datetime-select',
                value: minute,
                onChange: (e: Event) => { minute = parseInt((e.target as HTMLSelectElement).value); ctx.render() },
              }, minuteOptions().map(mv => h('option', { value: mv, key: mv }, String(mv).padStart(2, '0')))),
            ]),
          ]))
          content.push(h('div', { class: 'wf-time-footer' }, [
            h('button', { class: 'wf-datepicker-footer-btn', type: 'button', onClick: confirmDateTime }, L.confirm ?? '确定'),
          ]))
        }
        const dp = h('div', {
          class: 'wf-datepicker-dropdown', role: 'dialog',
          onKeyDown: handleKeyDown,
          onMouseDown: (e: Event) => e.stopPropagation(),
        }, content)
        panel = dp
      }
    }

    // **方案 B：槽恒在（portal 恒调用——引擎自动开合）**
    const portalContent = popup.portal(isOpen && panel ? panel : null, 'dp-calendar')
    const displayValue = value ?? selectedValue ?? ''

    return h('div', { class: `wf-datepicker${disabled ? ' wf-datepicker--disabled' : ''}` }, [
      h('input', {
        class: ['wf-datepicker-input', error ? ' wf-datepicker-input--err' : ''].filter(Boolean).join(' '),
        'aria-invalid': error ? 'true' : undefined,
        type: 'text',
        placeholder,
        value: displayValue || '',
        ref: inputRef,
        readonly: true,
        disabled,
        role: 'combobox',
        'aria-haspopup': 'dialog',
        'aria-expanded': String(isOpen),
        onClick: toggle,
      }),
      portalContent,
    ].filter(Boolean))
  }
}
