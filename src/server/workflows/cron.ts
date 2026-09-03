/**
 * cron 表达式解析（5 字段子集——零依赖手写）
 *
 * 字段：分 时 日 月 周（min hour dom mon dow）
 * 语法（每字段）：`*` 任意 | `*\/N` 步长 | `N` 单个 | `N-M` 范围 | `N,M` 列表（逗号组合）
 * 周：0/7=周日、1-6=周一至周六（JS Date.getDay 语义）
 *
 * 解析为纯函数 `(d: Date) => boolean`——tick 匹配即时判定（无状态）。
 */
export type CronMatcher = (d: Date) => boolean

const FIELD_NAMES = ['分钟(0-59)', '小时(0-23)', '日(1-31)', '月(1-12)', '周(0-7, 0/7=周日)']
const FIELD_MAX = [59, 23, 31, 12, 7]

/** 单字段 → 匹配函数（值域校验——非法表达式抛错——防配置暗雷） */
function parseField(raw: string, idx: number): (v: number) => boolean {
  const name = FIELD_NAMES[idx]
  const inRange = (v: number): boolean => {
    if (idx === 4) return v >= 0 && v <= 7 // 周：0-7（7=周日别名）
    const min = idx === 2 || idx === 3 ? 1 : 0 // 日/月从 1 起
    return v >= min && v <= FIELD_MAX[idx]
  }
  const check = (v: number): void => {
    if (!inRange(v)) throw new Error(`cron 字段「${name}」值 ${v} 越界`)
  }
  // 逗号列表
  if (raw.includes(',')) {
    const parts = raw.split(',').map((p) => p.trim())
    if (parts.some((p) => !p)) throw new Error(`cron 字段「${name}」列表含空项`)
    const subs = parts.map((p) => parseField(p, idx))
    return (v) => subs.some((f) => f(v))
  }
  // 步长 a/N
  const stepMatch = raw.match(/^\*\/(\d+)$/)
  if (stepMatch) {
    const n = Number(stepMatch[1])
    if (n < 1) throw new Error(`cron 字段「${name}」步长必须 ≥1`)
    return (v) => v % n === 0
  }
  // 范围 N-M
  const rangeMatch = raw.match(/^(\d+)-(\d+)$/)
  if (rangeMatch) {
    const lo = Number(rangeMatch[1])
    const hi = Number(rangeMatch[2])
    check(lo); check(hi)
    if (lo > hi) throw new Error(`cron 字段「${name}」范围起大于止（${lo}-${hi}）`)
    return (v) => v >= lo && v <= hi
  }
  // 单个
  if (raw === '*') return () => true
  if (/^\d+$/.test(raw)) {
    const n = Number(raw)
    check(n)
    return (v) => v === n
  }
  throw new Error(`cron 字段「${name}」无法识别：'${raw}'（支持 * a/N N N-M N,M）`)
}

export function parseCron(expr: string): CronMatcher {
  const fields = expr.trim().split(/\s+/)
  if (fields.length !== 5) {
    throw new Error(`cron 表达式需 5 字段（分 时 日 月 周）——收到 ${fields.length} 个：'${expr}'`)
  }
  const [min, hour, dom, mon, dow] = fields.map((f, i) => parseField(f, i))
  return (d: Date): boolean =>
    min(d.getMinutes()) &&
    hour(d.getHours()) &&
    dom(d.getDate()) &&
    mon(d.getMonth() + 1) &&
    dow(d.getDay())
}

/**
 * 分钟键（调度器幂等去重：同分钟同工作流只触发一次——进程内）
 * 格式：YYYY-MM-DDTHH:MM（本地时区）
 */
export function minuteKey(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
