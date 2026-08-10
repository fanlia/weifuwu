/**
 * weifuwu/db — MemorySql：内存版 Postgres（实现契约 Sql 接口）
 *
 * 用法：createMemorySql() 返回 callable Sql（与 makeSql(PgPool) 同构）——
 * 开发 / 测试 / 单实例部署（无 postgres 依赖），userSystem / messager 参数直接替换。
 * MemorySql class 是内部引擎（非 callable）；工厂包装为标签模板可调用对象。
 *
 * 支持 SQL 子集（参数化 + 字面量）：
 *   SELECT * FROM t [WHERE col op $n [AND ...]] [LIMIT n]
 *   INSERT INTO t (c1, ...) VALUES ($1, ...) [RETURNING *]
 *   UPDATE t SET c1 = $1, ... [WHERE ...]
 *   DELETE FROM t [WHERE ...]
 *   WHERE op: = != <> > < >= <= IN（值 = 参数 $n 或字面量；AND 连接）
 *
 * 诚实裁剪（CS-05）：不支持的 SQL（JOIN/ORDER BY/GROUP BY/子查询/DDL 等）
 * 抛 ProtocolError('unsupported')——绝不静默降级或假装执行。
 * ⚠️ 仅供开发/测试/单实例——持久化/并发/事务由真实 Postgres 承担（文档红线）。
 */
import { randomUUID } from 'node:crypto'
import type { Sql, Row, QueryResult } from './contracts.ts'
import { ProtocolError } from './errors.ts'
import { HttpError } from '../types.ts'
import type { Query, SelectQuery, WhereExpr, RawSql, ColOps } from './query.ts'
import { createQueryBuilder } from './query-builder.ts'

interface MemoryTable {
  rows: Row[]
  nextId: number
  /** DDL 解析的约束：pk（DEFAULT 生成列）与 unique 列 */
  pk?: { col: string; defaultUuid: boolean }
  uniques: Set<string>
}

type WhereClause = {
  cols: { col: string; op: string; val: unknown }[]
}

/** 解析后的语句（单表 CRUD 子集） */
type Statement =
  | { kind: 'ddl'; table?: string; drop?: string; constraints?: { pk?: { col: string; defaultUuid: boolean }; uniques: string[] } }
  | { kind: 'select'; table: string; cols?: string[]; where?: WhereClause; limit?: number; count?: boolean }
  | { kind: 'insert'; table: string; cols: string[]; vals: unknown[]; returning: boolean; returningCols?: string[] }
  | { kind: 'update'; table: string; sets: { col: string; val: unknown }[]; where?: WhereClause }
  | { kind: 'delete'; table: string; where?: WhereClause }

export class MemorySql {
  private tables = new Map<string, MemoryTable>()

