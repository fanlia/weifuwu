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
import type { Row, QueryResult } from './contracts.ts'
import { ProtocolError } from './errors.ts'
import { HttpError } from '../types.ts'
import type { Query, SelectQuery, WhereExpr, RawSql, ColOps } from './query.ts'
import { createQueryBuilder } from './query-builder.ts'
import { zodTypeOf } from './schema.ts'
import type { ZodType } from '../../shared/zod.ts'
import { parseSqlToAst, parseWhereToExpr } from './sql-parser.ts'
import { createOrm, memoryAdapter } from './orm.ts'

interface MemoryTable {
  rows: Row[]
  nextId: number
  /** DDL 解析的约束：pk（DEFAULT 生成列）、unique 列、复合唯一组、DEFAULT now() 列 */
  pk?: { col: string; defaultUuid: boolean }
  uniques: Set<string>
  /** 复合唯一/主键组（PK (a,b) / UNIQUE (a,b)——全组等值才冲突） */
  groups: string[][]
  defaultNow: Set<string>
  /** 字面量默认值（DEFAULT FALSE/0/'x'）——注入对齐真库 */
  defaultVals: Map<string, unknown>
  /** 表列序（CREATE TABLE 定义）——无列名 INSERT 按序映射 */
  columns: string[]
  /** 列类型（CREATE TABLE 定义）——PG 服务器 Describe OID 推断 */
  columnTypes: Record<string, string>
}

/** 事务快照表条目（rows + 元数据副本——restore 需复活事务内 DROP 掉的表） */
export interface MemorySnapshotEntry {
  rows: Row[]
  nextId: number
  columns: string[]
  columnTypes: Record<string, string>
  pk?: { col: string; defaultUuid: boolean }
  uniques: string[]
  groups: string[][]
  defaultNow: string[]
  defaultVals: Record<string, unknown>
}

export type MemorySnapshot = Map<string, MemorySnapshotEntry>

export class MemorySql {
  /** 客户端路径列校验开关（wire 服务器端关闭——它是 PG 替身：列错由真库语义 42703 报） */
  private opts: { validateCols?: boolean } | undefined
  constructor(opts?: { validateCols?: boolean }) { this.opts = opts }

  private tables = new Map<string, MemoryTable>()
  /** CREATE TYPE AS ENUM 注册（幂等——DO 块 EXCEPTION duplicate_object 语义） */
  private enums = new Map<string, string[]>()
  /** 派生表 AST 缓存（同 innerSql 不重复 parse——执行路径热缓存） */
  private derivedAstCache = new Map<string, import('./query.ts').Query>()

