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
}

export const DatePicker: Component<DatePickerProps> = (_props, ctx) => {
  // ── mount（只一次）──
  const $ = ctx.ui.$
  const L = (ctx as any)?.i18n?.components?.DatePicker ?? {}

  $.show = false
  $.selectedValue = ''
  const now = new Date()
  $.viewYear = now.getFullYear()
  $.viewMonth = now.getMonth()
  $.hour = now.getHours()
  $.minute = Math.round(now.getMinutes() / 5) * 5
  $.selYear = now.getFullYear()
  $.selMonth = now.getMonth()
  $.selDay = now.getDate()
  $.rangeStart = null as string | null
  $.rangeEnd = null as string | null

  let inputEl: HTMLElement | undefined

  // ── render（每次 dirty/props 变化）──
  return (props: DatePickerProps) => {
    const { mode = 'date', value, onChange, placeholder = L.placeholder ?? '选择日期', disabled } = props

    const isOpen = $.show
    const setOpen = (v: boolean) => { $.show = v }
    const toggle = (e: Event) => {
      if (disabled) return
      setOpen(!$.show)
    }

    // ── 位置追踪 ──────────────────────────────────────
    const panelRef = (el: HTMLElement | null) => {
      if (!el || typeof window === 'undefined') return
      const onMove = () => { $.vShow = ($.vShow || 0) + 1 }
      window.addEventListener('scroll', onMove, true)
      window.addEventListener('resize', onMove)
      return () => {
        window.removeEventListener('scroll', onMove, true)
        window.removeEventListener('resize', onMove)
      }
    }

    const pos: { top: number; left: number; width?: number } = (() => {
      if (!isOpen) return { top: 0, left: 0 }
      if (!inputEl) return { top: 0, left: 0 }
      const r = inputEl.getBoundingClientRect()
      return { top: r.bottom + 4, left: r.left, width: r.width }
    })()

    // ── 日期选择 ──────────────────────────────────────
    const selectDate = (day: CalendarDay) => {
      if (mode === 'datetime') {
        $.selYear = day.year; $.selMonth = day.month; $.selDay = day.day
        $.viewYear = day.year; $.viewMonth = day.month
      } else if (mode === 'range') {
        if (!$.rangeStart || ($.rangeStart && $.rangeEnd)) {
          $.rangeStart = formatDate(day.year, day.month, day.day)
          $.rangeEnd = null
        } else {
          $.rangeEnd = formatDate(day.year, day.month, day.day)
          const ds = $.rangeStart < $.rangeEnd ? $.rangeStart : $.rangeEnd
          const de = $.rangeStart < $.rangeEnd ? $.rangeEnd : $.rangeStart
          $.selectedValue = `${ds} ~ ${de}`
          onChange?.($.selectedValue)
          setOpen(false)
        }
      } else {
        $.selectedValue = formatDate(day.year, day.month, day.day)
        onChange?.($.selectedValue)
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
      $.selectedValue = formatTime($.hour, $.minute)
      onChange?.($.selectedValue)
      setOpen(false)
    }

    const confirmDateTime = () => {
      $.selectedValue = formatDateTime($.selYear, $.selMonth, $.selDay, $.hour, $.minute)
      onChange?.($.selectedValue)
      setOpen(false)
    }

    const grid = getCalendarGrid($.viewYear, $.viewMonth)
    const weekdays = [L.w0, L.w1, L.w2, L.w3, L.w4, L.w5, L.w6].some(v => v) ? [L.w0, L.w1, L.w2, L.w3, L.w4, L.w5, L.w6] : getWeekdays()

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
          } else if (mode === 'datetime') {
            if ($.selYear === cell.year && $.selMonth === cell.month && $.selDay === cell.day) classes.push('wf-datepicker-cell--selected')
          } else {
            if (dateStr === $.selectedValue) classes.push('wf-datepicker-cell--selected')
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
      if (e.key === 'Escape') setOpen(false)
    }

    const overlay = h('div', { class: 'wf-datepicker-overlay', onMouseDown: () => setOpen(false) })

    let panel: VNode | [VNode, ...VNode[]] | null = null

    if (isOpen) {
      if (mode === 'time') {
        const hours = hourOptions()
        const minutes = minuteOptions()
        const timePanel = h('div', {
          style: { top: pos.top, left: pos.left, width: pos.width },
          class: 'wf-time-picker', role: 'dialog',
          ref: panelRef,
          onKeyDown: handleKeyDown,
          onMouseDown: (e: Event) => e.stopPropagation(),
        }, [
          h('div', { class: 'wf-time-body' }, [
            h('div', { class: 'wf-time-col' }, [
              h('div', { class: 'wf-time-col-label' }, L.hour ?? '时'),
              h('div', { class: 'wf-time-opt-list' },
                hours.map(hv => h('button', {
                  class: `wf-time-opt${hv === $.hour ? ' wf-time-opt--selected' : ''}`,
                  type: 'button', key: hv,
                  onClick: () => { $.hour = hv },
                }, String(hv).padStart(2, '0')))),
            ]),
            h('div', { class: 'wf-time-col' }, [
              h('div', { class: 'wf-time-col-label' }, L.minute ?? '分'),
              h('div', { class: 'wf-time-opt-list' },
                minutes.map(mv => h('button', {
                  class: `wf-time-opt${mv === $.minute ? ' wf-time-opt--selected' : ''}`,
                  type: 'button', key: mv,
                  onClick: () => { $.minute = mv },
                }, String(mv).padStart(2, '0')))),
            ]),
          ]),
          h('div', { class: 'wf-time-footer' }, [
            h('button', { class: 'wf-datepicker-footer-btn', type: 'button', onClick: () => setOpen(false) }, L.cancel ?? '取消'),
            h('button', { class: 'wf-datepicker-footer-btn', type: 'button', onClick: confirmTime }, L.confirm ?? '确定'),
          ]),
        ])
        panel = [overlay, timePanel]
      } else if (mode === 'range') {
        const nextM = $.viewMonth === 11 ? 0 : $.viewMonth + 1
        const nextY = $.viewMonth === 11 ? $.viewYear + 1 : $.viewYear
        const nextGrid = getCalendarGrid(nextY, nextM)

        const rangeWrap = h('div', {
          style: { top: pos.top, left: pos.left },
          class: 'wf-datepicker-range-wrap',
          ref: panelRef,
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
        const content: any[] = [calendarPanel]
        if (mode === 'datetime') {
          content.push(h('div', { class: 'wf-datetime-time' }, [
            h('span', { class: 'wf-datetime-time-label' }, (L.time ?? '时间') + '：'),
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
          content.push(h('div', { class: 'wf-time-footer' }, [
            h('button', { class: 'wf-datepicker-footer-btn', type: 'button', onClick: confirmDateTime }, L.confirm ?? '确定'),
          ]))
        }
        const dp = h('div', {
          style: { top: pos.top, left: pos.left, width: pos.width },
          class: 'wf-datepicker-dropdown', role: 'dialog',
          ref: panelRef,
          onKeyDown: handleKeyDown,
          onMouseDown: (e: Event) => e.stopPropagation(),
        }, content)
        panel = [overlay, dp]
      }
    }

    const portalContent = isOpen ? createPortal(panel, 'dp-calendar') : null
    const displayValue = value ?? $.selectedValue ?? ''

    return h('div', { class: `wf-datepicker${disabled ? ' wf-datepicker--disabled' : ''}` }, [
      h('input', {
        class: 'wf-datepicker-input',
        type: 'text',
        placeholder,
        value: displayValue || '',
        readonly: true,
        disabled,
        onClick: toggle,
        ref: (el: HTMLElement | null) => { if (el) inputEl = el },
      }),
      portalContent,
    ].filter(Boolean))
  }
}