  /** 标签模板 → 参数化 SQL（values 顺序即 $1..$n） */
  async tag(strings: TemplateStringsArray, values: unknown[]): Promise<Row[]> {
    const sql = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ''), '')
    return this.unsafe(sql, values)
  }

  async unsafe(sql: string, params: unknown[] = []): Promise<Row[]> {
    try {
      const stmt = parseSQL(sql, params)
      return this.execute(stmt)
    } catch (e) {
      // PG 错误码映射（对齐 makeSql wrapError）——唯一冲突 23505 → 409
      const code = (e as { code?: string })?.code
      if (code === '23505') throw new HttpError(`数据库错误: ${(e as Error).message}`, 409)
      throw e
    }
  }

  async close(): Promise<void> {
    // 内存无连接资源——no-op（幂等）
  }

  // ── Query Language：直执行 AST（不走字符串解析） ────────

  /** 执行结构化查询（真库编译 SQL / 内存直操作表） */
  executeQuery(q: Query): QueryResult<Row> {
    switch (q.kind) {
      case 'select': return this.execSelect(q)
      case 'insert': return this.execInsert(q)
      case 'update': return this.execUpdate(q)
      case 'delete': return this.execDelete(q)
    }
  }

  private execSelect(q: SelectQuery): QueryResult<Row> {
    // JOIN 笛卡尔积 + on 过滤（内存 INNER/LEFT）
    let rows: Row[] = this.table(q.table).rows
    let tableAlias = q.alias ?? q.table
    for (const j of q.joins ?? []) {
      const right = this.table(j.table).rows
      const jAlias = j.alias ?? j.table
      const joined: Row[] = []
      for (const l of rows) {
        for (const r of right) {
          const merged: Row = {}
          for (const [k, v] of Object.entries(l)) merged[`${tableAlias}.${k}`] = v
          for (const [k, v] of Object.entries(r)) merged[`${jAlias}.${k}`] = v
          if (isRaw(j.on)) throw new ProtocolError('memory-sql: raw JOIN ON 不支持（诚实裁剪——用真库）')
          if (matchWhereExpr(merged, j.on, undefined)) joined.push(merged)
        }
      }
      rows = joined
      tableAlias = jAlias
    }
    // WHERE（raw 伪装 → 内存裁剪）
    if (q.where && '__raw' in (q.where as object)) {
      throw new ProtocolError('memory-sql: raw WHERE 不支持（诚实裁剪——用真库）')
    }
    let filtered = q.where ? rows.filter((r) => matchWhereExpr(r, q.where!, tableAlias)) : rows
    // 子查询（IN/EXISTS——对内存表执行子 AST）
    for (const sub of q.sub ?? []) {
      const subRows = this.executeQuery(sub.query) as unknown[]
      if (sub.type === 'exists') {
        const hit = subRows.length > 0
        filtered = filtered.filter(() => sub.not ? !hit : hit)
      } else {
        const vals = new Set(subRows.map((r) => (r as Record<string, unknown>)[String(sub.query.cols?.[0] ?? Object.keys(r as Record<string, unknown>)[0])]))
        filtered = filtered.filter((r) => {
          const v = resolveCol(r, sub.col!, tableAlias)
          return sub.not ? !vals.has(v) : vals.has(v)
        })
      }
    }
    // GROUP BY + 聚合
    let out: Row[]
    if (q.aggregate?.length) {
      const groups = new Map<string, Row[]>()
      for (const r of filtered) {
        const key = (q.groupBy ?? []).map((g) => JSON.stringify(resolveCol(r, g, tableAlias))).join('|')
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(r)
      }
      out = [...groups.values()].map((g) => {
        const row: Row = {}
        for (const gb of q.groupBy ?? []) row[gb] = resolveCol(g[0], gb, tableAlias)
        for (const a of q.aggregate!) {
          const col = a.col === '*' ? undefined : resolveCol(g[0], a.col, tableAlias)
          const values = a.col === '*' ? g : g.map((r) => resolveCol(r, a.col, tableAlias))
          if (a.fn === 'count') row[a.as] = values.length
          else if (a.fn === 'sum') row[a.as] = (values as unknown[]).reduce((x: number, y) => x + Number(y ?? 0), 0)
          else if (a.fn === 'avg') row[a.as] = (values as unknown[]).length ? (values as unknown[]).reduce((x: number, y) => x + Number(y ?? 0), 0) / (values as unknown[]).length : 0
          else if (a.fn === 'min') row[a.as] = (values as unknown[]).reduce((x: unknown, y: unknown) => (y !== null && (x === null || (y as never) < (x as never)) ? y : x), null)
          else if (a.fn === 'max') row[a.as] = (values as unknown[]).reduce((x: unknown, y: unknown) => (y !== null && (x === null || (y as never) > (x as never)) ? y : x), null)
        }
        return row
      })
      if (q.having) out = out.filter((r) => matchWhereExpr(r, q.having!, undefined))
    } else if (q.cols?.length) {
      // 投影：直接从前缀行取列（JOIN 同名列精确——不先 unqualified 丢前缀）
      out = filtered.map((r) => {
        const proj: Row = {}
        for (const c of q.cols!) {
          if (isRaw(c)) throw new ProtocolError('memory-sql: raw 投影不支持（诚实裁剪——用真库）')
          proj[stripTable(c)] = resolveCol(r, c)
        }
        return proj
      })
    } else {
      out = filtered.map((r) => {
        const proj: Row = {}
        const src = q.joins?.length ? r : unqualified(r)
        for (const [k, v] of Object.entries(src)) proj[stripTable(k)] = v
        return proj
      })
    }
    // DISTINCT：按投影行去重（cols / 全列两分支统一）
    if (q.distinct) {
      const seen = new Set<string>()
      out = out.filter((r) => {
        const key = JSON.stringify(r)
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    }
    // ORDER BY / LIMIT / OFFSET
    if (q.orderBy?.length) {
      const ob = q.orderBy
      out.sort((a, b) => {
        for (const o of ob) {
          const va = a[stripTable(o.col)]
          const vb = b[stripTable(o.col)]
          if (va === vb) continue
          const cmp = Number(va) > Number(vb) ? 1 : -1
          return o.dir === 'desc' ? -cmp : cmp
        }
        return 0
      })
    }
    if (q.offset !== undefined) out = out.slice(q.offset)
    if (q.limit !== undefined) out = out.slice(0, q.limit)
    const res = out as QueryResult<Row>
    res.affectedRows = out.length
    return res
  }

  private execInsert(q: import('./query.ts').InsertQuery): QueryResult<Row> {
    const t = this.table(q.table)
    const results: Row[] = []
    for (const row of q.rows) {
      // PK DEFAULT / UNIQUE 检查（与字符串路径同约束）
      if (t.pk && !(t.pk.col in row)) row[t.pk.col] = t.pk.defaultUuid ? randomUUID() : `mem-${t.nextId}`
      for (const u of t.uniques) {
        if (u in row && t.rows.some((r) => deepEq(r[u], row[u]))) {
          throw new HttpError(`数据库错误: duplicate key value violates unique constraint "${u}"`, 409)
        }
      }
      t.rows.push(row)
      t.nextId++
      if (q.returning) results.push(q.returning === '*' ? { ...row } : pick(row, q.returning))
    }
    const res = results as QueryResult<Row>
    res.affectedRows = q.rows.length
    return res
  }

  private execUpdate(q: import('./query.ts').UpdateQuery): QueryResult<Row> {
    const t = this.table(q.table)
    let n = 0
    const results: Row[] = []
    for (const r of t.rows) {
      if (!q.where || matchWhereExpr(r, q.where, undefined)) {
        for (const [k, v] of Object.entries(q.sets)) {
          if (isRaw(v)) throw new ProtocolError('memory-sql: raw SET 值不支持（诚实裁剪——用真库）')
          r[k] = v
        }
        n++
        if (q.returning) results.push(q.returning === '*' ? { ...r } : pick(r, q.returning))
      }
    }
    const res = results as QueryResult<Row>
    res.affectedRows = n
    return res
  }

  private execDelete(q: import('./query.ts').DeleteQuery): QueryResult<Row> {
    const t = this.table(q.table)
    const before = t.rows.length
    let kept: Row[] = []
    const results: Row[] = []
    for (const r of t.rows) {
      if (!q.where || matchWhereExpr(r, q.where, undefined)) {
        if (q.returning) results.push(q.returning === '*' ? { ...r } : pick(r, q.returning))
      } else {
        kept.push(r)
      }
    }
    t.rows = kept
    const res = results as QueryResult<Row>
    res.affectedRows = before - kept.length
    return res
  }

  // ── 执行 ──────────────────────────────────────────────

  private table(name: string): MemoryTable {
    let t = this.tables.get(name)
    if (!t) { t = { rows: [], nextId: 1, uniques: new Set() }; this.tables.set(name, t) }
    return t
  }

  private execute(stmt: Statement): QueryResult<Row> {
    switch (stmt.kind) {
      case 'ddl': {
        if (stmt.drop) {
          this.tables.delete(stmt.drop)
        } else if (stmt.table && stmt.constraints) {
          // CREATE TABLE：立即建元数据（含约束）——INSERT 时强制 PK 默认值/唯一检查
          const t = this.table(stmt.table)
          t.pk = stmt.constraints.pk
          for (const u of stmt.constraints.uniques) t.uniques.add(u)
        }
        const res: QueryResult<Row> = []
        res.affectedRows = 0
        return res
      }
      case 'select': {
        const t = this.table(stmt.table)
        let rows = stmt.where ? t.rows.filter((r) => matchWhere(r, stmt.where!)) : [...t.rows]
        if (stmt.limit !== undefined) rows = rows.slice(0, stmt.limit)
        const res = (stmt.count
          ? [{ count: rows.length }]
          : stmt.cols
            ? rows.map((r) => pick(r, stmt.cols!))
            : rows.map((r) => ({ ...r }))) as QueryResult<Row>
        res.affectedRows = res.length
        return res
      }
      case 'insert': {
        const t = this.table(stmt.table)
        const row: Row = {}
        for (let i = 0; i < stmt.cols.length; i++) row[stmt.cols[i]] = stmt.vals[i]
        // PK DEFAULT：未提供时生成（gen_random_uuid() → uuid；否则自增序号）
        if (t.pk && !(t.pk.col in row)) {
          row[t.pk.col] = t.pk.defaultUuid ? randomUUID() : `mem-${t.nextId}`
        }
        // UNIQUE 约束：重复 → 23505（userSystem 唯一冲突映射 409）
        for (const u of t.uniques) {
          if (u in row && t.rows.some((r) => deepEq(r[u], row[u]))) {
            const err = new ProtocolError(`duplicate key value violates unique constraint "${u}"`)
            ;(err as Error & { code?: string }).code = '23505'
            throw err
          }
        }
        t.rows.push(row)
        t.nextId++
        const res: QueryResult<Row> = []
        if (stmt.returning) {
          res.push(stmt.returningCols ? pick(row, stmt.returningCols) : { ...row })
        }
        res.affectedRows = 1
        return res
      }
      case 'update': {
        const t = this.table(stmt.table)
        let n = 0
        for (const r of t.rows) {
          if (!stmt.where || matchWhere(r, stmt.where)) {
            for (const { col, val } of stmt.sets) r[col] = val
            n++
          }
        }
        const res: QueryResult<Row> = []
        res.affectedRows = n
        return res
      }
      case 'delete': {
        const t = this.table(stmt.table)
        const before = t.rows.length
        t.rows = stmt.where ? t.rows.filter((r) => !matchWhere(r, stmt.where!)) : []
        const res: QueryResult<Row> = []
        res.affectedRows = before - t.rows.length
        return res
      }
    }
  }

  /** 测试辅助：当前表内容 */
  _dump(table: string): Row[] {
    return (this.tables.get(table)?.rows ?? []).map((r) => ({ ...r }))
  }
}

/**
 * 工厂：返回 callable Sql（标签模板 `sql\`...\``）+ unsafe + close。
 * 与真实 makeSql(PgPool) 同一契约形状——引擎可无缝替换。
 */
export function createMemorySql(): Sql {
  const engine = new MemorySql()
  const sql = ((strings: TemplateStringsArray, ...values: unknown[]) => engine.tag(strings, values)) as unknown as Sql
  sql.unsafe = (q: string, params?: unknown[]) => engine.unsafe(q, params ?? [])
  sql.query = createQueryBuilder(sql, async (q) => engine.executeQuery(q) as unknown as Row[])
  sql.raw = (strings: TemplateStringsArray, ...values: unknown[]) => rawSqlImpl(strings, values)
  sql.close = () => engine.close()
  return sql
}

/** raw 标签模板（值按 $n 顺序参数化） */
function rawSqlImpl(strings: TemplateStringsArray, values: unknown[]): RawSql {
  const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ''), '')
  return { __raw: text, params: values }
}

