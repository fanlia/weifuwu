/**
 * weifuwu/ops —— operator 契约（shape+operator 架构的查询行为层）
 *
 * 算子（drizzle 式）→ WhereExpr（MemorySql 已验证执行面——零新执行代码）
 * 类型收窄：ColRef<T> phantom——eq 值类型绑定列类型·ilike 仅 string 列（编译期）
 *
 * 用法：
 *   const agents = cols('agents', { id: z.uuid(), type: z.enum(['ai','user']), name: z.string() })
 *   where(and(eq(agents.type, 'ai'), ilike(agents.name, '%张%')))
 *   → { type: 'ai', name: { ilike: '%张%' } }（and 为顶层 AND 合并——单列同键覆盖场景除外）
 */
import type { WhereExpr, WhereScalar, ColOps, RawSql } from './query.ts'

/** 列引用（phantom：输出类型 T 绑定列类型——算子值收窄） */
export interface ColRef<T = unknown> {
  /** 列名（dsl 引用名——通常即字段名/别名.字段名） */
  readonly ref: string
  /** 输出类型 phantom */
  readonly __out: T
}

/** 形状驱动的列引用表（keys 与 shape 字段一致——类型面） */
export type ShapeCols<S extends Record<string, unknown>> = { [K in keyof S]: ColRef<S[K]> }

/** 从字段定义构建列引用（形状驱动——类型从 shape 类型参数推导） */
export function cols<S extends Record<string, unknown>>(
  _prefix: string,
  _shape?: S,
): ShapeCols<S> {
  // 运行时由调用方（shape 集成层）注入字段名——见 colsOf(shape)
  return {} as ShapeCols<S>
}

// ── 值算子 ────────────────────────────────────────────────

/** 等值算子（算子模式唯一形态：`{ [col]: { eq: value } }`——裸标量形态已移除） */
export const eq = <T>(col: ColRef<T>, value: T): WhereExpr => ({ [col.ref]: { eq: value as WhereScalar } })
export const ne = <T>(col: ColRef<T>, value: T): WhereExpr => ({ [col.ref]: { ne: value as WhereScalar } })
export const gt = <T>(col: ColRef<T>, value: T): WhereExpr => ({ [col.ref]: { gt: value as WhereScalar } })
export const gte = <T>(col: ColRef<T>, value: T): WhereExpr => ({ [col.ref]: { gte: value as WhereScalar } })
export const lt = <T>(col: ColRef<T>, value: T): WhereExpr => ({ [col.ref]: { lt: value as WhereScalar } })
export const lte = <T>(col: ColRef<T>, value: T): WhereExpr => ({ [col.ref]: { lte: value as WhereScalar } })
export const inArray = <T>(col: ColRef<T>, values: T[]): WhereExpr => ({ [col.ref]: { in: values as WhereScalar[] } })
export const notInArray = <T>(col: ColRef<T>, values: T[]): WhereExpr => ({ [col.ref]: { notIn: values as WhereScalar[] } })
export const between = <T>(col: ColRef<T>, lo: T, hi: T): WhereExpr => ({
  [col.ref]: { between: [lo as WhereScalar, hi as WhereScalar] },
})

// ── 字符串算子（仅 string 列——编译期收窄）──────────────

export const like = (col: ColRef<string>, pattern: string): WhereExpr => ({ [col.ref]: { like: pattern } })
export const ilike = (col: ColRef<string>, pattern: string): WhereExpr => ({ [col.ref]: { ilike: pattern } })
/** contains（%v%——ILIKE 语义——内部模糊搜索面） */
export const contains = (col: ColRef<string>, v: string): WhereExpr => ({ [col.ref]: { ilike: `%${escapeLike(v)}%` } })
export const startsWith = (col: ColRef<string>, v: string): WhereExpr => ({ [col.ref]: { ilike: `${escapeLike(v)}%` } })
export const endsWith = (col: ColRef<string>, v: string): WhereExpr => ({ [col.ref]: { ilike: `%${escapeLike(v)}` } })

/** 列对列等式（join on 面：`eqCol(dm.departmentId, d.id)` → `{ 'dm.department_id': { col: 'd.id' } }`） */
export const eqCol = (left: ColRef<unknown>, right: ColRef<unknown>): WhereExpr => ({
  [left.ref]: { col: right.ref },
})

// ── 空值 ──────────────────────────────────────────────────

export const isNull = (col: ColRef<unknown>): WhereExpr => ({ [col.ref]: { isNull: true } })
export const isNotNull = (col: ColRef<unknown>): WhereExpr => ({ [col.ref]: { isNull: false } })

