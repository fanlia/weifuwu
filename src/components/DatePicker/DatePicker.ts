/**
 * weifuwu/components — DatePicker
 *
 * 四合一日期选择器，支持 mode: date | datetime | time | range
 * 使用 createPortal + position:fixed 定位弹出层。
 */

import type { Component, VNode } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h, createPortal } from '../../client/vnode.ts'
import {
  getCalendarGrid, getWeekdays, formatDate, formatTime, formatDateTime,
  hourOptions, minuteOptions, getDaysInMonth,
} from './calendar-utils.ts'
import type { CalendarDay } from './calendar-utils.ts'

export type DatePickerMode = 'date' | 'datetime' | 'time' | 'range'

export interface DatePickerProps {
  mode?: DatePickerMode
  value?: string
  onChange?: (value: string) => void
  placeholder?: string
  disabled?: boolean
}

export const DatePicker: Component<DatePickerProps> = (props, ctx) => {
  const { mode = 'date', value, onChange, placeholder = '选择日期', disabled } = props
  const $ = ctx.ui.$
  if (!ctx.ui.ready) {
    $.show = false
    const now = new Date()
    $.viewYear = now.getFullYear()
    $.viewMonth = now.getMonth()
    $.hour = now.getHours()
    $.minute = now.getMinutes()
    // range 模式
    $.rangeStart = null as string | null
    $.rangeEnd = null as string | null
  }

  const isOpen = $.show
  const setOpen = (v: boolean) => { $.show = v }
  const toggle = (e: Event) => {
    if (disabled) return
    if (!$.show) {
      const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
      $._pos = { top: r.bottom + 4, left: r.left, width: r.width }
    }
    setOpen(!$.show)
  }

  const pos = $._pos ?? { top: 0, left: 0 }

  // ── 日期选择 ──────────────────────────────────────

  const selectDate = (day: CalendarDay) => {
    if (mode === 'range') {
      if (!$.rangeStart || ($.rangeStart && $.rangeEnd)) {
        $.rangeStart = formatDate(day.year, day.month, day.day)
        $.rangeEnd = null
      } else {
        $.rangeEnd = formatDate(day.year, day.month, day.day)
        const ds = $.rangeStart < $.rangeEnd ? $.rangeStart : $.rangeEnd
        const de = $.rangeStart < $.rangeEnd ? $.rangeEnd : $.rangeStart
        onChange?.(`${ds} ~ ${de}`)
        setOpen(false)
      }
    } else {
      const formatted = formatDate(day.year, day.month, day.day)
      onChange?.(formatted)
      setOpen(false)
    }
  }

  const prevMonth = () => {
    if ($.viewMonth === 0) { $.viewYear--; $.viewMonth = 11 }
    else $.viewMonth--
  }
  const nextMonth = () => {
    if ($.viewMonth === 11) { $.viewYear++; $.viewMonth = 0 }
    else $.viewMonth++
  }

  const confirmTime = () => {
    onChange?.(formatDateTime($.viewYear, $.viewMonth, 1, $.hour, $.minute))
    setOpen(false)
  }

  const grid = getCalendarGrid($.viewYear, $.viewMonth)
  const weekdays = getWeekdays()

  const headerBtn = (label: string, onClick: () => void) =>
    h('button', { class: 'wf-datepicker-header-btn', type: 'button', onClick }, label)

  const header = h('div', { class: 'wf-datepicker-header' }, [
    headerBtn('‹', prevMonth),
    h('span', { class: 'wf-datepicker-header-title' }, `${$.viewYear}年${$.viewMonth + 1}月`),
    headerBtn('›', nextMonth),
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
          if (dateStr === $.rangeStart || dateStr === $.rangeEnd) classes.push('wf-datepicker-cell--range-edge')
          else if ($.rangeStart && $.rangeEnd && dateStr > $.rangeStart && dateStr < $.rangeEnd) classes.push('wf-datepicker-cell--in-range')
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

  // ── 根据 mode 渲染 ────────────────────────────────

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false)
  }

  const inputValue = value ?? (mode === 'date' ? '' : '')

  const overlay = h('div', { class: 'wf-datepicker-overlay', onMouseDown: () => setOpen(false) })

  let panel: VNode | [VNode, ...VNode[]] | null = null

  if (isOpen) {
    if (mode === 'time') {
      const hours = hourOptions()
      const minutes = minuteOptions()
      const timePanel = h('div', {
        style: { top: pos.top, left: pos.left, width: pos.width },
        class: 'wf-time-picker', role: 'dialog',
        onKeyDown: handleKeyDown,
        onMouseDown: (e: Event) => e.stopPropagation(),
      }, [
        h('div', { class: 'wf-time-body' }, [
          h('div', { class: 'wf-time-col' }, [
            h('div', { class: 'wf-time-col-label' }, '时'),
            h('div', { class: 'wf-time-opt-list' },
              hours.map(hv => h('button', {
                class: `wf-time-opt${hv === $.hour ? ' wf-time-opt--selected' : ''}`,
                type: 'button', key: hv,
                onClick: () => { $.hour = hv },
              }, String(hv).padStart(2, '0')))),
          ]),
          h('div', { class: 'wf-time-col' }, [
            h('div', { class: 'wf-time-col-label' }, '分'),
            h('div', { class: 'wf-time-opt-list' },
              minutes.map(mv => h('button', {
                class: `wf-time-opt${mv === $.minute ? ' wf-time-opt--selected' : ''}`,
                type: 'button', key: mv,
                onClick: () => { $.minute = mv },
              }, String(mv).padStart(2, '0')))),
          ]),
        ]),
        h('div', { class: 'wf-time-footer' }, [
          h('button', { class: 'wf-datepicker-footer-btn', type: 'button', onClick: () => setOpen(false) }, '取消'),
          h('button', { class: 'wf-datepicker-footer-btn', type: 'button', onClick: confirmTime }, '确定'),
        ]),
      ])
      panel = [overlay, timePanel]
    } else if (mode === 'range') {
      // 双月并排
      const nextM = $.viewMonth === 11 ? 0 : $.viewMonth + 1
      const nextY = $.viewMonth === 11 ? $.viewYear + 1 : $.viewYear
      const nextGrid = getCalendarGrid(nextY, nextM)

      const rangeWrap = h('div', {
        style: { top: pos.top, left: pos.left },
        class: 'wf-datepicker-range-wrap',
        onMouseDown: (e: Event) => e.stopPropagation(),
      }, [
        h('div', { class: 'wf-datepicker-range-panel' }, [
          h('div', { class: 'wf-datepicker-header' }, [
            headerBtn('‹', prevMonth),
            h('span', { class: 'wf-datepicker-header-title' }, `${$.viewYear}年${$.viewMonth + 1}月`),
            h('span', { class: 'wf-datepicker-header-title' }),
          ]),
          weekdayRow,
          ...gridRows,
        ]),
        h('div', { class: 'wf-datepicker-range-panel' }, [
          h('div', { class: 'wf-datepicker-header' }, [
            h('span', { class: 'wf-datepicker-header-title' }),
            h('span', { class: 'wf-datepicker-header-title' }, `${nextY}年${nextM + 1}月`),
            headerBtn('›', nextMonth),
          ]),
          h('div', { class: 'wf-datepicker-weekdays' }, weekdays.map(w => h('span', { class: 'wf-datepicker-weekday' }, w))),
          ...nextGrid.map((row, ri) =>
            h('div', { class: 'wf-datepicker-grid', key: `row-${ri}` },
              row.map(cell => {
                const dateStr = formatDate(cell.year, cell.month, cell.day)
                const cls = ['wf-datepicker-cell']
                if (cell.isOtherMonth) cls.push('wf-datepicker-cell--other-month')
                if (cell.isToday) cls.push('wf-datepicker-cell--today')
                if (dateStr === $.rangeStart || dateStr === $.rangeEnd) cls.push('wf-datepicker-cell--range-edge')
                else if ($.rangeStart && $.rangeEnd && dateStr > $.rangeStart && dateStr < $.rangeEnd) cls.push('wf-datepicker-cell--in-range')
                return h('button', {
                  class: cls.join(' '), key: dateStr, type: 'button',
                  onClick: () => selectDate(cell),
                }, String(cell.day))
              }))),
        ]),
      ])
      panel = [overlay, rangeWrap]
    } else {
      // date / datetime
      const content: any[] = [calendarPanel]
      if (mode === 'datetime') {
        content.push(h('div', { class: 'wf-datetime-time' }, [
          h('span', { class: 'wf-datetime-time-label' }, '时间：'),
          h('div', { class: 'wf-datetime-time-select' }, [
            h('select', {
              class: 'wf-datetime-select',
              value: $.hour,
              onChange: (e: Event) => { $.hour = parseInt((e.target as HTMLSelectElement).value) },
            }, hourOptions().map(hv => h('option', { value: hv, key: hv }, String(hv).padStart(2, '0')))),
            h('span', { class: 'wf-datetime-sep' }, ':'),
            h('select', {
              class: 'wf-datetime-select',
              value: $.minute,
              onChange: (e: Event) => { $.minute = parseInt((e.target as HTMLSelectElement).value) },
            }, minuteOptions().map(mv => h('option', { value: mv, key: mv }, String(mv).padStart(2, '0')))),
          ]),
        ]))
      }
      const dp = h('div', {
        style: { top: pos.top, left: pos.left, width: pos.width },
        class: 'wf-datepicker-dropdown', role: 'dialog',
        onKeyDown: handleKeyDown,
        onMouseDown: (e: Event) => e.stopPropagation(),
      }, content)
      panel = [overlay, dp]
    }
  }

  const portalContent = isOpen ? createPortal(panel, 'dp-calendar') : null

  const displayValue = value ?? (mode === 'range' && $.rangeStart && $.rangeEnd ? `${$.rangeStart} ~ ${$.rangeEnd}` : '')

  return h('div', { class: `wf-datepicker${disabled ? ' wf-datepicker--disabled' : ''}` }, [
    h('input', {
      class: 'wf-datepicker-input',
      type: 'text',
      placeholder,
      value: displayValue || '',
      readonly: true,
      disabled,
      onClick: toggle,

    }),
    portalContent,
  ].filter(Boolean))
}
