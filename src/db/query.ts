/**
 * weifuwu/db — Query Language（结构化查询对象 → 双后端）
 *
 * 核心：JS 查询对象（AST）是契约的天然表示——
 *   真库：编译函数 → 参数化 SQL 字符串 → PgPool（服务器执行任意语义）
 *   内存：执行函数 → 直接操作 MemorySql 表存储（同 AST，无字符串解析）
 *
 * 两端消费同一 AST → 语义天然一致（无 SQL 子集解析器漂移）。
 *
 * 覆盖矩阵（业务事务性查询全覆盖 + raw 逃生）：
 *   ✅ SELECT（投影/DISTINCT/WHERE 全操作符/AND OR NOT/JOIN INNER LEFT/
 *      子查询 IN EXISTS 标量/GROUP BY HAVING 聚合/ORDER BY/LIMIT OFFSET）
 *   ✅ INSERT（多行/RETURNING/ON CONFLICT upsert）/ UPDATE / DELETE
 *   ⚠️ UNION / CTE / CASE / COALESCE（builder 扩展点）
 *   ❌ 窗口函数/递归 CTE/LATERAL/MERGE/DDL → raw 逃生（真库透传/内存有限）
 *
 * 内存端诚实裁剪：raw 片段与内存无法等价的语义（窗口/递归）→ ProtocolError。
 */
import type { Sql, Row, QueryResult } from './contracts.ts'

// ── RAW（逃生舱：任意 SQL 片段，真库透传 / 内存裁剪） ─────

export interface RawSql {
  __raw: string
  params: unknown[]
}

/** 逃生舱：`sql.raw\`created_at > NOW() - interval '7 days'\`` */
export function rawSql(sql: string, params: unknown[] = []): RawSql {
  return { __raw: sql, params }
}

// ── WHERE DSL（对象条件 → 判定/编译） ─────────────────────

export type WhereScalar = string | number | boolean | null

/** 列级条件操作符 */
export interface ColOps {
  /** 列引用（非字面量）：`{ 'u.email': { col: 'o.user_id' } }` → u.email = o.user_id */
  col?: string
  gt?: WhereScalar
  gte?: WhereScalar
  lt?: WhereScalar
  lte?: WhereScalar
  ne?: WhereScalar
  /** IN 列表 */
  in?: WhereScalar[]
  notIn?: WhereScalar[]
  like?: string
  ilike?: string
  isNull?: boolean
  between?: [WhereScalar, WhereScalar]
}

export type WhereField = WhereScalar | WhereScalar[] | RawSql | ColOps

export interface WhereExpr {
  [col: string]: WhereField | WhereExpr[]
}
/** OR 组：{ or: [ {a:1}, {b:2} ] } */
export interface OrExpr extends WhereExpr {
  or: WhereExpr[]
}

// ── AST ───────────────────────────────────────────────────

export interface JoinClause {
  table: string
  alias?: string
  type: 'inner' | 'left'
  /** on 条件：对象 DSL（列引用用 `alias.col`）或 raw */
  on: WhereExpr | RawSql
}

export interface SelectQuery {
  kind: 'select'
  table: string
  alias?: string
  /** 投影列：'*' 默认；支持 'alias.col' 与 raw */
  cols?: (string | RawSql)[]
  distinct?: boolean
  where?: WhereExpr
  joins?: JoinClause[]
  /** IN/EXISTS 子查询（关联列：子 where 内用 `alias.col` 引用外层） */
  sub?: { type: 'in' | 'exists' | 'notIn'; col?: string; query: SelectQuery; not?: boolean }[]
  groupBy?: string[]
  having?: WhereExpr
  orderBy?: { col: string; dir: 'asc' | 'desc' }[]
  limit?: number
  offset?: number
  /** COUNT/SUM 等聚合投影（groupBy 时自动聚合模式） */
  aggregate?: { fn: 'count' | 'sum' | 'avg' | 'min' | 'max'; col: string; as: string }[]
}

