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
import { ProtocolError, ValidationError } from './errors.ts'
import type { Row, QueryResult } from './contracts.ts'

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

/** 算子值标量（列条件值——不允许裸标量/数组/null 形态直接做 WhereField） */
export type WhereScalar = string | number | boolean | null

/**
 * 列级条件操作符（唯一形态——算子模式）：列 = 算子对象。
 * 约定（2027-10 表达清理）：值形态不再接受标量/数组/null——等值用 `{ eq: v }`·
 * IN 用 `{ in: [...] }`·NULL 判定用 `{ isNull: true/false }`——语义显式无歧义
 * （旧歧义：数组既是 IN 又是 jsonb 数组值；`= NULL` 恒假 vs 内存判 true）。
 */
export interface ColOps {
  /** 列引用（非字面量）：`{ 'u.email': { col: 'o.user_id' } }` → u.email = o.user_id */
  col?: string
  /** 等值 */
  eq?: WhereScalar
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

/** 算子键集（jsonb 深度等值判定：无任一算子键的对象 → 按值深度比较） */
export const COL_OPS_KEYS = ['col', 'eq', 'gt', 'gte', 'lt', 'lte', 'ne', 'in', 'notIn', 'like', 'ilike', 'isNull', 'between'] as const

/** 列条件值（唯一形态）：算子对象 | 表达式片段 | jsonb 值对象（无算子键——深度等值） */
export type WhereField = ColOps | RawSql | Record<string, unknown>


/**
 * WHERE 表达式：列条件 AND 连接。
 * 结构键：`or: WhereExpr[]`（OR 组——组间 AND）、`and: WhereExpr[]`（AND 组——
 * where 合并不可对象级合并时包装——AND 语义不丢）。
 */
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
  aggregate?: { fn: 'count' | 'sum' | 'avg' | 'min' | 'max'; col: string; as: string; filter?: WhereExpr }[]
  /** count(*) 聚合（SQL parser 产出——SELECT count(*) FROM t）——结果为单行 { count } */
  count?: boolean
  /** pgvector 相似度排序（列投影：`1 - (col <=> vec) as as` + ORDER BY col <=> vec）——
   *  平台知识检索唯一向量面（业务零 SQL——向量为 pgvector 特化存储） */
  vector?: { col: string; vec: number[]; as: string }
  /** 内存执行扩展：常量投影/UNION 行（SQL parser 产出——无表查询） */
  unionRows?: Row[]
  /** 内存执行扩展：派生表（FROM (SELECT ...) alias——parser 产出） */
  derived?: { innerSql: string; alias?: string; where?: string }
}

