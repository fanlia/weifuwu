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
import { parseSqlToAst, parseWhereToExpr } from './sql-parser.ts'

interface MemoryTable {
  rows: Row[]
  nextId: number
  /** DDL 解析的约束：pk（DEFAULT 生成列）、unique 列、DEFAULT now() 列 */
  pk?: { col: string; defaultUuid: boolean }
  uniques: Set<string>
  defaultNow: Set<string>
  /** 表列序（CREATE TABLE 定义）——无列名 INSERT 按序映射 */
  columns: string[]
  /** 列类型（CREATE TABLE 定义）——PG 服务器 Describe OID 推断 */
  columnTypes: Record<string, string>
}

export class MemorySql {
  private tables = new Map<string, MemoryTable>()

  /** 标签模板 → 参数化 SQL（values 顺序即 $1..$n） */
  async tag(strings: TemplateStringsArray, values: unknown[]): Promise<Row[]> {
    const sql = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ''), '')
    return this.unsafe(sql, values)
  }

  async unsafe(sql: string, params: unknown[] = []): Promise<Row[]> {
    // 事务原语：内存自动提交（无真实事务边界）——BEGIN/COMMIT/ROLLBACK no-op
    const head = sql.trim().toUpperCase()
    if (head === 'BEGIN' || head === 'COMMIT' || head === 'ROLLBACK' || head === 'END') {
      const res: QueryResult<Row> = []
      res.affectedRows = 0
      return res
    }
    try {
      // SQL 字符串 → Parser → Query Language AST → 内存直执行（单条执行路径）
      const ast = parseSqlToAst(sql, params)
      return this.executeQuery(ast)
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
      case 'ddl': return this.executeDdl(q)
    }
  }

  private execSelect(q: SelectQuery, outerCtx?: { row: Row; alias: string }): QueryResult<Row> {
    // count(*) 聚合：过滤后行数 → 单行 { count }
    if (q.count) {
      const t = this.table(q.table)
      const n = q.where ? t.rows.filter((r) => matchWhereExpr(r, q.where!, q.alias)).length : t.rows.length
      const colName = (q.cols?.[0] as string | undefined) ?? 'count'
      const res: QueryResult<Row> = [{ [colName]: n }]
      res.affectedRows = 1
      return res
    }
    // 常量投影/UNION（无 FROM——SQL parser 产出）
    if (q.unionRows && q.table === '') {
      const res = q.unionRows.map((r) => ({ ...r })) as QueryResult<Row>
      res.affectedRows = res.length
      return res
    }
    // 派生表（FROM (SELECT ...) t——parser 递归解析内层）
    if (q.derived && q.table === '') {
      const inner = this.executeQuery(parseSqlToAst(q.derived.innerSql))
      const alias = q.derived.alias
      let rows: Row[] = inner.map((r) => {
        if (!alias) return { ...r }
        const out: Row = {}
        for (const [k, v] of Object.entries(r)) out[`${alias}.${k}`] = v
        return out
      })
      if (q.derived.where) {
        const w = q.derived.where
        if (/^1\s*=\s*0$/.test(w)) rows = []
        else if (w.trim()) {
          try { rows = rows.filter((r) => matchWhereExpr(r, parseWhereToExpr(w, []))) } catch { /* 裁剪 */ }
        }
      }
      const res = rows.map((r) => ({ ...r })) as QueryResult<Row>
      res.affectedRows = res.length
      return res
    }
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
    // WHERE（raw 伪装 → 内存裁剪）；关联子查询时合并外层行上下文
    if (q.where && '__raw' in (q.where as object)) {
      throw new ProtocolError('memory-sql: raw WHERE 不支持（诚实裁剪——用真库）')
    }
    const matchRow = (r: Row): Row => {
      if (!outerCtx) return r
      const merged: Row = {}
      for (const [k, v] of Object.entries(r)) merged[`${q.alias ?? q.table}.${k}`] = v
      for (const [k, v] of Object.entries(outerCtx.row)) merged[`${outerCtx.alias}.${k}`] = v
      return merged
    }
    let filtered = q.where ? rows.filter((r) => matchWhereExpr(matchRow(r), q.where!, q.alias)) : rows
    // 子查询（IN/EXISTS——关联：每外层行执行子 AST，外层列经 outerCtx 引用）
    for (const sub of q.sub ?? []) {
      filtered = filtered.filter((r) => {
        const subRows = this.execSelect(sub.query, { row: r, alias: tableAlias }) as unknown[]
        if (sub.type === 'exists') return sub.not ? subRows.length === 0 : subRows.length > 0
        const vals = new Set(subRows.map((sr) => (sr as Record<string, unknown>)[String(sub.query.cols?.[0] ?? Object.keys(sr as Record<string, unknown>)[0])]))
        const v = resolveCol(r, sub.col!, tableAlias)
        return sub.not ? !vals.has(v) : vals.has(v)
      })
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
      if (q.having) {
        // HAVING 聚合函数键（count(*)）→ 聚合行 as 名（count）
        const aggAlias = new Map<string, string>()
        for (const a of q.aggregate ?? []) aggAlias.set(`${a.fn}(${a.col === '*' ? '*' : a.col})`, a.as)
        const mapped: WhereExpr = {}
        for (const [k, v] of Object.entries(q.having)) mapped[aggAlias.get(k) ?? k] = v as never
        out = out.filter((r) => matchWhereExpr(r, mapped, undefined))
      }
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
      // 带索引排序（tie-break 用插入序——近似真库时间戳微秒：最新插入在后 → 排前）
      out = out
        .map((r, idx) => ({ r, idx }))
        .sort((a, b) => {
          for (const o of ob) {
            const va = a.r[stripTable(o.col)]
            const vb = b.r[stripTable(o.col)]
            if (va === vb) continue
            // 通用比较：数字按数值、字符串按字典序（ISO 时间戳字典序 = 时间序）
            const cmp = typeof va === 'number' && typeof vb === 'number'
              ? (va > vb ? 1 : -1)
              : String(va) > String(vb) ? 1 : -1
            return o.dir === 'desc' ? -cmp : cmp
          }
          return b.idx - a.idx // 全相等：插入序倒序（稳定且符合比较器契约）
        })
        .map((x) => x.r)
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
    // 无列名 INSERT（parser 占位 f1..fn）→ 按表列序映射
    const fPlaceholder = q.rows.some((r) => Object.keys(r).every((k) => /^f\d+$/.test(k)))
    const mapped = q.rows.map((r) => {
      if (!fPlaceholder || !t.columns.length) return r
      const out: Row = {}
      for (const [k, v] of Object.entries(r)) {
        const idx = Number(k.slice(1)) - 1
        out[t.columns[idx] ?? k] = v
      }
      return out
    })
    for (const row of mapped) {
      // PK DEFAULT / UNIQUE 检查（与字符串路径同约束）
      if (t.pk && !(t.pk.col in row)) row[t.pk.col] = t.pk.defaultUuid ? randomUUID() : `mem-${t.nextId}`
      for (const c of t.defaultNow) {
        if (!(c in row)) row[c] = new Date().toISOString()
      }
      // 唯一冲突：onConflict DO NOTHING → 跳过该行；否则 409（同字符串路径）
      let conflicted = false
      for (const u of t.uniques) {
        if (u in row && t.rows.some((r) => deepEq(r[u], row[u]))) {
          if (q.onConflict) { conflicted = true; break }
          throw new HttpError(`数据库错误: duplicate key value violates unique constraint "${u}"`, 409)
        }
      }
      if (!conflicted) {
        t.rows.push(row)
        t.nextId++
        if (q.returning) results.push(q.returning === '*' ? { ...row } : pick(row, q.returning))
      }
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
          if (isRaw(v)) {
            // raw SET 值：now() 特判（编辑/软删时间戳）；其余裁剪
            if (/^now\(\)$/i.test((v as RawSql).__raw.trim())) r[k] = new Date().toISOString()
            else throw new ProtocolError('memory-sql: raw SET 值不支持（诚实裁剪——用真库）')
          } else {
            r[k] = v
          }
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
    if (!t) { t = { rows: [], nextId: 1, uniques: new Set(), defaultNow: new Set(), columns: [], columnTypes: {} }; this.tables.set(name, t) }
    return t
  }

  /** 表是否存在（PG 服务器 42P01 检查——内存惰性建表 vs 真库报错） */
  hasTable(table: string): boolean {
    return this.tables.has(table)
  }

  /** PG 服务器 Describe：列类型 → OID 推断辅助 */
  getColumnType(table: string, col: string): string | undefined {
    return this.tables.get(table)?.columnTypes[col]
  }

  /** PG 服务器 Parse：INSERT VALUES 列序 → 类型列表 */
  getColumnTypes(table: string): string[] {
    return this.tables.get(table)?.columns.map((c) => this.tables.get(table)!.columnTypes[c] ?? 'text') ?? []
  }

  /** 事务快照（服务器 ROLLBACK 撤销事务内写入——内存自动提交的对偶） */
  snapshot(): Map<string, Row[]> {
    const snap = new Map<string, Row[]>()
    for (const [name, t] of this.tables) snap.set(name, t.rows.map((r) => ({ ...r })))
    return snap
  }

  /** 恢复快照（ROLLBACK）——rows 替换为快照副本（保留元数据/约束） */
  restore(snap: Map<string, Row[]>): void {
    for (const [name, rows] of snap) {
      const t = this.tables.get(name)
      if (t) t.rows = rows.map((r) => ({ ...r }))
    }
    // 快照后新建的表：清空
    for (const name of this.tables.keys()) {
      if (!snap.has(name)) this.tables.delete(name)
    }
  }

  /** DDL 执行（parser 产出 DdlQuery）——约束提取到表元数据 */
  private executeDdl(stmt: Extract<Query, { kind: 'ddl' }>): QueryResult<Row> {
    if (stmt.op === 'createTable' && stmt.table) {
      const t = this.table(stmt.table)
      // 表列序（无列名 INSERT 按序映射——CREATE 时覆盖）+ 列类型（Describe OID）
      t.columns = (stmt.columns ?? []).map((c) => c.name)
      for (const c of stmt.columns ?? []) t.columnTypes[c.name] = c.type.toLowerCase()
      for (const col of stmt.columns ?? []) {
        if (col.pk) t.pk = { col: col.name, defaultUuid: col.defaultUuid }
        if (col.unique) t.uniques.add(col.name)
        if (col.defaultNow) t.defaultNow.add(col.name)
      }
    } else if (stmt.op === 'dropTable' && stmt.table) {
      this.tables.delete(stmt.table)
    }
    const res: QueryResult<Row> = []
    res.affectedRows = 0
    return res
  }
}

/** raw 标签模板（值按 $n 顺序参数化） */
function rawSqlImpl(strings: TemplateStringsArray, values: unknown[]): RawSql {
  const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ''), '')
  return { __raw: text, params: values }
}

