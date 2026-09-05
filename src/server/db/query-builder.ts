/**
 * weifuwu/db — Query Builder（sql.query 入口）
 *
 * 链式构造 AST → 双后端执行：
 *   真库：compileQuery(ast) → 参数化 SQL → PgPool
 *   内存：MemorySql.executeQuery(ast) → 直接操作表存储
 *
 * ```ts
 * await sql.query.from('users').where({ age: { gt: 18 } }).orderBy('created_at', 'desc').run()
 * await sql.query.insert('users').values({ email: 'a@b.c' }).returning('id').run()
 * ```
 */
import type { Row } from './contracts.ts'
import { ValidationError } from './errors.ts'
import {
  type SelectQuery, type InsertQuery, type UpdateQuery, type DeleteQuery,
  type Query, type WhereExpr, type RawSql,
  type SelectBuilder, type InsertBuilder, type UpdateBuilder, type DeleteBuilder, type QueryBuilder,
  compileQuery, mergeWhere,
} from './query.ts'

type Executor = (q: Query) => Promise<Row[]>

export function createQueryBuilder(exec: Executor): QueryBuilder {
  const mkSelect = (table: string, alias?: string): SelectBuilder => {
    const ast: SelectQuery = { kind: 'select', table, alias }
    const b: SelectBuilder = {
      distinct(): SelectBuilder {
        ast.distinct = true
        return b
      },
      select(...cols: (string | RawSql)[]): SelectBuilder {
        ast.cols = cols.length === 1 && cols[0] === '*' ? undefined : cols
        return b
      },
      join(table: string, on: JoinOn, opts?: { alias?: string; type?: 'inner' | 'left' }): SelectBuilder {
        ast.joins ??= []
        let t = table
        let a = opts?.alias
        if (!a && /\s/.test(table)) {
          ;[t, a] = table.split(/\s+/)
        }
        ast.joins.push({ table: t, alias: a, type: opts?.type ?? 'inner', on })
        return b
      },
      where(expr: WhereExpr): SelectBuilder {
        // 多次 where 追加 AND（不覆盖——同列对象级合并；不可合并 and 包装——AND 语义不丢）
        ast.where = ast.where ? mergeWhere(ast.where, expr) : expr
        return b
      },
      in(col: string, query: SelectQuery, not = false): SelectBuilder {
        ast.sub ??= []
        ast.sub.push({ type: 'in', col, query, not })
        return b
      },
      exists(query: SelectQuery, not = false): SelectBuilder {
        ast.sub ??= []
        ast.sub.push({ type: 'exists', query, not })
        return b
      },
      groupBy(...cols: string[]): SelectBuilder {
        ast.groupBy = cols
        return b
      },
      having(expr: WhereExpr): SelectBuilder {
        ast.having = expr
        return b
      },
      count(col = '*', as = 'count', filter?: WhereExpr): SelectBuilder {
        ast.aggregate ??= []
        ast.aggregate.push({ fn: 'count', col, as, filter })
        return b
      },
      sum(col: string, as = 'sum', filter?: WhereExpr): SelectBuilder {
        ast.aggregate ??= []
        ast.aggregate.push({ fn: 'sum', col, as, filter })
        return b
      },
      avg(col: string, as = 'avg', filter?: WhereExpr): SelectBuilder {
        ast.aggregate ??= []
        ast.aggregate.push({ fn: 'avg', col, as, filter })
        return b
      },
      min(col: string, as = 'min', filter?: WhereExpr): SelectBuilder {
        ast.aggregate ??= []
        ast.aggregate.push({ fn: 'min', col, as, filter })
        return b
      },
      max(col: string, as = 'max', filter?: WhereExpr): SelectBuilder {
        ast.aggregate ??= []
        ast.aggregate.push({ fn: 'max', col, as, filter })
        return b
      },
      orderBy(col: string, dir: 'asc' | 'desc' = 'asc'): SelectBuilder {
        ast.orderBy ??= []
        ast.orderBy.push({ col, dir })
        return b
      },
      vectorScore(col: string, vec: number[], as: string): SelectBuilder {
        ast.vector = { col, vec, as }
        return b
      },
      limit(n: number): SelectBuilder {
        ast.limit = n
        return b
      },
      offset(n: number): SelectBuilder {
        ast.offset = n
        return b
      },
      async run(): Promise<Row[]> {
        return exec(ast)
      },
      async one(): Promise<Row | undefined> {
        const rows = await exec(ast)
        return rows[0]
      },
      toQuery(): SelectQuery {
        return structuredClone(ast) as typeof ast
      },
    }
    return b
  }

  const mkInsert = (table: string): InsertBuilder => {
    const ast: InsertQuery = { kind: 'insert', table, rows: [] }
    const b: InsertBuilder = {
      values(row: Row): InsertBuilder {
        ast.rows.push(row)
        return b
      },
      rows(rows: Row[]): InsertBuilder {
        ast.rows.push(...rows)
        return b
      },
      returning(...cols: (string | '*')[]): InsertBuilder {
        ast.returning = cols.length === 1 && cols[0] === '*' ? '*' : cols
        return b
      },
      onConflict(col?: string | string[], update = false, merge?: Record<string, unknown>): InsertBuilder {
        ast.onConflict = { col, update, merge }
        return b
      },
      async run(): Promise<Row[]> {
        return exec(ast)
      },
      toQuery(): InsertQuery {
        return structuredClone(ast) as typeof ast
      },
    }
    return b
  }

  const mkUpdate = (table: string): UpdateBuilder => {
    const ast: UpdateQuery = { kind: 'update', table, sets: {} }
    const b: UpdateBuilder = {
      set(sets: Row): UpdateBuilder {
        ast.sets = sets
        return b
      },
      where(expr: WhereExpr): UpdateBuilder {
        ast.where = ast.where ? mergeWhere(ast.where, expr) : expr
        return b
      },
      returning(...cols: (string | '*')[]): UpdateBuilder {
        ast.returning = cols.length === 1 && cols[0] === '*' ? '*' : cols
        return b
      },
      async run(): Promise<Row[]> {
        if (!ast.where) throw new ValidationError('weifuwu/db: UPDATE 必须带 WHERE（全表更新是危险操作——逐批 where 或迁移面显式执行）')
        return exec(ast)
      },
      toQuery(): UpdateQuery {
        return structuredClone(ast) as typeof ast
      },
    }
    return b
  }

  const mkDelete = (table: string): DeleteBuilder => {
    const ast: DeleteQuery = { kind: 'delete', table }
    const b: DeleteBuilder = {
      where(expr: WhereExpr): DeleteBuilder {
        ast.where = ast.where ? mergeWhere(ast.where, expr) : expr
        return b
      },
      returning(...cols: (string | '*')[]): DeleteBuilder {
        ast.returning = cols.length === 1 && cols[0] === '*' ? '*' : cols
        return b
      },
      async run(): Promise<Row[]> {
        if (!ast.where) throw new ValidationError('weifuwu/db: DELETE 必须带 WHERE（全表清空是危险操作——迁移面 runMigration 显式执行）')
        return exec(ast)
      },
      toQuery(): DeleteQuery {
        return structuredClone(ast) as typeof ast
      },
    }
    return b
  }

  return {
    from: (table, alias) => {
      // 兼容 'orders o'（带别名字符串）与 (table, alias) 两种形式
      if (!alias && /\s/.test(table)) {
        const [t, a] = table.split(/\s+/)
        return mkSelect(t, a)
      }
      return mkSelect(table, alias)
    },
    insert: (table) => mkInsert(table),
    update: (table) => mkUpdate(table),
    delete: (table) => mkDelete(table),
  }
}

type JoinOn = Parameters<SelectBuilder['join']>[1]

/** AST 构建工厂（协议层 = AST——无执行：toQuery() 产出纯数据 Query 供传输/嵌入执行） */
export function buildQuery(): QueryBuilder {
  return createQueryBuilder((() => { throw new Error('buildQuery 无执行面——协议层只构建 AST') }) as never)
}