export interface InsertQuery {
  kind: 'insert'
  table: string
  rows: Row[] // 一行或多行（同列）
  returning?: string[] | '*'
  /** upsert：ON CONFLICT (col) DO UPDATE SET col=EXCLUDED.col；col 省略 = 任意唯一冲突 DO NOTHING
   *  col 可为数组（复合唯一目标（department_id, agent_id）等——平台 7 处）
   *  merge：冲突列覆盖表达式（__jsonbAppend 追加 / __inc 自增 / RawSql / 标量）——
   *  jsonb `||` / hits+1 等表达更新面（业务零 SQL——经标量编码） */
  onConflict?: { col?: string | string[]; update?: boolean; merge?: Record<string, unknown> }
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

/** DDL 语句（SQL parser 产出——内存执行提取约束；真库走 raw 字符串） */
export interface DdlQuery {
  kind: 'ddl'
  op: 'createTable' | 'dropTable' | 'createIndex' | 'alter' | 'createEnum' | 'createExtension' | 'doBlock'
  table?: string
  ifNotExists?: boolean
  /** 列定义（createTable）——约束提取（PK/UNIQUE/DEFAULT now） */
  columns?: { name: string; type: string; pk: boolean; unique: boolean; defaultNow: boolean; defaultUuid: boolean; defaultVal?: unknown; constraintCols?: string[] }[]
  /** createEnum：枚举值清单 */
  enumValues?: string[]
}

export type Query = SelectQuery | InsertQuery | UpdateQuery | DeleteQuery | DdlQuery

// ── Builder（sql.query 入口） ─────────────────────────────

export interface QueryResultWithAffected<T = Row> extends Array<T> {
  affectedRows?: number
}

/** builder 链：方法返回 this；.run()/.one() 执行 */
export interface SelectBuilder<T = Row> {
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
  count(col?: string, as?: string, filter?: WhereExpr): this
  sum(col: string, as?: string, filter?: WhereExpr): this
  avg(col: string, as?: string, filter?: WhereExpr): this
  min(col: string, as?: string, filter?: WhereExpr): this
  max(col: string, as?: string, filter?: WhereExpr): this
  orderBy(col: string, dir?: 'asc' | 'desc'): this
  /** pgvector 相似度：注入投影 `1 - (col <=> vec) as as` + `ORDER BY col <=> vec`（知识检索面） */
  vectorScore(col: string, vec: number[], as: string): this
  limit(n: number): this
  offset(n: number): this
  run(): Promise<QueryResult<T>>
  one(): Promise<T | undefined>
}

export interface InsertBuilder<T = Row> {
  values(row: Row): this
  rows(rows: Row[]): this
  returning(...cols: (string | '*')[]): this
  onConflict(col?: string | string[], update?: boolean, merge?: Record<string, unknown>): this
  run(): Promise<QueryResult<T>>
}

export interface UpdateBuilder<T = Row> {
  set(sets: Row): this
  where(expr: WhereExpr): this
  whereRaw(sql: string, params?: unknown[]): this
  returning(...cols: (string | '*')[]): this
  run(): Promise<QueryResult<T>>
}

export interface DeleteBuilder<T = Row> {
  where(expr: WhereExpr): this
  whereRaw(sql: string, params?: unknown[]): this
  returning(...cols: (string | '*')[]): this
  run(): Promise<QueryResult<T>>
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

/** WhereExpr → SQL 条件片段（AND 连接；or/and 组 → 括号） */
function compileWhere(expr: WhereExpr, params: unknown[]): string {
  const parts: string[] = []
  for (const [col, field] of Object.entries(expr)) {
    if (col === 'or') {
      const ors = field as WhereExpr[]
      parts.push(`(${ors.map((o) => compileWhere(o, params)).join(' OR ')})`)
      continue
    }
    if (col === 'and') {
      const ands = field as WhereExpr[]
      parts.push(`(${ands.map((o) => compileWhere(o, params)).join(' AND ')})`)
      continue
    }
    if (isRaw(field)) {
      parts.push(interpRaw(field, params))
      continue
    }
    if (typeof field === 'object' && field !== null) {
      const ops = field as ColOps
      const hasOp = COL_OPS_KEYS.some((k) => (ops as Record<string, unknown>)[k] !== undefined)
      if (!hasOp) {
        // jsonb 深度等值（无算子键对象——按值比较；与 memory deepEq 同语义）
        parts.push(`${col} = ${param(params, field)}`)
        continue
      }
      const opParts: [string, string][] = []
      const val = (v: unknown): string => {
        if (isRaw(v)) return interpRaw(v as RawSql, params)
        if (typeof v === 'object' && v !== null && ('__interval' in v || '__monthStart' in v)) {
          if ('__monthStart' in v) return `DATE_TRUNC('month', NOW())`
          const [n, unit] = (v as { __interval: [number, string] }).__interval
          const abs = Math.abs(n)
          return `NOW() ${n < 0 ? '-' : '+'} INTERVAL '${abs} ${unit}'`
        }
        return param(params, v)
      }
      if (ops.col !== undefined) parts.push(`${col} = ${ops.col}`) // 列引用与其余操作符可并存（AND 语义——不短路）
      if (ops.eq !== undefined) opParts.push(['=', val(ops.eq)])
      if (ops.gt !== undefined) opParts.push(['>', val(ops.gt)])
      if (ops.gte !== undefined) opParts.push(['>=', val(ops.gte)])
      if (ops.lt !== undefined) opParts.push(['<', val(ops.lt)])
      if (ops.lte !== undefined) opParts.push(['<=', val(ops.lte)])
      if (ops.ne !== undefined) opParts.push(['<>', val(ops.ne)])
      if (ops.in) opParts.push(['IN', `(${ops.in.map((v) => val(v)).join(', ')})`])
      if (ops.notIn) opParts.push(['NOT IN', `(${ops.notIn.map((v) => val(v)).join(', ')})`])
      if (ops.like !== undefined) opParts.push(['LIKE', val(ops.like)])
      if (ops.ilike !== undefined) opParts.push(['ILIKE', val(ops.ilike)])
      if (ops.between) opParts.push(['BETWEEN', `${val(ops.between[0])} AND ${val(ops.between[1])}`])
      if (ops.isNull !== undefined) opParts.push(['IS', ops.isNull ? 'NULL' : 'NOT NULL'])
      for (const [op, rhs] of opParts) parts.push(`${col} ${op} ${rhs}`)
      continue
    }
    throw new ProtocolError(`weifuwu/db: WHERE 列 ${col} 值必须为算子对象（{ eq: v } / { in: [...] } / { isNull: true }——裸标量/数组/null 形态已移除）`)
  }
  return parts.join(' AND ')
}

function compileOrderBy(orderBy: SelectQuery['orderBy']): string {
  if (!orderBy?.length) return ''
  return ` ORDER BY ${orderBy.map((o) => `${o.col} ${o.dir === 'desc' ? 'DESC' : 'ASC'}`).join(', ')}`
}

/** 向量参数（$n::vector——同一参数引用（where/order 同语义——PG 参数可复用）） */
function vectorParam(qv: { col: string; vec: number[]; as: string }, params: unknown[]): string {
  const v = `[${qv.vec.join(',')}]`
  return `${param(params, v)}::vector`
}

/** 聚合投影（无 groupBy 时整表聚合）——FILTER (WHERE ...) 参数须先于后续 WHERE/HAVING
 *  编译（SQL 出现顺序决定 $n 编号——compileSelect 的 cols→agg→joins→where→having 顺序即满足） */
function compileAggregate(q: SelectQuery, params: unknown[]): string {
  if (!q.aggregate?.length) return ''
  return q.aggregate.map((a) => {
    const filt = a.filter ? ` FILTER (WHERE ${compileWhere(a.filter, params)})` : ''
    return `${a.fn.toUpperCase()}(${a.col === '*' ? '*' : a.col})${filt} AS ${a.as}`
  }).join(', ')
}

/** 编译 SELECT */
export function compileSelect(q: SelectQuery): Compiled {
  const params: unknown[] = []
  const cols =
    (q.cols && q.cols.length
      ? q.cols.map((c) => (isRaw(c) ? interpRaw(c, params) : c)).join(', ')
      : q.aggregate?.length ? '' : '*') + (q.vector ? `, 1 - (${q.vector.col} <=> ${vectorParam(q.vector, params)}) as ${q.vector.as}` : '')
  // 聚合与投影连接（聚合-only 无前缀逗号——count 整表聚合面）
  const agg = q.aggregate?.length ? `${cols ? ', ' : ''}${compileAggregate(q, params)}` : ''
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
      const conflictCols = Array.isArray(q.onConflict.col) ? q.onConflict.col : [q.onConflict.col]
      sql += ` ON CONFLICT (${conflictCols.join(', ')})`
      if (q.onConflict.update) {
        // 非冲突列更新；单列（全冲突）场景 SET 冲突列自身（PG 合法 no-op）
        const target = new Set(conflictCols)
        const merge = q.onConflict.merge
        const updateCols = merge ? Object.keys(merge) : cols.filter((c) => !target.has(c))
        const setCols = updateCols.length ? updateCols : conflictCols
        sql += ` DO UPDATE SET ${setCols.map((c) => {
          if (merge && c in merge) return `${c} = ${compileMergeVal(c, merge[c], params, q.table)}`
          return `${c} = EXCLUDED.${c}`
        }).join(', ')}`
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

/** 编译 UPDATE —— 无 where 拒绝（防全表更新——一处防护覆盖真库/memory/gql） */
export function compileUpdate(q: UpdateQuery): Compiled {
  const params: unknown[] = []
  if (!q.where) throw new ValidationError('weifuwu/db: UPDATE 必须带 WHERE（全表更新用 orm.execute 显式）')
  const setSql = Object.entries(q.sets)
    .map(([col, v]) => `${col} = ${compileMergeVal(col, v, params, q.table)}`)
    .join(', ')
  let sql = `UPDATE ${q.table} SET ${setSql}`
  if (q.where) sql += ` WHERE ${compileWhere(q.where, params)}`
  if (q.returning) {
    const r = q.returning === '*' ? '*' : q.returning.join(', ')
    sql += ` RETURNING ${r}`
  }
  return { sql, params }
}

/** 编译 DELETE —— 无 where 拒绝（防全表误删——一处防护覆盖真库/memory/gql） */
export function compileDelete(q: DeleteQuery): Compiled {
  const params: unknown[] = []
  if (!q.where) throw new ValidationError('weifuwu/db: DELETE 必须带 WHERE（全表删除用 orm.execute 显式）')
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
    case 'ddl': throw new ProtocolError('memory-sql: DDL 不走 Query Language（用 sql.unsafe 字符串——真库直接执行）')
  }
}

// ── WHERE 合并（单一实现源——builder 链式 / parser 同列共用） ──

/**
 * 同列条件对象级合并（AND 语义）。不可合并返回 null（调用方 and 包装）：
 *   ColOps × ColOps → 不相交操作符键 spread（{gt:15}+{lt:35} 并存）
 *   scalar × ColOps → { eq: scalar, ...ops }（eq 登记——编译/执行双端认识）
 *   数组（IN）/ raw / scalar × scalar / 同键冲突 / null 标量 → null
 */
export function mergeWhereField(prev: WhereField, next: WhereField): WhereField | null {
  if (isRaw(prev) || isRaw(next)) return null
  if (typeof prev !== 'object' || prev === null || typeof next !== 'object' || next === null) return null
  const a = prev as ColOps
  const b = next as ColOps
  const hasOpA = (COL_OPS_KEYS as readonly string[]).some((k) => Object.hasOwn(a, k))
  const hasOpB = (COL_OPS_KEYS as readonly string[]).some((k) => Object.hasOwn(b, k))
  // 算子化（唯一形态）：仅算子对象合并（不同键 AND 并存）；jsonb 深等对象不合并
  // （合并会联合比较目标——语义漂移——AND 包装保真）· 算子×jsonb 不合并
  if (!hasOpA || !hasOpB) return null
  for (const k of Object.keys(b)) if (Object.hasOwn(a, k)) return null
  return { ...a, ...b } as ColOps
}

/**
 * 向 WhereExpr 追加同列条件（AND 语义）。不可对象级合并 → and 包装
 * （既有条件保留 + 新条件入 and 组——不覆盖不静默丢弃）。
 */
export function addWhereCond(expr: WhereExpr, col: string, field: WhereField): void {
  if (col === 'and' && Array.isArray(field)) {
    expr.and = [...((expr.and as WhereExpr[] | undefined) ?? []), ...(field as unknown as WhereExpr[])]
    return
  }
  if (!(col in expr)) {
    expr[col] = field
    return
  }
  const merged = mergeWhereField(expr[col] as WhereField, field)
  if (merged !== null) {
    expr[col] = merged
    return
  }
  expr.and = [...((expr.and as WhereExpr[] | undefined) ?? []), { [col]: field } as WhereExpr]
}

/** where 表达式合并（builder 链式追加——AND 语义，不覆盖） */
export function mergeWhere(prev: WhereExpr, next: WhereExpr): WhereExpr {
  const out: WhereExpr = { ...prev }
  for (const [col, field] of Object.entries(next)) {
    if (col === 'or' && out.or !== undefined && Array.isArray(field)) {
      // or 组不可平铺合并（(A OR B) AND (C OR D) ≠ A OR B OR C OR D）——and 包装保语义
      out.and = [...((out.and as WhereExpr[] | undefined) ?? []), { or: field as unknown as WhereExpr[] } as WhereExpr]
      continue
    }
    addWhereCond(out, col, field as WhereField)
  }
  return out
}

// ── 内部工具 ──────────────────────────────────────────────

function isRaw(v: unknown): v is RawSql {
  return typeof v === 'object' && v !== null && '__raw' in v
}

/** update/upsert merge 表达式编译（__jsonbAppend/__inc 标量编码——业务零 SQL） */
export function compileMergeVal(col: string, v: unknown, params: unknown[], table: string): string {
  if (isRaw(v)) return interpRaw(v, params)
  if (typeof v === 'object' && v !== null) {
    if ('__jsonbAppend' in v) return `${table}.${col} || ${param(params, (v as { __jsonbAppend: unknown }).__jsonbAppend)}::jsonb`
    if ('__inc' in v) return `${col} + ${Number((v as { __inc: unknown }).__inc) || 1}`
    if ('__now' in v) return 'NOW()'
    if ('__interval' in v) {
      const [n, unit] = (v as { __interval: [number, string] }).__interval
      const abs = Math.abs(n)
      return `NOW() ${n < 0 ? '-' : '+'} INTERVAL '${abs} ${unit}'`
    }
    if ('__colRef' in v) return String((v as { __colRef: unknown }).__colRef)
  }
  return param(params, v)
}

/** raw 片段插值：`NOW() - interval '7 days'` + 参数 */
function interpRaw(raw: RawSql, params: unknown[]): string {
  const base = params.length
  const out = raw.__raw.replace(/\$(\d+)/g, (_m, n: string) => `$${base + Number(n)}`)
  params.push(...raw.params)
  return out
}