// ── SQL 子集解析 ─────────────────────────────────────────

function parseSQL(sql: string, params: unknown[]): Statement {
  const s = sql.trim().replace(/;$/, '')
  const upper = s.toUpperCase()

  // INSERT INTO t (c1, c2) VALUES ($1, $2) [RETURNING * | RETURNING col1, col2]
  const ins = /^INSERT\s+INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)(\s+RETURNING\s+(\*|\w+(?:\s*,\s*\w+)*))?/i.exec(s)
  if (ins) {
    const cols = ins[2].split(',').map((c) => c.trim())
    const vals = ins[3].split(',').map((v) => resolveValue(v.trim(), params))
    if (cols.length !== vals.length) {
      throw new ProtocolError(`memory-sql: INSERT 列数(${cols.length})与值数(${vals.length})不匹配`)
    }
    return {
      kind: 'insert',
      table: ins[1],
      cols,
      vals,
      returning: !!ins[4],
      returningCols: ins[5] && ins[5] !== '*' ? ins[5].split(',').map((c) => c.trim()) : undefined,
    }
  }

  // CREATE TABLE [IF NOT EXISTS] t (cols) / DROP TABLE [IF EXISTS] t
  // 解析列约束（PRIMARY KEY DEFAULT / UNIQUE）——约束注入表元数据（INSERT 时强制）
  const createTable = /^CREATE\s+TABLE\s+(IF\s+NOT\s+EXISTS\s+)?(\w+)\s*\(([\s\S]*)\)$/i.exec(s)
  if (createTable) {
    const constraints = parseColumnConstraints(createTable[3])
    return { kind: 'ddl' as const, table: createTable[2], constraints }
  }
  const dropTable = /^DROP\s+TABLE\s+(IF\s+EXISTS\s+)?(\w+)/i.exec(s)
  if (dropTable) {
    return { kind: 'ddl', drop: dropTable[2] }
  }
  // CREATE INDEX [IF NOT EXISTS] ... ——内存无索引语义（no-op）
  if (/^CREATE\s+INDEX/i.test(s)) {
    return { kind: 'ddl' }
  }

  // SELECT cols FROM t [alias] [WHERE ...] [LIMIT n]
  const sel = /^SELECT\s+(.+?)\s+FROM\s+(\w+)(?:\s+(\w+))?(\s+WHERE\s+(.+?))?(\s+LIMIT\s+(\d+))?$/i.exec(s)
  if (sel) {
    const fields = sel[1].trim()
    const alias = sel[3]
    // 投影列：* / COUNT(*) / 列列表（支持 alias.col → col 剥离）
    let cols: string[] | undefined
    if (fields === '*') {
      cols = undefined
    } else if (/^COUNT\s*\(\s*\*\s*\)$/i.test(fields)) {
      // COUNT(*)：返回 { count } 聚合行（真库语义）
      return { kind: 'select', table: sel[2], cols: undefined, where: sel[5] ? parseWhere(sel[5], params, alias) : undefined, limit: undefined, count: true }
    } else {
      cols = fields.split(',').map((c) => stripAlias(c.trim(), alias))
    }
    return {
      kind: 'select',
      table: sel[2],
      cols,
      where: sel[5] ? parseWhere(sel[5], params, alias) : undefined,
      limit: sel[7] ? Number(sel[7]) : undefined,
    }
  }

  // UPDATE t SET c1 = $1, c2 = $2 [WHERE ...]
  const upd = /^UPDATE\s+(\w+)\s+SET\s+(.+?)(\s+WHERE\s+(.+?))?$/i.exec(s)
  if (upd) {
    const sets = upd[2].split(',').map((part) => {
      const m = /^(\w+)\s*=\s*(.+)$/.exec(part.trim())
      if (!m) throw new ProtocolError(`memory-sql: UPDATE SET 语法无效 '${part.trim()}'`)
      return { col: m[1], val: resolveValue(m[2].trim(), params) }
    })
    return { kind: 'update', table: upd[1], sets, where: upd[4] ? parseWhere(upd[4], params) : undefined }
  }

  // DELETE FROM t [WHERE ...]
  const del = /^DELETE\s+FROM\s+(\w+)(\s+WHERE\s+(.+?))?$/i.exec(s)
  if (del) {
    return { kind: 'delete', table: del[1], where: del[3] ? parseWhere(del[3], params) : undefined }
  }

  throw new ProtocolError(`memory-sql: SQL 不支持 '${s.slice(0, 60)}...'（诚实裁剪——JOIN/ORDER BY/DDL/子查询需真库）`)
}