export interface InsertQuery {
  kind: 'insert'
  table: string
  rows: Row[] // 一行或多行（同列）
  returning?: string[] | '*'
  /** upsert：ON CONFLICT (col) DO UPDATE SET col=EXCLUDED.col；col 省略 = 任意唯一冲突 DO NOTHING */
  onConflict?: { col?: string; update?: boolean }
}

export interface UpdateQuery {
  kind: 'update'
  table: string
  sets: Row
  where?: WhereExpr
  returning?: string[] | '*'
}

export interface DeleteQuery {
  kind: 'delete'
  table: string
  where?: WhereExpr
  returning?: string[] | '*'
}

export type Query = SelectQuery | InsertQuery | UpdateQuery | DeleteQuery

// ── Builder（sql.query 入口） ─────────────────────────────

export interface QueryResultWithAffected<T = Row> extends Array<T> {
  affectedRows?: number
}

/** builder 链：方法返回 this；.run()/.one() 执行 */
export interface SelectBuilder {
  distinct(): this
  select(...cols: (string | RawSql)[]): this
  join(table: string, on: JoinClause['on'], opts?: { alias?: string; type?: 'inner' | 'left' }): this
  where(expr: WhereExpr): this
  whereRaw(sql: string, params?: unknown[]): this
  /** IN/EXISTS 子查询 */
  in(col: string, query: SelectQuery, not?: boolean): this
  exists(query: SelectQuery, not?: boolean): this
  groupBy(...cols: string[]): this
  having(expr: WhereExpr): this
  count(col?: string, as?: string): this
  sum(col: string, as?: string): this
  orderBy(col: string, dir?: 'asc' | 'desc'): this
  limit(n: number): this
  offset(n: number): this
  run(): Promise<QueryResult<Row>>
  one(): Promise<Row | undefined>
}

export interface InsertBuilder {
  values(row: Row): this
  rows(rows: Row[]): this
  returning(...cols: (string | '*')[]): this
  onConflict(col?: string, update?: boolean): this
  run(): Promise<QueryResult<Row>>
}

export interface UpdateBuilder {
  set(sets: Row): this
  where(expr: WhereExpr): this
  whereRaw(sql: string, params?: unknown[]): this
  returning(...cols: (string | '*')[]): this
  run(): Promise<QueryResult<Row>>
}

export interface DeleteBuilder {
  where(expr: WhereExpr): this
  whereRaw(sql: string, params?: unknown[]): this
  returning(...cols: (string | '*')[]): this
  run(): Promise<QueryResult<Row>>
}

export interface QueryBuilder {
  from(table: string, alias?: string): SelectBuilder
  insert(table: string): InsertBuilder
  update(table: string): UpdateBuilder
  delete(table: string): DeleteBuilder
}

// ── 编译（AST → 参数化 SQL）───────────────────────────────

interface Compiled {
  sql: string
  params: unknown[]
}

/** 值 → 参数占位（递归展开数组？不——数组参数按单个 $n 传入，PG 数组） */
function param(params: unknown[], v: unknown): string {
  params.push(v)
  return `$${params.length}`
}