// ── 时间/列引用表达式（编码算子——无 raw 文本面）────────────────

/** NOW()（时间戳 SET——`col = NOW()`） */
export const now = (): unknown => ({ __now: true })

/** NOW() + INTERVAL 'n unit'（n 负 = 过去——`NOW() - INTERVAL 'n unit'`） */
export function nowInterval(n: number, unit: 'day' | 'hour' | 'minute' = 'day'): unknown {
  return { __interval: [n, unit] }
}

/** NOW() - INTERVAL 'n unit'（时间窗查询——记忆/审计等） */
export function nowAgo(n: number, unit: 'day' | 'hour' | 'minute' = 'day'): unknown {
  return { __interval: [-n, unit] }
}

/** DATE_TRUNC('month', NOW())（月起始——计量/账单窗口） */
export const monthStart = (): unknown => ({ __monthStart: true })

/** 列引用 SET（`col = other_col`——messages.content = ai_draft 等） */
export const colRef = (name: string): unknown => ({ __colRef: name })

// ── 逻辑组合 ──────────────────────────────────────────────

/**
 * AND 组合（顶层列合并——同键（eq 两次）后者覆盖的边界：显式传入 and 数组时
 * 以数组语义（逐条）执行——见 MemorySql 'and' 分支）
 */
/** 条件安全组合：空对象/联合条件（`q ? {...} : {}` 样板）直接收——空对象恒真（AND 无约束/OR 恒真符合直觉） */
export type CondWhere = WhereExpr | Record<string, never>
export function and(...conds: CondWhere[]): WhereExpr {
  const alive = conds.filter((c) => Object.keys(c).length > 0)
  if (alive.length === 0) return {}
  if (alive.length === 1) return alive[0]
  return { and: alive as WhereExpr[] }
}
export function or(...conds: CondWhere[]): WhereExpr {
  const alive = conds.filter((c) => Object.keys(c).length > 0)
  if (alive.length === 0) return {}
  if (alive.length === 1) return alive[0]
  return { or: alive as WhereExpr[] }
}
export function not(cond: WhereExpr): WhereExpr {
  // 内存无 NOT 算子——对单键条件取反（eq→ne/gt→lte 等）；复合条件走 and/or 包装
  // （诚实边界：复合 NOT 需要真栈——调用方用 ne/notInArray 表达）
  const keys = Object.keys(cond)
  if (keys.length === 1) {
    const k = keys[0]
    const f = cond[k] as ColOps
    if (f !== null && typeof f === 'object') {
      const neg: ColOps = { ...f }
      if (f.eq !== undefined) return { [k]: { ne: f.eq } }
      if (f.ne !== undefined) return { [k]: { eq: f.ne } }
      if (f.gt !== undefined) return { [k]: { lte: f.gt } }
      if (f.gte !== undefined) return { [k]: { lt: f.gte } }
      if (f.lt !== undefined) return { [k]: { gte: f.lt } }
      if (f.lte !== undefined) return { [k]: { gt: f.lte } }
      if (f.in !== undefined) return { [k]: { notIn: f.in } }
      if (f.notIn !== undefined) return { [k]: { in: f.notIn } }
      if (f.isNull !== undefined) return { [k]: { isNull: !f.isNull } }
    }
    // 标量等值取反
    if (f !== null && typeof f !== 'object' && !Array.isArray(f)) return { [k]: { ne: f } }
  }
  // 复合 NOT：内存不支持真 NOT——抛错（诚实边界——用 ne/notInArray 表达）
  throw new Error('ops.not: 复合条件 NOT 不支持（内存面）——请用 ne/notInArray 表达')
}

/** LIKE 模式转义（%/_ 字面量——防止用户输入模式注入） */
function escapeLike(v: string): string {
  return v.replace(/([%_])/g, '\\$1')
}

// ── merge 表达式（update/upsert 的 SET 值面——jsonb 追加/自增/now——业务零 SQL） ──────

/** jsonb 数组追加（`col = col || $n::jsonb`）——agent_run_states.steps 等 */
export function mergeAppend(val: unknown): unknown {
  return { __jsonbAppend: val }
}

/** 数值自增（`col = col + n`）——answer_cache.hits 等 */
export function mergeInc(n = 1): unknown {
  return { __inc: n }
}

/** 时间戳（`NOW()`）——updated_at 等（与 ops.now 同编码） */
export const mergeNow = now