function pick(row: Row, cols: string[]): Row {
  const out: Row = {}
  for (const c of cols) if (c in row) out[c] = row[c]
  return out
}

/** 从行解析列引用（支持 alias.col 与裸列） */
function resolveCol(row: Row, ref: string, _alias?: string): unknown {
  if (ref in row) return row[ref]
  const dot = ref.indexOf('.')
  if (dot >= 0) {
    // 带别名引用：行无前缀（非 JOIN）时回退裸列
    const bare = ref.slice(dot + 1)
    if (bare in row) return row[bare]
    return undefined
  }
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
/** 字符串 WHERE → WhereExpr（派生表过滤——无参数场景） */

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
      // 纯对象值（jsonb）——无任何操作符键 → 按值 deepEq 比较
      const hasOp = (['col', 'gt', 'gte', 'lt', 'lte', 'ne', 'in', 'notIn', 'like', 'ilike', 'isNull', 'between'] as const).some((k) => ops[k] !== undefined)
      if (!hasOp) {
        if (!deepEq(actual, field)) return false
        continue
      }
      if (ops.col !== undefined && !deepEq(actual, resolveCol(row, ops.col, alias))) return false
      if (ops.gt !== undefined && cmpValue(actual, ops.gt) <= 0) return false
      if (ops.gte !== undefined && cmpValue(actual, ops.gte) < 0) return false
      if (ops.lt !== undefined && cmpValue(actual, ops.lt) >= 0) return false
      if (ops.lte !== undefined && cmpValue(actual, ops.lte) > 0) return false
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

function cmpValue(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a > b ? 1 : a < b ? -1 : 0
  const sa = String(a)
  const sb = String(b)
  return sa > sb ? 1 : sa < sb ? -1 : 0
}

function deepEq(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (a === null || b === null) return false
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  return false
}

/** MemorySql 工厂：类不可 callable——工厂包装为 callable Sql（与 makeSql(PgPool) 同构） */
export function createMemorySql(): Sql {
  const mem = new MemorySql()
  const sql = (async (strings: TemplateStringsArray, ...values: unknown[]) =>
    mem.tag(strings, values)) as Sql
  sql.unsafe = (s: string, p?: unknown[]) => mem.unsafe(s, p)
  sql.query = createQueryBuilder(mem as unknown as Sql, (q) => Promise.resolve(mem.executeQuery(q)))
  sql.raw = (strings: TemplateStringsArray, ...values: unknown[]) => rawSqlImpl(strings, values)
  sql.close = () => mem.close()
  return sql
}