/** WhereExpr → SQL 条件片段（AND 连接；or 组 → 括号 OR） */
function compileWhere(expr: WhereExpr, params: unknown[]): string {
  const parts: string[] = []
  for (const [col, field] of Object.entries(expr)) {
    if (col === 'or') {
      const ors = field as WhereExpr[]
      parts.push(`(${ors.map((o) => compileWhere(o, params)).join(' OR ')})`)
      continue
    }
    if (Array.isArray(field) && !isColOps(field)) {
      // IN 列表（字面数组值）
      const list = field as WhereScalar[]
      parts.push(`${col} IN (${list.map((v) => param(params, v)).join(', ')})`)
      continue
    }
    if (isRaw(field)) {
      parts.push(interpRaw(field, params))
      continue
    }
    if (isColOps(field)) {
      const ops: [string, string][] = []
      if (field.col !== undefined) {
        parts.push(`${col} = ${field.col}`)
        continue
      }
      if (field.gt !== undefined) ops.push(['>', param(params, field.gt)])
      if (field.gte !== undefined) ops.push(['>=', param(params, field.gte)])
      if (field.lt !== undefined) ops.push(['<', param(params, field.lt)])
      if (field.lte !== undefined) ops.push(['<=', param(params, field.lte)])
      if (field.ne !== undefined) ops.push(['<>', param(params, field.ne)])
      if (field.in) ops.push(['IN', `(${field.in.map((v) => param(params, v)).join(', ')})`])
      if (field.notIn) ops.push(['NOT IN', `(${field.notIn.map((v) => param(params, v)).join(', ')})`])
      if (field.like !== undefined) ops.push(['LIKE', param(params, field.like)])
      if (field.ilike !== undefined) ops.push(['ILIKE', param(params, field.ilike)])
      if (field.between) ops.push(['BETWEEN', `${param(params, field.between[0])} AND ${param(params, field.between[1])}`])
      if (field.isNull !== undefined) ops.push(['IS', field.isNull ? 'NULL' : 'NOT NULL'])
      for (const [op, rhs] of ops) parts.push(`${col} ${op} ${rhs}`)
      continue
    }
    // 标量相等（聚合函数键如 count(*) 直接表达式——HAVING 场景）
    if (field === null) parts.push(`${col} IS NULL`)
    else parts.push(`${col} = ${param(params, field)}`)
  }
  return parts.join(' AND ')
}

function compileOrderBy(orderBy: SelectQuery['orderBy']): string {
  if (!orderBy?.length) return ''
  return ` ORDER BY ${orderBy.map((o) => `${o.col} ${o.dir === 'desc' ? 'DESC' : 'ASC'}`).join(', ')}`
}

/** 聚合投影（无 groupBy 时整表聚合） */
function compileAggregate(q: SelectQuery, params: unknown[]): string {
  if (!q.aggregate?.length) return ''
  return q.aggregate.map((a) => `${a.fn.toUpperCase()}(${a.col === '*' ? '*' : a.col}) AS ${a.as}`).join(', ')
}

/** 编译 SELECT */
export function compileSelect(q: SelectQuery): Compiled {
  const params: unknown[] = []
  const agg = q.aggregate?.length ? `, ${compileAggregate(q, params)}` : ''
  const cols =
    q.cols && q.cols.length
      ? q.cols.map((c) => (isRaw(c) ? interpRaw(c, params) : c)).join(', ')
      : '*'
  const distinct = q.distinct ? 'DISTINCT ' : ''
  let sql = `SELECT ${distinct}${cols}${agg} FROM ${q.table}${q.alias ? ` ${q.alias}` : ''}`
  for (const j of q.joins ?? []) {
    const on = isRaw(j.on) ? interpRaw(j.on, params) : compileWhere(j.on, params)
    sql += ` ${j.type === 'left' ? 'LEFT JOIN' : 'JOIN'} ${j.table}${j.alias ? ` ${j.alias}` : ''} ON ${on}`
  }
  if (q.where) sql += ` WHERE ${compileWhere(q.where, params)}`
  for (const s of q.sub ?? []) {
    const sub = compileSelect(s.query)
    // 子查询参数重编号（base offset——子查询内部 $n 独立，映射到全局参数数组）
    const base = params.length + 1
    const subSql = sub.sql.replace(/\$(\d+)/g, (_m, n: string) => `$${base + Number(n) - 1}`)
    params.push(...sub.params)
    const op = s.type === 'exists' ? (s.not ? 'NOT EXISTS' : 'EXISTS') : s.not ? 'NOT IN' : 'IN'
    if (s.type === 'exists') {
      sql += ` AND ${op} (${subSql})`
    } else {
      sql += ` AND ${s.col} ${op} (${subSql})`
    }
  }
  if (q.groupBy?.length) sql += ` GROUP BY ${q.groupBy.join(', ')}`
  if (q.having) sql += ` HAVING ${compileWhere(q.having, params)}`
  sql += compileOrderBy(q.orderBy)
  if (q.limit !== undefined) sql += ` LIMIT ${param(params, q.limit)}`
  if (q.offset !== undefined) sql += ` OFFSET ${param(params, q.offset)}`
  return { sql, params }
}