/** WHERE col op val [AND col op val ...]——op: = != <> > < >= <= IN；列支持 alias.col 剥离 */
function parseWhere(clause: string, params: unknown[], alias?: string): WhereClause {
  const parts = clause.split(/\s+AND\s+/i)
  const cols = parts.map((part) => {
    const p = part.trim()
    // IS NULL / IS NOT NULL（无值操作符）
    const isNull = /^(\w+(?:\.\w+)?)\s+IS\s+(NOT\s+)?NULL$/i.exec(p)
    if (isNull) {
      return { col: stripAlias(isNull[1], alias), op: isNull[2] ? 'IS NOT NULL' : 'IS NULL', val: undefined }
    }
    const m = /^(\w+(?:\.\w+)?)\s*(=|!=|<>|>=|<=|>|<|IN)\s*(.+)$/.exec(p)
    if (!m) throw new ProtocolError(`memory-sql: WHERE 语法无效 '${p}'（仅支持 = != <> > < >= <= IN + AND + IS NULL）`)
    const col = stripAlias(m[1], alias)
    const op = m[2].toUpperCase()
    const raw = m[3].trim()
    if (op === 'IN') {
      const inMatch = /^\(([^)]+)\)$/.exec(raw)
      if (!inMatch) throw new ProtocolError(`memory-sql: IN 需要 (v1, v2, ...) 形式`)
      const vals = inMatch[1].split(',').map((v) => resolveValue(v.trim(), params))
      return { col, op, val: vals }
    }
    return { col, op, val: resolveValue(raw, params) }
  })
  return { cols }
}

