/**
 * weifuwu/db — 一致性诊断（W3）：声明（orm 注册表）vs 实况（库 schema）diff。
 *
 * 纯函数（无 IO）——真库（information_schema）与内存（schemaSnapshot）共用：
 * - table-missing / column-missing → error（声明有库无——必须修）
 * - type-mismatch → warn（宽等价组（TEXT/varchar 等）不误报；zodTypeOf 不可判定
 *   的列（vector 等 columnTypes 特化）跳过——诚实裁剪）
 * - table-extra / column-extra → warn（残留提示——不阻断）
 */
import { zodTypeOf } from './schema.ts'

export interface ConsistencyIssue {
  level: 'error' | 'warn'
  kind: string
  table: string
  column?: string
  expected?: string
  found?: string
}

export interface DeclaredTable {
  name: string
  fields: Record<string, unknown>
  dbFields: Record<string, { column?: string }>
}

export interface LiveTable {
  name: string
  columns: { name: string; type: string }[]
}

/** PG 类型名归一（宽等价组——声明 DDL 名 vs 库 data_type 对齐；组内不误报） */
export function normalizeType(t: string): string {
  const v = t.toLowerCase().replace(/\(\d+(,\d+)?\)/, '')
  const groups: [string, string[]][] = [
    ['text', ['text', 'character varying', 'varchar', 'character', 'char', 'bpchar', 'citext']],
    ['uuid', ['uuid']],
    ['int', ['int', 'integer', 'int4', 'int2', 'smallint', 'serial']],
    ['int8', ['bigint', 'int8']],
    ['numeric', ['numeric', 'decimal']],
    ['float', ['double precision', 'float8', 'real', 'float4']],
    ['bool', ['boolean', 'bool']],
    ['timestamptz', ['timestamp with time zone', 'timestamp without time zone', 'timestamp', 'timestamptz', 'date']],
    ['jsonb', ['jsonb', 'json']],
  ]
  for (const [canon, members] of groups) if (members.includes(v)) return canon
  return v
}

export function diffConsistency(decl: DeclaredTable[], live: LiveTable[]): { ok: boolean; issues: ConsistencyIssue[] } {
  const issues: ConsistencyIssue[] = []
  const liveMap = new Map(live.map((t) => [t.name, t]))
  for (const t of decl) {
    const lt = liveMap.get(t.name)
    if (!lt) { issues.push({ level: 'error', kind: 'table-missing', table: t.name }); continue }
    const liveCols = new Map(lt.columns.map((c) => [c.name.toLowerCase(), c]))
    for (const [field, ztRaw] of Object.entries(t.fields)) {
      const col = (t.dbFields[field]?.column ?? field).toLowerCase()
      const liveCol = liveCols.get(col)
      if (!liveCol) { issues.push({ level: 'error', kind: 'column-missing', table: t.name, column: col }); continue }
      let declared: string | undefined
      try { declared = normalizeType(zodTypeOf(ztRaw as never)) } catch { declared = undefined /* 特化列型——跳过 */ }
      if (declared && normalizeType(liveCol.type) !== declared) {
        issues.push({ level: 'warn', kind: 'type-mismatch', table: t.name, column: col, expected: declared, found: liveCol.type })
      }
    }
  }
  // 实况侧残留（无声明——warn 提示）
  for (const t of live) {
    if (t.name.startsWith('_weifuwu')) continue
    const d = decl.find((x) => x.name === t.name)
    if (!d) { issues.push({ level: 'warn', kind: 'table-extra', table: t.name }); continue }
    const declCols = new Set(Object.entries(d.fields).map(([f]) => (d.dbFields[f]?.column ?? f).toLowerCase()))
    for (const c of t.columns) if (!declCols.has(c.name.toLowerCase())) {
      issues.push({ level: 'warn', kind: 'column-extra', table: t.name, column: c.name })
    }
  }
  return { ok: issues.every((i) => i.level === 'warn'), issues }
}