/** 编译 INSERT（多行 + RETURNING + ON CONFLICT） */
export function compileInsert(q: InsertQuery): Compiled {
  const params: unknown[] = []
  const cols = Object.keys(q.rows[0])
  const colSql = cols.join(', ')
  const valueRows = q.rows.map((r) => `(${cols.map((c) => param(params, r[c])).join(', ')})`)
  let sql = `INSERT INTO ${q.table} (${colSql}) VALUES ${valueRows.join(', ')}`
  if (q.onConflict) {
    if (q.onConflict.col) {
      sql += ` ON CONFLICT (${q.onConflict.col})`
      if (q.onConflict.update) {
        // 非冲突列更新；单列（全冲突）场景 SET 冲突列自身（PG 合法 no-op）
        const updateCols = cols.filter((c) => c !== q.onConflict!.col)
        const setCols = updateCols.length ? updateCols : [q.onConflict!.col]
        sql += ` DO UPDATE SET ${setCols.map((c) => `${c} = EXCLUDED.${c}`).join(', ')}`
      } else {
        sql += ' DO NOTHING'
      }
    } else {
      // 无目标列：任意唯一冲突跳过（原 unsafe `ON CONFLICT DO NOTHING` 语义）
      sql += ' ON CONFLICT DO NOTHING'
    }
  }
  if (q.returning) {
    const r = q.returning === '*' ? '*' : q.returning.join(', ')
    sql += ` RETURNING ${r}`
  }
  return { sql, params }
}

/** 编译 UPDATE */
export function compileUpdate(q: UpdateQuery): Compiled {
  const params: unknown[] = []
  const setSql = Object.entries(q.sets)
    .map(([col, v]) => (isRaw(v) ? `${col} = ${interpRaw(v, params)}` : `${col} = ${param(params, v)}`))
    .join(', ')
  let sql = `UPDATE ${q.table} SET ${setSql}`
  if (q.where) sql += ` WHERE ${compileWhere(q.where, params)}`
  if (q.returning) {
    const r = q.returning === '*' ? '*' : q.returning.join(', ')
    sql += ` RETURNING ${r}`
  }
  return { sql, params }
}

/** 编译 DELETE */
export function compileDelete(q: DeleteQuery): Compiled {
  const params: unknown[] = []
  let sql = `DELETE FROM ${q.table}`
  if (q.where) sql += ` WHERE ${compileWhere(q.where, params)}`
  if (q.returning) {
    const r = q.returning === '*' ? '*' : q.returning.join(', ')
    sql += ` RETURNING ${r}`
  }
  return { sql, params }
}

/** 统一编译入口 */
export function compileQuery(q: Query): Compiled {
  switch (q.kind) {
    case 'select': return compileSelect(q)
    case 'insert': return compileInsert(q)
    case 'update': return compileUpdate(q)
    case 'delete': return compileDelete(q)
  }
}

// ── 内部工具 ──────────────────────────────────────────────

function isRaw(v: unknown): v is RawSql {
  return typeof v === 'object' && v !== null && '__raw' in v
}

function isColOps(v: unknown): v is ColOps {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && !isRaw(v)
}

/** raw 片段插值：`NOW() - interval '7 days'` + 参数 */
function interpRaw(raw: RawSql, params: unknown[]): string {
  const base = params.length
  const out = raw.__raw.replace(/\$(\d+)/g, (_m, n: string) => `$${base + Number(n)}`)
  params.push(...raw.params)
  return out
}