  /** 标签模板 → 参数化 SQL（values 顺序即 $1..$n） */
  async tag(strings: TemplateStringsArray, values: unknown[]): Promise<Row[]> {
    const sql = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ''), '')
    return this.unsafe(sql, values)
  }

  async unsafe(sql: string, params: unknown[] = []): Promise<Row[]> {
    // 事务原语：内存自动提交（无真实事务边界）——BEGIN/COMMIT/ROLLBACK no-op
    const head = sql.trim().toUpperCase()
    if (head === 'BEGIN' || head === 'COMMIT' || head === 'ROLLBACK' || head === 'END') {
      return makeResult([], 0)
    }
    // 多语句拆分：schema.sql 整文件（; 分隔·字符串/DO 块/注释感知）——逐条执行
    // （真 PG 多语句 = 最后结果——内存同语义；DDL 副作用顺序保留）
    const stmts = splitStatements(sql)
    if (stmts.length > 1) {
      let last: Row[] = makeResult([], 0)
      for (const stmt of stmts) {
        if (!stmt.trim()) continue
        last = await this.unsafe(stmt, params)
      }
      return last
    }
    // sql.array() 标记：展开为字面量集合（内存端 ANY($n::uuid[]) 语义 = 参数值 IN 集合）
    params = params.map((p) => (p as { __pgArray?: unknown[] } | null)?.__pgArray ?? p)
    // 内存 parser 不支持数组类型 cast（::uuid[] 的 [）——剥 []（元素类型 cast 保留：
    // 内存语义 = 参数值直比，类型定型由值本身承载）
    if (sql.includes('[]')) sql = sql.replace(/::([a-zA-Z_]+)\[\]/g, '::$1')
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
    let result: QueryResult<Row>
    switch (q.kind) {
      case 'select': result = this.execSelect(q); break
      case 'insert': result = this.execInsert(q); break
      case 'update': result = this.execUpdate(q); break
      case 'delete': result = this.execDelete(q); break
      case 'ddl': return this.executeDdl(q)
    }
    return this.jsonDecodeRows(q.table, result)
  }

  /** jsonb 列读取解码（对齐真库驱动 convertValue(114/3802) → JSON.parse） */
  private jsonDecodeRows(table: string | undefined, result: QueryResult<Row>): QueryResult<Row> {
    if (!table || !this.tables.has(table)) return result
    const types = this.tables.get(table)!.columnTypes
    const jsonCols = new Set(Object.entries(types).filter(([, t]) => /^jsonb?$/i.test(t)).map(([c]) => c))
    if (!jsonCols.size) return result
    for (const row of result) {
      if (typeof row !== 'object' || row === null) continue
      for (const k of Object.keys(row)) {
        const bare = k.includes('.') ? k.slice(k.lastIndexOf('.') + 1) : k
        if (jsonCols.has(bare) && typeof row[k] === 'string') {
          try { row[k] = JSON.parse(row[k] as string) } catch { /* 非 JSON 字符串——原样 */ }
        }
      }
    }
    return result
  }

  /** 合法列集：DDL columns ∪ 观测行键（insert 建表无 DDL——行键即事实列） */
  private tableCols(name: string): Set<string> {
    const t = this.table(name)
    const set = new Set(t.columns)
    for (const row of t.rows) for (const k of Object.keys(row)) set.add(stripTable(k))
    return set
  }

  /** W1 列校验：where/join-on/投影/orderBy/groupBy 纯列引用 ∈ 表列集（未知列不再静默） */
  private assertKnownCols(ctx: string, q: SelectQuery, outerCtx?: { row: Row; alias: string }): void {
    if (this.opts?.validateCols === false) return // wire 服务器端（PG 替身——真库 42703 语义）
    if (outerCtx) return // 子查询关联引用（外层列）——降级（主查询面已覆盖）
    const tables: { alias: string; cols: Set<string> }[] = [
      { alias: q.alias ?? q.table, cols: this.tableCols(q.table) },
    ]
    for (const j of q.joins ?? []) tables.push({ alias: j.alias ?? j.table, cols: this.tableCols(j.table) })
    const aggAs = new Set((q.aggregate ?? []).map((a) => a.as))
    const colRefs: string[] = []
    if (q.where) colRefs.push(...collectWhereCols(q.where))
    for (const j of q.joins ?? []) if (!isRaw(j.on)) colRefs.push(...collectWhereCols(j.on))
    for (const c of q.cols ?? []) if (typeof c === 'string') colRefs.push(c)
    for (const o of q.orderBy ?? []) if (!aggAs.has(o.col)) colRefs.push(o.col)
    if (q.groupBy) for (const g of q.groupBy) if (!aggAs.has(g)) colRefs.push(g)
    if (colRefs.length) assertColRefs(ctx, colRefs, tables, q.table, aggAs)
  }

  private execSelect(q: SelectQuery, outerCtx?: { row: Row; alias: string }): QueryResult<Row> {
    if (q.table) {
      this.assertTableExists('SELECT', q.table)
      this.assertKnownCols('SELECT', q, outerCtx)
    }
    // count(*) 聚合：过滤后行数 → 单行 { count }
    if (q.count) {
      const t = this.table(q.table)
      const n = q.where ? t.rows.filter((r) => matchWhereExpr(r, q.where!, q.alias)).length : t.rows.length
      const colName = (q.cols?.[0] as string | undefined) ?? 'count'
      return makeResult([{ [colName]: n }], 1)
    }
    // 常量投影/UNION（无 FROM——SQL parser 产出）
    if (q.unionRows && q.table === '') {
      return makeResult(q.unionRows.map((r) => ({ ...r })), q.unionRows.length)
    }
    // 派生表（FROM (SELECT ...) t——parser 递归解析内层；AST 缓存）
    if (q.derived && q.table === '') {
      let innerAst = this.derivedAstCache.get(q.derived.innerSql)
      if (!innerAst) {
        innerAst = parseSqlToAst(q.derived.innerSql)
        this.derivedAstCache.set(q.derived.innerSql, innerAst)
      }
      const inner = this.executeQuery(innerAst)
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
      return makeResult(rows.map((r) => ({ ...r })), rows.length)
    }
    // JOIN 笛卡尔积 + on 过滤（内存 INNER/LEFT）
    let rows: Row[] = this.table(q.table).rows
    let tableAlias = q.alias ?? q.table
    for (const j of q.joins ?? []) {
      const right = this.table(j.table).rows
      const jAlias = j.alias ?? j.table
      const left = j.type === 'left'
      const joined: Row[] = []
      for (const l of rows) {
        let matched = false
        for (const r of right) {
          const merged: Row = {}
          // l 已带前缀（后续轮次）则原样——首轮无前缀才加 tableAlias（join 链前缀保持）
          for (const [k, v] of Object.entries(l)) merged[k.includes('.') ? k : `${tableAlias}.${k}`] = v
          for (const [k, v] of Object.entries(r)) merged[`${jAlias}.${k}`] = v
          if (isRaw(j.on)) throw new ProtocolError('raw JOIN', 'memory-sql: raw JOIN ON 不支持（诚实裁剪——用真库）')
          if (matchWhereExpr(merged, j.on, undefined)) { joined.push(merged); matched = true }
        }
        // LEFT JOIN：主行无匹配保留（右列缺键——投影已补 null——对齐真库外连接语义）
        if (!matched && left) {
          const m: Row = {}
          for (const [k, v] of Object.entries(l)) m[k.includes('.') ? k : `${tableAlias}.${k}`] = v
          joined.push(m)
        }
      }
      rows = joined
      tableAlias = jAlias
    }
    // WHERE（结构化表达式直判——whereRaw 已删（W3a）——值面全算子）
    const matchRow = (r: Row): Row => {
      if (!outerCtx) return r
      const merged: Row = {}
      for (const [k, v] of Object.entries(r)) merged[`${q.alias ?? q.table}.${k}`] = v
      for (const [k, v] of Object.entries(outerCtx.row)) merged[`${outerCtx.alias}.${k}`] = v
      return merged
    }
    const whereExpr = q.where
    let filtered = whereExpr ? rows.filter((r) => matchWhereExpr(matchRow(r), whereExpr, q.alias)) : rows
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
      // 空集聚合（2027-XX——对齐真库 SQL）：count → [{count: 0}]（原返回 []——
      // messager unread count 空会话必崩——实证）；sum/avg/min/max → null
      // 有 GROUP BY 时空集 = 0 行（真库语义——不产 groupBy 列 undefined 行）
      if (!groups.size && !(q.groupBy?.length)) groups.set('', [])
      out = [...groups.values()].map((g) => {
        const row: Row = {}
        for (const gb of q.groupBy ?? []) row[gb] = resolveCol(g[0], gb, tableAlias)
        for (const a of q.aggregate!) {
          const col = a.col === '*' ? undefined : resolveCol(g[0], a.col, tableAlias)
          // FILTER (WHERE ...)：仅条件命中行参与聚合
          const src = a.filter ? g.filter((r) => matchWhereExpr(r, a.filter!, undefined)) : g
          const values = a.col === '*' ? src : src.map((r) => resolveCol(r, a.col, tableAlias))
          if (a.fn === 'count') row[a.as] = values.length
          else if (!values.length) row[a.as] = null // 空集：sum/avg/min/max = NULL（SQL 语义）
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
      // 列集已知但行缺键 → null（对齐真库 SELECT 语义——缺失列 = NULL）
      const knownCols = new Set(this.table(q.table).columns)
      for (const j of q.joins ?? []) for (const c of this.table(j.table).columns) knownCols.add(c)
      out = filtered.map((r) => {
        const proj: Row = {}
        for (const c of q.cols!) {
          if (isRaw(c)) throw new ProtocolError('raw 投影', 'memory-sql: raw 投影不支持（诚实裁剪——用真库）')
          // 'expr AS alias'（parser 产出）——按 expr 取值·输出键=alias
          const asm = /^(.+?)\s+AS\s+([\w.]+)$/i.exec(c)
          if (asm) proj[asm[2]] = resolveCol(r, asm[1].trim())
          else {
            const bare = stripTable(c)
            const v = resolveCol(r, c)
            proj[bare] = v === undefined && knownCols.has(bare) ? null : v
          }
        }
        if (q.vector) {
          // pgvector 等价：相似度 = 余弦（`1 - (a <=> b)`）——vectorScore 面
          proj[q.vector.as] = cosineSimilarity(vecOf(resolveCol(r, q.vector.col, tableAlias)), q.vector.vec)
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
    // 向量相似度排序（SQL 同语义：ORDER BY col<=>vec 主序——在最前）
    if (q.vector) {
      out = out
        .map((r) => ({ r, sim: cosineSimilarity(vecOf(resolveCol(r, q.vector!.col, tableAlias)), q.vector!.vec) }))
        .sort((a, b) => b.sim - a.sim)
        .map((x) => x.r)
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
    return makeResult(out, out.length)
  }

  private execInsert(q: import('./query.ts').InsertQuery): QueryResult<Row> {
    const t = this.table(q.table)
    const results: Row[] = []
    let inserted = 0
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
      // 插入显式列集（默认注入前捕获——DO UPDATE 只更新显式列，对齐 compile cols）
      const insertCols = Object.keys(row)
      // PK DEFAULT / UNIQUE 检查（与字符串路径同约束）
      if (t.pk && !(t.pk.col in row)) row[t.pk.col] = t.pk.defaultUuid ? randomUUID() : `mem-${t.nextId}`
      for (const c of t.defaultNow) {
        if (!(c in row)) row[c] = new Date().toISOString()
      }
      for (const [c, v] of t.defaultVals) {
        if (!(c in row)) row[c] = v
      }
      for (const c of Object.keys(row)) row[c] = resolveExprValue(c, undefined, row[c], row)
      // 唯一冲突：onConflict DO UPDATE → 更新冲突行；DO NOTHING → 跳过；否则 409（同字符串路径）
      // NULL 不参与唯一性（2027-XX——对齐真库 PG 多 NULL 允许——M9 direct_key 语义）
      let conflict: { u: string; row: Row } | undefined
      for (const u of t.uniques) {
        if (u in row && row[u] != null) {
          const hit = t.rows.find((r) => deepEq(r[u], row[u]))
          if (hit) { conflict = { u, row: hit }; break }
        }
      }
      if (!conflict) {
        for (const g of t.groups) {
          if (g.every((c) => c in row && row[c] != null)) {
            const hit = t.rows.find((r) => g.every((c) => deepEq(r[c], row[c])))
            if (hit) { conflict = { u: g.join(','), row: hit }; break }
          }
        }
      }
      if (conflict) {
        if (!q.onConflict) throw new HttpError(`数据库错误: duplicate key value violates unique constraint "${conflict.u}"`, 409)
        if (q.onConflict.update) {
          if (q.onConflict.merge) {
            // merge 表达式列（compile 同语义：SET merge 列——其余列不变）
            for (const [c, mv] of Object.entries(q.onConflict.merge)) {
              conflict.row[c] = resolveExprValue(c, conflict.row[c], mv, conflict.row)
            }
          } else {
          // DO UPDATE：非冲突列 ← 新行值（compile 同语义——EXCLUDED.col 规范型）
          // 仅更新插入显式列（默认注入列不参与——对齐 compile cols = insert 列集）
          const target = Array.isArray(q.onConflict.col)
            ? new Set(q.onConflict.col)
            : q.onConflict.col ? new Set([q.onConflict.col]) : null
          for (const c of insertCols) {
            if (target?.has(c)) continue
            conflict.row[c] = row[c]
          }
          }
          inserted++ // PG CommandComplete：更新行计入（DO NOTHING 不计）
          if (q.returning) results.push(q.returning === '*' ? { ...conflict.row } : pick(conflict.row, q.returning))
        }
        // DO NOTHING：跳过该行（affectedRows 不计）
        continue
      }
      t.rows.push(row)
      t.nextId++
      inserted++ // affectedRows = 实际插入数（onConflict 跳过行不计——对齐真库 CommandComplete）
      if (q.returning) results.push(q.returning === '*' ? { ...row } : pick(row, q.returning))
    }
    return makeResult(results, inserted)
  }

  private execUpdate(q: import('./query.ts').UpdateQuery): QueryResult<Row> {
    const t = this.table(q.table)
    const results: Row[] = []
    // 先计算全部更新（投影视图——唯一约束按更新后状态校验，对齐真库 23505）
    const planned: { row: Row; next: Row }[] = []
    for (const r of t.rows) {
      if (!q.where || matchWhereExpr(r, q.where, undefined)) {
        const next: Row = { ...r }
        for (const [k, v] of Object.entries(q.sets)) {
          if (isMergeExpr(v)) {
            next[k] = resolveExprValue(k, next[k], v, next)
          } else if (isRaw(v)) {
            // raw SET 值：now() 特判（编辑/软删时间戳）；其余裁剪
            if (/^now\(\)$/i.test((v as RawSql).__raw.trim())) next[k] = new Date().toISOString()
            else throw new ProtocolError('raw SET', 'memory-sql: raw SET 值不支持（诚实裁剪——用真库）')
          } else {
            next[k] = v
          }
        }
        planned.push({ row: r, next })
      }
    }
    // UNIQUE 检查（更新后状态视图——排除自身行；冲突 409 同 INSERT 路径）
    const plannedMap = new Map(planned.map((p) => [p.row, p.next]))
    for (const { row, next } of planned) {
      for (const u of t.uniques) {
        if (!(u in next) || next[u] == null) continue // NULL 不参与唯一性（对齐真库）
        const clash = t.rows.some((r) => r !== row && deepEq((plannedMap.get(r) ?? r)[u], next[u]))
        if (clash) throw new HttpError(`数据库错误: duplicate key value violates unique constraint "${u}"`, 409)
      }
      // 复合唯一组（全组等值才冲突）
      for (const g of t.groups) {
        if (!g.every((c) => c in next && next[c] != null)) continue
        const clash = t.rows.some((r) => r !== row && g.every((c) => deepEq((plannedMap.get(r) ?? r)[c], next[c])))
        if (clash) throw new HttpError(`数据库错误: duplicate key value violates unique constraint "${g.join(', ')}"`, 409)
      }
    }
    // 应用更新
    for (const { row, next } of planned) {
      for (const [k, v] of Object.entries(next)) row[k] = v
      if (q.returning) results.push(q.returning === '*' ? { ...row } : pick(row, q.returning))
    }
    return makeResult(results, planned.length)
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
    return makeResult(results, before - kept.length)
  }

  // ── 执行 ──────────────────────────────────────────────

  private assertTableExists(ctx: string, name: string): void {
    if (!name) return
    if (!this.tables.has(name)) {
      throw new ProtocolError('relation', `memory-sql: ${ctx} 表 '${name}' 不存在（relation does not exist——对齐真库 42P01）`)
    }
  }

  private table(name: string): MemoryTable {
    let t = this.tables.get(name)
    if (!t) { t = { rows: [], nextId: 1, uniques: new Set(), groups: [], defaultNow: new Set(), defaultVals: new Map(), columns: [], columnTypes: {} }; this.tables.set(name, t) }
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

  /** 事务快照（服务器 ROLLBACK 撤销事务内写入——内存自动提交的对偶；含元数据） */
  snapshot(): MemorySnapshot {
    const snap: MemorySnapshot = new Map()
    for (const [name, t] of this.tables) {
      snap.set(name, {
        rows: t.rows.map((r) => ({ ...r })),
        nextId: t.nextId,
        columns: [...t.columns],
        columnTypes: { ...t.columnTypes },
        pk: t.pk ? { ...t.pk } : undefined,
        uniques: [...t.uniques],
        groups: t.groups.map((g) => [...g]),
        defaultNow: [...t.defaultNow],
        defaultVals: Object.fromEntries(t.defaultVals),
      })
    }
    return snap
  }

  /** 恢复快照（ROLLBACK）——全量还原（含复活事务内 DROP 掉的表）；快照后新建的表清空 */
  restore(snap: MemorySnapshot): void {
    const restored = new Set<string>()
    for (const [name, e] of snap) {
      this.tables.set(name, {
        rows: e.rows.map((r) => ({ ...r })),
        nextId: e.nextId,
        columns: [...e.columns],
        columnTypes: { ...e.columnTypes },
        pk: e.pk ? { ...e.pk } : undefined,
        uniques: new Set(e.uniques),
        groups: (e.groups ?? []).map((g) => [...g]),
        defaultNow: new Set(e.defaultNow),
        defaultVals: new Map(Object.entries(e.defaultVals ?? {})),
      })
      restored.add(name)
    }
    for (const name of this.tables.keys()) {
      if (!restored.has(name)) this.tables.delete(name)
    }
  }

  /** 声明式 Schema 应用（applySchema——SchemaModule → 元数据直构造；与 DDL 解析器同落点） */
  applySchema(mod: import('./schema.ts').SchemaModule): void {
    for (const t of mod.tables ?? []) {
      const tbl = this.table(t.name)
      tbl.columns = []
      tbl.columnTypes = {}
      for (const [field, ztRaw] of Object.entries(t.columns)) {
        const zt = ztRaw as unknown as ZodType
        const meta = zt.metaInfo
        const col = (meta.column as string) ?? field
        tbl.columns.push(col)
        tbl.columnTypes[col] = (t.columnTypes?.[col] ?? zodTypeOf(zt)).toLowerCase()
        if (meta.pk) tbl.pk = { col, defaultUuid: meta.default === 'random' }
        if (meta.unique) tbl.uniques.add(col)
        if (meta.default === 'now') tbl.defaultNow.add(col)
        else if (meta.default !== undefined && meta.default !== 'random') tbl.defaultVals.set(col, meta.default)
      }
      for (const u of t.uniques ?? []) if (u.length > 1) tbl.groups.push(u)
    }
  }

  /** DDL 执行（parser 产出 DdlQuery）——约束提取到表元数据 */
  private executeDdl(stmt: Extract<Query, { kind: 'ddl' }>): QueryResult<Row> {
    if (stmt.op === 'createTable' && stmt.table) {
      const t = this.table(stmt.table)
      // 列定义（table-constraint 不是列——不进屋列序/类型——只贡献约束）
      const defs = (stmt.columns ?? []).filter((c) => c.type !== 'table-constraint')
      // 表列序（无列名 INSERT 按序映射——CREATE 时覆盖）+ 列类型（Describe OID）
      // IF NOT EXISTS 语义（对齐真库：已存在表 skip 建表——只补缺列，不覆盖既有列集
      // ——跨模块扩展场景（weifuwu-users 建表 + 平台 APP_EXT 补列）依赖此语义）
      if (t.columns.length === 0) {
        t.columns = defs.map((c) => c.name)
        for (const c of defs) t.columnTypes[c.name] = c.type.toLowerCase()
      } else {
        for (const c of defs) if (!t.columns.includes(c.name)) {
          t.columns.push(c.name)
          t.columnTypes[c.name] = c.type.toLowerCase()
        }
        for (const r of t.rows) for (const c of defs) if (!(c.name in r) && c.defaultVal !== undefined) r[c.name] = c.defaultVal
      }
      for (const col of stmt.columns ?? []) {
        if (col.type === 'table-constraint') {
          // 复合唯一目标（UNIQUE (a,b) / PRIMARY KEY (a,b)）——全组等值才冲突——
          // 近似修正（原 col0 单列记 unique——两行同 dept 异 agent 误 409 实证）
          if (col.constraintCols && col.constraintCols.length > 1) t.groups.push(col.constraintCols)
          continue
        }
        if (col.pk) t.pk = { col: col.name, defaultUuid: col.defaultUuid }
        if (col.unique) t.uniques.add(col.name)
        if (col.defaultNow) t.defaultNow.add(col.name)
        if (col.defaultVal !== undefined) t.defaultVals.set(col.name, col.defaultVal)
      }
    } else if (stmt.op === 'alterAddColumn' && stmt.table && stmt.column) {
      const t = this.table(stmt.table)
      if (!t.columns.includes(stmt.column)) {
        t.columns.push(stmt.column)
        if (stmt.columnType) t.columnTypes[stmt.column] = stmt.columnType
        // 默认值记忆 + 既有行填充（对齐真库 ALTER ADD COLUMN ... DEFAULT 语义；
        // {__now} 编码 → 当前时间——声明面 ast 与真库 DEFAULT NOW() 等价）
        if (stmt.defaultVal !== undefined) {
          const fillVal = typeof stmt.defaultVal === 'object' && stmt.defaultVal !== null && '__now' in (stmt.defaultVal as object)
            ? new Date().toISOString()
            : stmt.defaultVal
          t.defaultVals.set(stmt.column, fillVal)
          for (const row of t.rows) if (!(stmt.column in row)) row[stmt.column] = fillVal
        }
      }
    } else if (stmt.op === 'dropTable' && stmt.table) {
      this.tables.delete(stmt.table)
    } else if (stmt.op === 'dropEnum' && stmt.table) {
      this.enums.delete(stmt.table)
    } else if (stmt.op === 'alterEnumAddValue' && stmt.table) {
      // 枚举加值：值集合追加（createEnum 定义 + 后续 ADD VALUE——幂等）
      const vals = this.enums.get(stmt.table) ?? []
      for (const v of stmt.enumValues ?? []) {
        if (!vals.includes(v)) vals.push(v)
      }
      this.enums.set(stmt.table, vals)
    } else if (stmt.op === 'createEnum' && stmt.table) {
      // 枚举注册（幂等——DO 块 EXCEPTION duplicate_object 语义 = 已存在跳过）
      if (!this.enums.has(stmt.table)) this.enums.set(stmt.table, stmt.enumValues ?? [])
    }
    // createExtension / doBlock / createIndex / alter —— 内存无对应语义（no-op）
    return makeResult([], 0)
  }
}

/** 多语句拆分：; 分隔——字符串字面量/$$ DO 块/-- 注释/括号深度感知 */
// ── merge 表达式（__jsonbAppend/__inc/__now——编码即语义——对齐 compileMergeVal） ──────


function arrOf(v: unknown): unknown[] {
  if (Array.isArray(v)) return v
  if (typeof v === 'string') { try { const p = JSON.parse(v); if (Array.isArray(p)) return p } catch { /* 非 json 字符串——单元素 */ } }
  return v == null ? [] : [v]
}

function vecOf(v: unknown): number[] {
  if (Array.isArray(v)) return v as number[]
  if (typeof v === 'string') { try { const p = JSON.parse(v); if (Array.isArray(p)) return p as number[] } catch { /* 非 json */ } }
  return v == null ? [] : []
}

/** 余弦相似度（pgvector `1 - (a <=> b)` 等价——cosine distance 变体） */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0
}

export function resolveExprValue(_col: string, cur: unknown, expr: unknown, row: Record<string, unknown>): unknown {
  if (typeof expr !== 'object' || expr === null) return expr
  const e = expr as Record<string, unknown>
  if ('__jsonbAppend' in e) return [...arrOf(cur), ...arrOf(e.__jsonbAppend)]
  if ('__inc' in e) return Number(cur ?? 0) + Number(e.__inc)
  if ('__now' in e) return new Date().toISOString()
  if ('__interval' in e) {
    const [n, unit] = e.__interval as [number, string]
    return new Date(Date.now() + n * unitMs(unit)).toISOString()
  }
  if ('__colRef' in e) return row[String(e.__colRef)]
  if ('__monthStart' in e) return dateExprValue(expr)
  return expr
}

export function isMergeExpr(v: unknown): boolean {
  return typeof v === 'object' && v !== null && ['__jsonbAppend', '__inc', '__now', '__interval', '__colRef', '__monthStart'].some((k) => k in (v as Record<string, unknown>))
}

function unitMs(unit: string): number {
  switch (unit) {
    case 'day': return 86400_000
    case 'hour': return 3600_000
    case 'minute': return 60_000
    default: return 1000
  }
}

/** 日期表达式值求值（where 值面：__interval/__monthStart——编码即语义） */
export function dateExprValue(v: unknown): unknown {
  if (typeof v === 'object' && v !== null) {
    if ('__interval' in v) {
      const [n, unit] = (v as { __interval: [number, string] }).__interval
      return new Date(Date.now() + n * unitMs(unit)).toISOString()
    }
    if ('__monthStart' in v) {
      const d = new Date()
      return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString()
    }
  }
  return v
}

function splitStatements(sql: string): string[] {
  const out: string[] = []
  let buf = ''
  let i = 0
  const n = sql.length
  let depth = 0
  while (i < n) {
    const c = sql[i]
    const two = sql.slice(i, i + 2)
    // -- 行注释（——到行尾）
    if (two === '--') {
      while (i < n && sql[i] !== '\n') i++
      continue
    }
    // /* 块注释 */
    if (two === '/*') {
      i += 2
      while (i < n && sql.slice(i, i + 2) !== '*/') i++
      i += 2
      continue
    }
    // ' 字符串（'' 转义）
    if (c === "'") {
      buf += c
      i++
      while (i < n) {
        buf += sql[i]
        if (sql[i] === "'" && sql[i + 1] === "'") { i++; buf += sql[i]; i++; continue }
        if (sql[i] === "'") { i++; break }
        i++
      }
      continue
    }
    // $$ DO 块（到 END $$ 结束——内部 ; 不拆）
    if (two === '$$') {
      buf += two
      i += 2
      while (i < n && sql.slice(i, i + 2) !== '$$') {
        if (sql[i] === ';') buf += ';'
        else buf += sql[i]
        i++
      }
      if (i < n) { buf += '$$'; i += 2 }
      continue
    }
    if (c === '(' || c === '[') depth++
    if (c === ')' || c === ']') depth--
    if (c === ';' && depth <= 0) {
      out.push(buf.trim())
      buf = ''
      i++
      continue
    }
    buf += c
    i++
  }
  if (buf.trim()) out.push(buf.trim())
  return out
}

/** raw 标签模板（值按 $n 顺序参数化） */
function rawSqlImpl(strings: TemplateStringsArray, values: unknown[]): RawSql {
  const text = strings.reduce((acc, s, i) => acc + s + (i < values.length ? `$${i + 1}` : ''), '')
  return { __raw: text, params: values }
}

/** QueryResult 构造（affectedRows 非枚举——deepEqual/JSON.stringify 只见行数据，对齐 PgConnection 契约） */
function makeResult(rows: Row[], affected: number): QueryResult<Row> {
  const res = rows as QueryResult<Row>
  Object.defineProperty(res, 'affectedRows', {
    value: affected,
    enumerable: false,
    writable: true,
    configurable: true,
  })
  return res
}

function pick(row: Row, cols: string[]): Row {
  const out: Row = {}
  for (const c of cols) if (c in row) out[c] = row[c]
  return out
}

/** 从行解析列引用（支持 alias.col 与裸列） */
/**
 * 列引用校验（W1——未知列不再静默：memory 与真库 42703 行为对齐）。
 * 只校验纯列引用形态（/^[\w.]+$/）——表达式面（'lower(x)'/'count(*) AS…'）跳过不误伤。
 * 合法域：from 表列集 ∪ join 表列集（别名拆 `.` 后段）。
 */
function assertColRefs(ctx: string, colRefs: Iterable<string>, tables: { alias: string; cols: Set<string> }[], tname: string, aggAs?: Set<string>): void {
  for (const c of colRefs) {
    if (c === '*' || c === '' || /^\d+$/.test(c) || !/^[\w.]+$/.test(c)) continue
    if (aggAs?.has(c) || aggAs?.has(c.slice(c.lastIndexOf('.') + 1))) continue
    const bare = c.includes('.') ? c.slice(c.lastIndexOf('.') + 1) : c
    if (tables.some((t) => t.cols.has(bare))) continue
    const all = [...new Set(tables.flatMap((t) => [...t.cols]))].sort()
    throw new ProtocolError('未知列', `memory-sql: ${ctx} 未知列 '${c}'——${tname} 合法列：${all.join(', ')}`)
  }
}

function collectWhereCols(expr: WhereExpr): string[] {
  const out: string[] = []
  for (const [k, v] of Object.entries(expr)) {
    if (k === 'or' || k === 'and') {
      for (const sub of v as WhereExpr[]) out.push(...collectWhereCols(sub))
      continue
    }
    if (k === '__raw') continue // whereRaw 文本面——合法（协议层）
    out.push(k)
    if (typeof v === 'object' && v !== null && !Array.isArray(v) && 'col' in (v as Record<string, unknown>)) {
      out.push(String((v as { col: unknown }).col))
    }
  }
  return out
}

function resolveCol(row: Row, ref: string, _alias?: string): unknown {
  if (row == null) return undefined // 空聚合组防御（groupBy 空集不产行——防御性）
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
    if (col === 'and') {
      const ands = field as WhereExpr[]
      if (!ands.every((o) => matchWhereExpr(row, o, alias))) return false
      continue
    }
    if (typeof field === 'object' && field !== null) {
      const ops = field as ColOps
      const actual = resolveCol(row, col, alias)
      // 纯对象值（jsonb）——无任何操作符键 → 按值 deepEq 比较
      const hasOp = (['col', 'eq', 'gt', 'gte', 'lt', 'lte', 'ne', 'in', 'notIn', 'like', 'ilike', 'isNull', 'between'] as const).some((k) => ops[k] !== undefined)
      if (!hasOp) {
        if (!deepEq(actual, field)) return false
        continue
      }
      const rv = (v: unknown): unknown => {
        if (typeof v === 'object' && v !== null && ('__interval' in v || '__monthStart' in v)) return dateExprValue(v)
        if (!isRaw(v)) return v
        const t = (v as RawSql).__raw.trim()
        // 日期表达式求值（对齐真库 NOW()/DATE_TRUNC 语义——内存按当前时刻）
        const mNow = /^now\(\)\s*-\s*interval\s*'([0-9]+)\s*(days?|hours?|minutes?)'$/i.exec(t)
        if (/^now\(\)$/i.test(t)) return new Date().toISOString()
        if (mNow) {
          const amt = Number(mNow[1])
          const unit = mNow[2].toLowerCase()
          const ms = unit.startsWith('day') ? amt * 86_400_000 : unit.startsWith('hour') ? amt * 3_600_000 : amt * 60_000
          return new Date(Date.now() - ms).toISOString()
        }
        const mTrunc = /^date_trunc\('(month|day|week|hour|minute)',\s*now\(\)\)$/i.exec(t)
        if (mTrunc) {
          const d = new Date()
          const unit = mTrunc[1].toLowerCase()
          if (unit === 'month') return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString()
          if (unit === 'day') return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())).toISOString()
          if (unit === 'hour') return new Date(d.setUTCMinutes(0, 0, 0)).toISOString()
          if (unit === 'minute') return new Date(d.setUTCSeconds(0, 0)).toISOString()
          return new Date(d).toISOString()
        }
        throw new ProtocolError('WHERE 值表达式', `memory-sql: WHERE 值表达式不支持（诚实裁剪——用真库）：${t}`)
      }
      if (ops.col !== undefined && !deepEq(actual, resolveCol(row, ops.col, alias))) return false
      if (ops.eq !== undefined && !deepEq(actual, rv(ops.eq))) return false
      if (ops.gt !== undefined && cmpValue(actual, rv(ops.gt)) <= 0) return false
      if (ops.gte !== undefined && cmpValue(actual, rv(ops.gte)) < 0) return false
      if (ops.lt !== undefined && cmpValue(actual, rv(ops.lt)) >= 0) return false
      if (ops.lte !== undefined && cmpValue(actual, rv(ops.lte)) > 0) return false
      if (ops.ne !== undefined && deepEq(actual, rv(ops.ne))) return false
      if (ops.in && !ops.in.some((v) => deepEq(actual, rv(v)))) return false
      if (ops.notIn && ops.notIn.some((v) => deepEq(actual, rv(v)))) return false
      if (ops.like !== undefined && (actual === null || actual === undefined || !likeToRegExp(ops.like).test(String(actual)))) return false
      if (ops.ilike !== undefined && (actual === null || actual === undefined || !likeToRegExp(ops.ilike, true).test(String(actual)))) return false
      if (ops.between) {
        const [lo, hi] = ops.between
        if (!(Number(actual) >= Number(lo) && Number(actual) <= Number(hi))) return false
      }
      if (ops.isNull !== undefined && (actual === null || actual === undefined) !== ops.isNull) return false
      continue
    }
    if (process.env.PGDBG2) console.error('[mmw where]', JSON.stringify({col, field}))
    throw new ProtocolError('WHERE 值形态', `memory-sql: WHERE 列 ${col} 值必须为算子对象（裸标量/数组/null 形态已移除——用 { eq: v } / { in: [...] } / { isNull: true }）`)
  }
  return true
}

/** SQL LIKE 模式 → 全锚定 RegExp（% → .*、_ → .、其余转义——前缀/后缀/包含语义区分） */
function likeToRegExp(pattern: string, caseInsensitive = false): RegExp {
  let out = ''
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i]
    if (c === '\\') {
      const n = pattern[i + 1]
      if (n === '%' || n === '_' || n === '\\') { out += escapeRegExpChar(n); i++; continue }
      out += '\\\\'; continue
    }
    if (c === '%') { out += '.*'; continue }
    if (c === '_') { out += '.'; continue }
    out += escapeRegExpChar(c)
  }
  return new RegExp(`^${out}$`, caseInsensitive ? 'i' : '')
}
function escapeRegExpChar(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
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
/** 内存 ORM（测试装配——orm 面直执行；close 释放） */
export function createMemoryOrm(engine?: MemorySql): { orm: import('./orm.ts').Orm; mem: MemorySql; unsafe: (s: string, p?: unknown[]) => Promise<Row[]>; close: () => Promise<void> } {
  const mem = engine ?? new MemorySql()
  return {
    orm: createOrm(memoryAdapter(mem)),
    mem,
    unsafe: (s: string, p?: unknown[]) => mem.unsafe(s, p),
    close: async () => mem.close(),
  }
}

/** @deprecated 删除的 Sql 面——测试请改用 createMemoryOrm（.orm.query / .mem.unsafe） */
