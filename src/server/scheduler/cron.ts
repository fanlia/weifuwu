/**
 * cron 表达式解析器（零依赖，5 字段）
 *
 * 字段：分(0-59) 时(0-23) 日(1-31) 月(1-12) 周(0-6, 0=周日)
 * 语法：* | 星号斜杠 n（步进） | a,b,c | a-b
 * 裁剪：秒/年字段、别名(@daily)、L/W/#、? —— 非法抛错（诚实裁剪，不静默降级）
 */

export interface CronField {
  /** 匹配的取值集合（已展开；空 = 匹配任意） */
  values: Set<number> | null
}

export interface CronExpr {
  fields: [CronField, CronField, CronField, CronField, CronField] // 分 时 日 月 周
  /** 日/周是否都显式指定（都非 * 时取 OR 语义） */
  domExplicit: boolean
  dowExplicit: boolean
}

const RANGES: [number, number][] = [
  [0, 59], // 分
  [0, 23], // 时
  [1, 31], // 日
  [1, 12], // 月
  [0, 6], // 周
]

/** 解析单个字段：* | 星号斜杠 n（步进） | a,b,c | a-b → 取值集合（* → null 表示任意） */
function parseField(field: string, idx: number): Set<number> | null {
  const [min, max] = RANGES[idx]
  const name = ['minute', 'hour', 'day', 'month', 'weekday'][idx]

  if (field === '*') return null // 任意——由调用方决定展开（日/周 OR 语义需要）

  // 步进：*/n
  if (field.startsWith('*/')) {
    const n = Number(field.slice(2))
    if (!Number.isInteger(n) || n <= 0 || n > max) {
      throw new Error(`cron: invalid step '${field}' in ${name} field (must be 1..${max})`)
    }
    const set = new Set<number>()
    for (let v = min; v <= max; v += n) set.add(v)
    return set
  }

  // 逗号列表（每项可带范围/步进）
  const set = new Set<number>()
  for (const part of field.split(',')) {
    if (part === '') throw new Error(`cron: empty item in '${field}' (${name})`)
    if (part.includes('-')) {
      // 范围 a-b 或 a-b/n
      const [rangePart, stepPart] = part.split('/')
      const step = stepPart !== undefined ? Number(stepPart) : 1
      const [a, b] = rangePart.split('-').map(Number)
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < min || b > max || a > b) {
        throw new Error(`cron: invalid range '${part}' in ${name} field (${min}..${max})`)
      }
      if (!Number.isInteger(step) || step <= 0) throw new Error(`cron: invalid step in '${part}'`)
      for (let v = a; v <= b; v += step) set.add(v)
    } else {
      const v = Number(part)
      if (!Number.isInteger(v) || v < min || v > max) {
        throw new Error(`cron: value '${part}' out of range ${min}..${max} in ${name} field`)
      }
      set.add(v)
    }
  }
  return set
}

/** 解析完整 cron 表达式（5 字段，空格分隔） */
export function parseCron(expr: string): CronExpr {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) {
    throw new Error(`cron: expected 5 fields (min hour dom month dow), got ${parts.length}: '${expr}'`)
  }
  const fields = parts.map((p, i) => parseField(p, i)) as [
    CronField['values'],
    CronField['values'],
    CronField['values'],
    CronField['values'],
    CronField['values'],
  ]
  return {
    fields: fields.map((values) => ({ values })) as CronExpr['fields'],
    domExplicit: fields[2] !== null,
    dowExplicit: fields[4] !== null,
  }
}

/** 字段是否匹配（null = 任意匹配） */
function fieldMatches(values: Set<number> | null, v: number): boolean {
  if (values === null) return true
  return values.has(v)
}

/** 日/周匹配：都显式指定时取 OR（标准 cron），否则各管各 */
function dayMatches(expr: CronExpr, dom: number, dow: number): boolean {
  const domOk = fieldMatches(expr.fields[2].values, dom)
  const dowOk = fieldMatches(expr.fields[4].values, dow)
  if (expr.domExplicit && expr.dowExplicit) return domOk || dowOk
  if (expr.domExplicit) return domOk
  if (expr.dowExplicit) return dowOk
  return true
}

/** 查找包含 v 的下一个匹配值（环回起点返回 null——需要进位） */
function nextMatch(values: Set<number> | null, v: number, min: number, max: number): number | null {
  if (values === null) return v // 任意——当前值即可
  for (let x = v; x <= max; x++) if (values.has(x)) return x
  return null
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
function daysInMonth(year: number, month: number): number {
  // month: 1-12
  if (month === 2 && ((year % 4 === 0 && year % 100 !== 0) || year % 400 === 0)) return 29
  return DAYS_IN_MONTH[month - 1]
}

/**
 * 计算下一个触发时间（严格晚于 from）
 *
 * 经典按字段进位算法：从 from 的下一分钟开始，逐级检查
 * 分 → 时 → 日/月 → 月，不匹配则跳到下一级边界。
 */
export function nextRun(expr: CronExpr, from: Date): Date {
  // 对齐到下一分钟起点
  const d = new Date(from.getTime())
  d.setSeconds(0, 0)
  d.setMinutes(d.getMinutes() + 1)

  // 安全上限：向后搜 5 年（非法表达式防死循环）
  const deadline = from.getTime() + 5 * 366 * 24 * 3600 * 1000

  while (d.getTime() <= deadline) {
    const year = d.getFullYear()
    const month = d.getMonth() + 1 // 1-12
    const dom = d.getDate()
    const dow = d.getDay() // 0-6

    // 月不匹配 → 下月 1 日 00:00
    if (!fieldMatches(expr.fields[3].values, month)) {
      d.setMonth(month, 1) // 当月 1 日
      d.setHours(0, 0, 0, 0)
      d.setMonth(month) // 下月
      continue
    }
    // 日/周不匹配 → 明天 00:00
    if (!dayMatches(expr, dom, dow)) {
      d.setDate(dom + 1)
      d.setHours(0, 0, 0, 0)
      continue
    }
    // 时不匹配 → 下一个匹配的时（环回则明天）
    const hour = d.getHours()
    const nextHour = nextMatch(expr.fields[1].values, hour, 0, 23)
    if (nextHour === null) {
      d.setDate(dom + 1)
      d.setHours(0, 0, 0, 0)
      continue
    }
    if (nextHour !== hour) {
      d.setHours(nextHour, 0, 0, 0)
      continue
    }
    // 分不匹配 → 下一个匹配的分（环回则下一小时）
    const minute = d.getMinutes()
    const nextMinute = nextMatch(expr.fields[0].values, minute, 0, 59)
    if (nextMinute === null) {
      d.setHours(hour + 1, 0, 0, 0)
      continue
    }
    if (nextMinute !== minute) {
      d.setMinutes(nextMinute, 0, 0)
      continue
    }
    return d
  }
  throw new Error('cron: no next run within 5 years (invalid expression?)')
}