/** 剥离表别名前缀：'s.user_id' + alias 's' → 'user_id'；无别名原样 */
function stripAlias(ref: string, alias?: string): string {
  const dot = ref.indexOf('.')
  if (dot >= 0) return ref.slice(dot + 1)
  return ref
}

/** 解析 CREATE TABLE 列定义 → 约束（pk + uniques） */
function parseColumnConstraints(colsSql: string): { pk?: { col: string; defaultUuid: boolean }; uniques: string[] } {
  const result: { pk?: { col: string; defaultUuid: boolean }; uniques: string[] } = { uniques: [] }
  // 逐列解析（简单分割：列定义逗号分隔——不含括号内逗号）
  const cols = splitTopLevel(colsSql)
  for (const colDef of cols) {
    const m = /^(\w+)\s+([\w\s(),.]+)$/.exec(colDef.trim())
    if (!m) continue
    const col = m[1]
    const def = m[2].toUpperCase()
    if (/\bPRIMARY\s+KEY\b/.test(def)) {
      result.pk = { col, defaultUuid: /GEN_RANDOM_UUID/.test(def) }
    }
    if (/\bUNIQUE\b/.test(def)) result.uniques.push(col)
  }
  return result
}

/** 顶层逗号分割（忽略括号内） */
function splitTopLevel(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '(') depth++
    if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out
}

