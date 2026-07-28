/**
 * weifuwu/components — DatePicker 日期计算工具
 *
 * 纯函数，无 DOM 依赖，可测试。
 */

export interface CalendarDay {
  year: number
  month: number
  day: number
  isOtherMonth: boolean
  isToday: boolean
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

export function getWeekdays(): string[] {
  return WEEKDAYS
}

export function isToday(year: number, month: number, day: number): boolean {
  const t = new Date()
  return t.getFullYear() === year && t.getMonth() === month && t.getDate() === day
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

export function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay()
}

/** 生成一个月历网格（6 行 × 7 列 = 42 格） */
export function getCalendarGrid(year: number, month: number): CalendarDay[][] {
  const days: CalendarDay[][] = []
  const totalDays = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)

  const prevMonth = month === 0 ? 11 : month - 1
  const prevYear = month === 0 ? year - 1 : year
  const prevMonthDays = getDaysInMonth(prevYear, prevMonth)

  const today = new Date()

  let row: CalendarDay[] = []

  // 上个月的补位日期
  for (let i = firstDay - 1; i >= 0; i--) {
    const d = prevMonthDays - i
    row.push({
      year: prevYear, month: prevMonth, day: d,
      isOtherMonth: true,
      isToday: prevYear === today.getFullYear() && prevMonth === today.getMonth() && d === today.getDate(),
    })
  }

  // 当月日期
  for (let d = 1; d <= totalDays; d++) {
    row.push({
      year, month, day: d,
      isOtherMonth: false,
      isToday: year === today.getFullYear() && month === today.getMonth() && d === today.getDate(),
    })
    if (row.length === 7) {
      days.push(row)
      row = []
    }
  }

  // 下个月的补位日期
  const nextMonth = month === 11 ? 0 : month + 1
  const nextYear = month === 11 ? year + 1 : year
  let nextDay = 1
  while (row.length < 7) {
    row.push({
      year: nextYear, month: nextMonth, day: nextDay++,
      isOtherMonth: true,
      isToday: nextYear === today.getFullYear() && nextMonth === today.getMonth() && (nextDay - 1) === today.getDate(),
    })
  }
  days.push(row)

  return days
}

/** 格式化日期 */
export function formatDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function formatTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function formatDateTime(year: number, month: number, day: number, hour: number, minute: number): string {
  return `${formatDate(year, month, day)} ${formatTime(hour, minute)}`
}

/** 小时选项（00-23） */
export function hourOptions(): number[] {
  return Array.from({ length: 24 }, (_, i) => i)
}

/** 分钟选项（00-59，步长 5） */
export function minuteOptions(): number[] {
  return Array.from({ length: 12 }, (_, i) => i * 5)
}

/** 日期比较：a 是否在 b 之前 */
export function isBefore(a: Date, b: Date): boolean {
  return a.getTime() < b.getTime()
}

/** 日期比较：a 是否在 b 之后 */
export function isAfter(a: Date, b: Date): boolean {
  return a.getTime() > b.getTime()
}
