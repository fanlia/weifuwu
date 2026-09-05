/**
 * filterToWhere —— filter 对象 → WhereExpr 共享转换（命名契约 W0）
 *
 * 协议面（gql filter 输入 / rest query 参数）的数据面声明式过滤 → 查询 AST
 * 的 WhereExpr——**一处实现三面用**（gql/rest/typedQuery 数据面语义一致）。
 *
 * 契约（与 query.ts WhereExpr 对齐）：
 *   - 字段名 → 列名映射（shapeDef.dbFields[field].column）
 *   - and/or 递归组（{ and: [...], or: [...] }）
 *   - 算子集：eq/ne/gt/gte/lt/lte/in/notIn/isNull + contains/startsWith/endsWith
 *     （→ ilike 转义——% _ 反斜杠转义）
 *   - 单 eq 特判（{ col: { eq: v } } 直接 { col: { eq: v } }——组合式 path）
 *   - 危险面：空值跳过（undefined/null——不入 WhereExpr——断言于调用侧显式处理）
 *   - 租户注入是调用侧拼装（协议策略——不在此函数内）
 */
import type { Shape } from './shape.ts'

/** 列映射面（shapeDef.dbFields——字段→DB 列） */
export interface FilterShapeFields {
  dbFields: Record<string, { column?: string }>
}

/** filter 对象 → WhereExpr（字段→列名映射 + 算子转译 + 组合递归） */
export function filterToWhere(
  filter: Record<string, unknown> | null | undefined,
  shapeDef: Pick<Shape<Record<string, never>>, 'dbFields'> | FilterShapeFields,
): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!filter) return out
  for (const [fname, fval] of Object.entries(filter)) {
    if (fname === 'and' || fname === 'or') {
      const groups = (Array.isArray(fval) ? fval : [fval]).map((f: Record<string, unknown>) => filterToWhere(f, shapeDef))
      out[fname] = groups
      continue
    }
    if (fval === null || typeof fval !== 'object') continue
    const col = shapeDef.dbFields[fname]?.column ?? fname
    const v = fval as Record<string, unknown>
    // 单 eq 特判（组合式 path——{ col: { eq: v } } 直接输出——非对象值）
    if (Object.keys(v).some((k) => k === 'eq') && Object.keys(v).length === 1 && typeof v.eq !== 'object') {
      out[col] = { eq: v.eq as unknown }
      continue
    }
    const ops: Record<string, unknown> = {}
    for (const [op, val] of Object.entries(v)) {
      if (val === undefined || val === null) continue
      if (op === 'contains') { ops.ilike = `%${String(val).replace(/([%_])/g, '\\$1')}%`; continue }
      if (op === 'startsWith') { ops.ilike = `${String(val).replace(/([%_])/g, '\\$1')}%`; continue }
      if (op === 'endsWith') { ops.ilike = `%${String(val).replace(/([%_])/g, '\\$1')}`; continue }
      ops[op] = val
    }
    if (Object.keys(ops).length) out[col] = ops
  }
  return out
}