/** $n → params[n-1]；字面量 → 解析（数字/字符串/布尔/null） */
function resolveValue(raw: string, params: unknown[]): unknown {
  const ph = /^\$(\d+)$/.exec(raw)
  if (ph) {
    const idx = Number(ph[1]) - 1
    if (idx < 0 || idx >= params.length) {
      throw new ProtocolError(`memory-sql: 参数 $${ph[1]} 越界（仅 ${params.length} 个）`)
    }
    return params[idx]
  }
  if (/^'([^']*)'$/.test(raw)) return raw.slice(1, -1)
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw)
  if (raw.toUpperCase() === 'NULL') return null
  if (raw.toUpperCase() === 'TRUE') return true
  if (raw.toUpperCase() === 'FALSE') return false
  // SQL 函数：now() → 当前时间戳（userSystem revoked_at 等）
  if (/^now\(\)$/i.test(raw)) return new Date().toISOString()
  // 未知字面量（列引用/函数等）——诚实裁剪
  throw new ProtocolError(`memory-sql: 不支持的字面量 '${raw}'（请用 $n 参数）`)
}

/** 投影：行 → 指定列子集 */
function pick(row: Row, cols: string[]): Row {
  const out: Row = {}
  for (const c of cols) if (c in row) out[c] = row[c]
  return out
}

/** 从行解析列引用（支持 alias.col 与裸列） */
function resolveCol(row: Row, ref: string, _alias?: string): unknown {
  if (ref in row) return row[ref]
  const dot = ref.indexOf('.')
  if (dot >= 0) return row[ref]
  for (const [k, v] of Object.entries(row)) {
    const bare = k.slice(k.indexOf('.') + 1)
    if (bare === ref) return v
  }
  return undefined
}

function stripTable(col: string): string {
  const dot = col.lastIndexOf('.')
  return dot >= 0 ? col.slice(dot + 1) : col
}

function unqualified(row: Row): Row {
  const out: Row = {}
  for (const [k, v] of Object.entries(row)) out[stripTable(k)] = v
  return out
}

function isRaw(v: unknown): v is RawSql {
  return typeof v === 'object' && v !== null && '__raw' in v
}

/** WhereExpr（query language）→ 行判定 */
function matchWhereExpr(row: Row, expr: WhereExpr, alias?: string): boolean {
  for (const [col, field] of Object.entries(expr)) {
    if (col === 'or') {
      const ors = field as WhereExpr[]
      if (!ors.some((o) => matchWhereExpr(row, o, alias))) return false
      continue
    }
    if (Array.isArray(field)) {
      // IN 列表
      const actual = resolveCol(row, col, alias)
      if (!(field as unknown[]).some((v) => deepEq(actual, v))) return false
      continue
    }
    if (isRaw(field)) {
      throw new ProtocolError('memory-sql: raw WHERE 不支持（诚实裁剪——用真库）')
    }
    if (typeof field === 'object' && field !== null) {
      const ops = field as ColOps
      const actual = resolveCol(row, col, alias)
      if (ops.col !== undefined && !deepEq(actual, resolveCol(row, ops.col, alias))) return false
      if (ops.gt !== undefined && !(Number(actual) > Number(ops.gt))) return false
      if (ops.gte !== undefined && !(Number(actual) >= Number(ops.gte))) return false
      if (ops.lt !== undefined && !(Number(actual) < Number(ops.lt))) return false
      if (ops.lte !== undefined && !(Number(actual) <= Number(ops.lte))) return false
      if (ops.ne !== undefined && deepEq(actual, ops.ne)) return false
      if (ops.in && !ops.in.some((v) => deepEq(actual, v))) return false
      if (ops.notIn && ops.notIn.some((v) => deepEq(actual, v))) return false
      if (ops.like !== undefined && !String(actual).includes(ops.like.replace(/%/g, ''))) return false
      if (ops.ilike !== undefined && !String(actual).toLowerCase().includes(ops.ilike.replace(/%/g, '').toLowerCase())) return false
      if (ops.between) {
        const [lo, hi] = ops.between
        if (!(Number(actual) >= Number(lo) && Number(actual) <= Number(hi))) return false
      }
      if (ops.isNull !== undefined && (actual === null || actual === undefined) !== ops.isNull) return false
      continue
    }
    // 标量相等
    const actual = resolveCol(row, col, alias)
    if (field === null) {
      if (actual !== null && actual !== undefined) return false
    } else if (!deepEq(actual, field)) {
      return false
    }
  }
  return true
}

function matchWhere(row: Row, where: WhereClause): boolean {
  return where.cols.every(({ col, op, val }) => {
    const actual = row[col]
    switch (op) {
      case 'IS NULL': return actual === null || actual === undefined
      case 'IS NOT NULL': return actual !== null && actual !== undefined
      case '=': return deepEq(actual, val)
      case '!=': case '<>': return !deepEq(actual, val)
      case '>': return Number(actual) > Number(val)
      case '<': return Number(actual) < Number(val)
      case '>=': return Number(actual) >= Number(val)
      case '<=': return Number(actual) <= Number(val)
      case 'IN': return (val as unknown[]).some((v) => deepEq(actual, v))
      default: return false
    }
  })
}

function deepEq(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}
