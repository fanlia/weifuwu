/**
 * weifuwu/orm —— 声明式 ORM（shape + operator + adapter 组合体——替换 ctx.sql 业务面）
 *
 * 形态（表绑定——shape 驱动·列引用类型收窄）：
 *   const Agent = orm.table('agents', { id: f.pk(z.uuid()), name: f.req(z.string()), type: z.enum(['ai','user']) })
 *   Agent.select().where(and(eq(Agent.c.type, 'ai'), ilike(Agent.c.name, '%张%'))).run()
 *   Agent.insert(values).run()                    // shape 变体校验→列名翻译
 *   Agent.update(patch).where(eq(Agent.c.id, id)).run()
 *   Agent.delete().where(eq(Agent.c.id, id)).run()
 *   orm.gql(Agent) → { typeDefs, resolvers }      // 内置 GraphQL 链路
 *
 * adapter（可插拔——执行面）：
 *   postgresAdapter(pg)   —— Query AST → compileQuery（参数化 SQL）→ 服务器(PG)
 *   memoryAdapter(engine) —— Query AST → 内存引擎直执行
 *   （迁移/DDL 面：orm.execute（SQL 字符串保留——判负记录：DDL 不 DSL 化）
 *
 * ctx 注入：app.use(dbPlugin(orm)) 或 ctx.orm——业务路由唯一数据入口（ctx.sql 不再暴露）
 */
import { createQueryBuilder } from './query-builder.ts'
import type { Query } from './query.ts'
import type { QueryResult } from './contracts.ts'
import type { ZodRawShape } from '../../shared/zod.ts'
import { shape } from './shape.ts'
import { gqlFromShape, type GqlShapeOptions, type GqlShapeOutput } from './gql-from-shape.ts'
import { restFromShape } from './rest-from-shape.ts'
import type { SelectBuilder, InsertBuilder, UpdateBuilder, DeleteBuilder, QueryBuilder, WhereExpr } from './query.ts'
import type { Infer } from '../../shared/zod.ts'
import { ValidationError } from './errors.ts'

// ── adapter（执行面——SQL 服务器/内存引擎）─────────────────

export interface DbAdapter {
  /** Query AST 执行（业务主路） */
  executeQuery(q: Query): Promise<QueryResult>
  /** 事务（同连接执行 fn——postgres 真事务；memory 无事务面（no-op 等价标注） */
  transaction?<T>(fn: (execute: (q: Query) => Promise<QueryResult>) => Promise<T>): Promise<T>
}

// ── ORM 类型面 ────────────────────────────────────────────

/** 行类型（shape 字段名 → zod Infer——编译期类型安全） */
export type RowOf<S extends ZodRawShape> = { [K in keyof S]: Infer<S[K]> }

export interface OrmTable<S extends ZodRawShape> {
  /** 列引用表（类型收窄：eq(Agent.c.type, 'ai')——值类型绑定列类型·编译期） */
  c: { [K in keyof S]: { ref: string; readonly __out: import('../../shared/zod.ts').Infer<S[K]> } }
  /** 查询入口（select(cols?)——builder 链·行类型 RowOf<S>） */
  select(...cols: string[]): SelectBuilder<RowOf<S>>
  /** 插入入口（values 单行或数组——shape 校验/列名翻译 orm 内部接线） */
  insert(values: Record<string, unknown> | Record<string, unknown>[]): InsertBuilder<RowOf<S>>
  /** 更新入口（patch 部分更新） */
  update(patch: Record<string, unknown>): UpdateBuilder<RowOf<S>>
  /** 删除入口（必须 where——builder 层防护） */
  delete(): DeleteBuilder<RowOf<S>>
  /** 存在检查（isMember 样板收口——limit 1 短路） */
  exists(where: import('./query.ts').WhereExpr): Promise<boolean>
  /** 列表模式（count+list 双查收口——平台列表面样板） */
  paginate(opts: {
    filter?: import('./query.ts').WhereExpr
    /** W3：sort 字段类型化（keyof S——字面量多余键编译红） */
    sort?: { field: keyof S & string; dir?: 'asc' | 'desc' }[]
    limit?: number
    offset?: number
  }): Promise<{ rows: RowOf<S>[]; total: number }>
  /** shape 定义（元数据/变体/校验——业务类型注入） */
  shapeDef: S
  /** 内部 shape 实体（gql 元数据消费） */
  readonly __shape: unknown
}

/** 租户 scope 配置（withCtx 自动注入面——平台 47 处手写 app_id 过滤收口） */
export interface OrmTenant {
  /** scope 字段（shape 字段名） */
  field: string
  /** 上下文取值（每请求 appId 等） */
  value: (ctx: unknown) => string | undefined
}

export interface CtxOrm extends Orm {
  /** 租户 scope 表（自动 where/注入）——派生面 table(name) 免 shapeDef */
  ctxTable<S extends ZodRawShape>(name: string, shapeDef: S): OrmTable<S>
  ctxTable(name: string): OrmTable<ZodRawShape>
}

/**
 * 租户绑定视图：ctx.orm = orm.withCtx(ctx)——表操作自动 scope
 * （select/update/delete 预置 where·insert 注入 field——与用户条件 AND 合并）
 */

export interface Orm {
  /** 表注册（shape 驱动——列引用/校验/变体）——同名表幂等返回；
   *  派生面（tx/ctx）用 table(name) 免 shapeDef（共享 registry） */
  table<S extends ZodRawShape>(name: string, shapeDef: S): OrmTable<S>
  table(name: string): OrmTable<ZodRawShape>
  /** 租户绑定视图（ctx→自动 scope——select/insert/update/delete 预置 tenant 条件） */
  withCtx(ctx: unknown): CtxOrm
  /** 兜底查询面（复杂 JOIN/嵌套——builder 原生） */
  query: QueryBuilder
  /** GraphQL 生成（shape → SDL + resolvers——内置链路输入） */
  gql<S extends ZodRawShape>(table: OrmTable<S>, opts?: GqlShapeOptions): GqlShapeOutput
  /** RESTful 面（W4——restFromShape 入口对称：`rest = orm.rest(table); rest.mount(app, base)`） */
  rest<S extends ZodRawShape>(table: OrmTable<S>, opts?: import('./rest-from-shape.ts').RestShapeOptions): import('./rest-from-shape.ts').RestShapeOutput
  /** 事务（fn 内同连接执行——commit 可见/rollback 撤销；memory 单线程 no-op 等价） */
  transaction<T>(fn: (tx: Orm) => Promise<T>): Promise<T>
  /** AST 执行面（协议层 = AST——Query 纯数据可序列化；测试播种/嵌入执行入口） */
  execute(q: Query): Promise<QueryResult>
  /** 注册表枚举（state-machine 透明化——checkConsistency 输入面/诊断可见） */
  tables(): { name: string; fields: Record<string, unknown>; dbFields: Record<string, { column?: string }> }[]
}

// ── 实现 ──────────────────────────────────────────────────

export function createOrm(adapter: DbAdapter, tenant?: OrmTenant): Orm {
  return makeOrm(adapter, tenant, new Map())
}

/** 派生共享面：事务/租户视图复用同一表注册（registry——tx.table(name) 免 shapeDef） */
function makeOrm(adapter: DbAdapter, tenant: OrmTenant | undefined, tables: Map<string, { t: OrmTable<ZodRawShape> }>): Orm {
  const query = createQueryBuilder(async (q) => {
    const r = await adapter.executeQuery(q)
    return r
  })

  function table<S extends ZodRawShape>(name: string, shapeDef?: S): OrmTable<S> {
    const hit = tables.get(name)
    if (hit) return hit.t as OrmTable<S>
    if (shapeDef === undefined) {
      throw new ValidationError(`weifuwu/db: 表 ${name} 未注册（tx/ctx 派生用 orm.table(name, shapeDef) 先行注册）`)
    }
    const cols = Object.keys(shapeDef)
    const sh = shape({ table: name, fields: shapeDef })
    const dbCols = cols.map((c) => sh.dbFields[c]?.column ?? c)
    const rowOf = (r: Record<string, unknown>) => (sh as unknown as { fromDb: (x: Record<string, unknown>) => Record<string, unknown> }).fromDb(r)
    const CHAIN = new Set(['distinct', 'select', 'join', 'where', 'in', 'exists', 'groupBy', 'having', 'count', 'sum', 'avg', 'min', 'max', 'orderBy', 'limit', 'offset', 'values', 'rows', 'returning', 'onConflict', 'set'])
    // 列名翻译：字段名 → db 列名（'*'/未知列原样——select/returning 显式列收窄）
    const toDbCol = (c: unknown): unknown => {
      if (c === '*') return '*'
      if (typeof c === 'string') return sh.dbFields[c]?.column ?? c
      return c
    }
    const fromDbBuilder = <T2 extends ZodRawShape = S>(b: { run: () => Promise<QueryResult>; one?: () => Promise<unknown> }): SelectBuilder<RowOf<T2>> & { run: () => Promise<RowOf<T2>[]> } => {
      // 链方法代理：返回同一 wrapped（链中任意点 .run() 都归一）
      const wrapped: Record<string, unknown> = {
        run: () => (b as { run: () => Promise<QueryResult> }).run().then((r) => r.map((x: Record<string, unknown>) => rowOf(x))),
        one: async () => {
          const r = await (wrapped.run as () => Promise<unknown[]> )()
          return r[0]
        },
      }
      for (const m of CHAIN) {
        if (m === 'returning') continue // 专门化（见下——翻译列名）
        const fn = (b as Record<string, unknown>)[m]
        if (typeof fn === 'function') {
          wrapped[m] = (...args: unknown[]) => {
            ;(fn as (...a: unknown[]) => unknown).apply(b, args)
            return wrapped
          }
        }
      }
      // returning：字段名 → db 列名（显式收窄覆盖——builder 赋值语义）
      wrapped.returning = (...args: unknown[]) => {
        ;(b as unknown as { returning: (...a: unknown[]) => unknown }).returning(...args.map((a) => toDbCol(a)))
        return wrapped
      }
      return wrapped as never
    }
    const c: Record<string, { ref: string; readonly __out: unknown }> = {}
    for (const k of cols) c[k] = { ref: sh.dbFields[k]?.column ?? k, __out: undefined }
    const t = {
      c: c as { [K in keyof S]: { ref: string; readonly __out: import('../../shared/zod.ts').Infer<S[K]> } },
      select: (...sel: string[]) => fromDbBuilder(query.from(name).select(...(sel.length ? sel.map((c) => toDbCol(c) as string) : ['*']))),
      insert: (values: Record<string, unknown> | Record<string, unknown>[]) => {
        // 校验面（insertSchema——API 边界——非法输入拒绝）+ 列名翻译（单行/批量）
        const schema = (sh as unknown as { insertSchema: () => { parse: (v: unknown) => unknown } }).insertSchema()
        const rows = Array.isArray(values) ? values : [values]
        let b = query.insert(name)
        for (const row of rows) b = b.values(sh.toDb(schema.parse(row) as Record<string, unknown>))
        // returning 用 db 列名（行键=列名）——fromDb 归一回字段名
        return fromDbBuilder(b.returning(...dbCols))
      },
      update: (patch: Record<string, unknown>) => {
        // merge 编码对象（__jsonbAppend/__inc/__now/__interval/__colRef/__monthStart）——
        // 值面原生对象（非 DB 值）——校验面放行（schema 不感知编码）+ 原样透传 toDb
        const mergeKeys = Object.entries(patch)
          .filter(([, v]) => typeof v === 'object' && v !== null && ['__jsonbAppend', '__inc', '__now', '__interval', '__colRef', '__monthStart'].some((k) => k in (v as Record<string, unknown>)))
          .map(([k]) => k)
        const plain = Object.fromEntries(Object.entries(patch).filter(([k]) => !mergeKeys.includes(k)))
        const data = {
          ...((sh as unknown as { updateSchema: () => { parse: (v: unknown) => unknown } }).updateSchema().parse(plain) as Record<string, unknown>),
          ...Object.fromEntries(mergeKeys.map((k) => [k, patch[k]])),
        }
        // 默认 returning 全列（行视图可读——与 insert 统一；显式 returning 覆盖）
        return fromDbBuilder(query.update(name).set(sh.toDb(data)).returning(...dbCols))
      },
      delete: () => fromDbBuilder(query.delete(name).returning(...dbCols)),
      exists: async (where: any) => {  // WhereExpr（builder 面）——宽类型：条件形状由编译面约束
        const b = query.from(name).select('1').where(where).limit(1)
        void fromDbBuilder
        return (await (b as { run: () => Promise<QueryResult> }).run()).length > 0
      },
      paginate: async (po: { limit?: number; offset?: number; filter?: any; sort?: Array<{ field: string; dir?: string }> }) => {
        const limit = Math.max(1, Math.min(po.limit ?? 50, 100))
        const offset = Math.max(0, po.offset ?? 0)
        // count（同 filter——与 rows 双查一致）
        const countQ = query.from(name)
        if (po.filter) countQ.where(po.filter)
        const [totalRow] = await countQ.count('*', 'total').run()
        const total = Number((totalRow as Record<string, unknown>).total ?? 0)
        // rows
        const rowsQ = query.from(name)
        if (po.filter) rowsQ.where(po.filter)
        for (const srt of po.sort ?? []) rowsQ.orderBy(srt.field, srt.dir === 'desc' ? 'desc' : 'asc')
        rowsQ.limit(limit).offset(offset)
        const rows = await fromDbBuilder(rowsQ).run()
        return { rows, total }
      },
      shapeDef,
      __shape: sh,
      __shapeDbFields: sh.dbFields,
    }
    tables.set(name, { t: t as unknown as OrmTable<ZodRawShape> })
    return t as unknown as OrmTable<S>
  }

  const scoped = (ctx: unknown): CtxOrm => {
    // W1 修复（agent 实证 2026-09）：v 延迟求值——pg 中间件在 auth 之前注册
    // （ctx.appId 后注入）——withCtx 时立即求值会读到 undefined → scope 永不生效
    // → list 无过滤全租户泄漏（页面 aiCount 误判）。每次操作时读当前 ctx 值。
    const ctxV = (): string | undefined => tenant?.value(ctx)
    const ctxTable = <S2 extends ZodRawShape>(name2: string, shapeDef2?: S2): OrmTable<S2> => {
      const base = table(name2, shapeDef2 as never)
      const sh2 = (base as unknown as { __shape: { dbFields: Record<string, { column?: string }> } }).__shape
      // 无租户列的表（全局表——role_templates/workflows）不 scope：字段不存在 → null
      // （原先 ?? tenant.field 兜底会把不存在的列注入 where——全局表在 tenant 中间件下不可用）
      const col = tenant ? (sh2.dbFields[tenant.field] ? sh2.dbFields[tenant.field].column ?? tenant.field : null) : null
      const scopeCond = (): Record<string, unknown> | null => {
        const v = ctxV()
        return v !== undefined && col ? { [col]: { eq: v } } : null
      }
      return {
        ...base,
        select: (...sel) => {
          const b = base.select(...sel) as unknown as { where: (e: Record<string, unknown>) => unknown }
          const sc = scopeCond()
          if (sc) b.where(sc)
          return b as never
        },
        insert: (values) => {
          const rows = Array.isArray(values) ? values : [values]
          const v = ctxV()
          const withScope = rows.map((r) => {
            const scope = scopeCond()
            return scope && r[tenant!.field] === undefined ? { ...r, [tenant!.field]: v } : r
          })
          return base.insert(Array.isArray(values) ? withScope : withScope[0])
        },
        update: (patch) => {
          const b = base.update(patch) as unknown as { where: (e: Record<string, unknown>) => unknown }
          const sc = scopeCond()
          if (sc) b.where(sc)
          return b as never
        },
        delete: () => {
          const b = base.delete() as unknown as { where: (e: Record<string, unknown>) => unknown }
          const sc = scopeCond()
          if (sc) b.where(sc)
          return b as never
        },
        paginate: async (po) => {
          const sc = scopeCond()
          return base.paginate({ ...po, filter: sc ? { and: [po.filter ?? {}, sc] } as never : po.filter } as never)
        },
      } as OrmTable<S2>
    }
    return { ...ormBaseRef(), ctxTable } as CtxOrm
  }

  const ormBaseRef = () => ormBase
  const ormBase: Orm = {
    table,
    query,
    gql: (t, opts) => {
      if (!(t as { __shape?: unknown }).__shape) throw new Error('orm.gql: 表未注册（orm.table 先行）')
      // resolver 执行面绑定 orm（query builder——不依赖 ctx.sql）
      // I3（W1）：createOrm.tenant 自动派生 gql opts.tenant——单源（gql 面不可绕过租户隔离；
      // 显式 opts.tenant 优先——覆盖面保留）
      const explicit = opts as GqlShapeOptions | undefined
      const bound: GqlShapeOptions = {
        ...explicit,
        ...(explicit?.tenant === undefined && tenant ? { tenant: { field: tenant.field, value: tenant.value } } : {}),
        sql: () => ormBase,
      }
      return gqlFromShape((t as { __shape: Parameters<typeof gqlFromShape>[0] }).__shape, bound)
    },
    rest: (t, opts) => {
      if (!(t as { __shape?: unknown }).__shape) throw new Error('orm.rest: 表未注册（orm.table 先行）')
      return restFromShape((t as { __shape: Parameters<typeof restFromShape>[0] }).__shape, opts)
    },
    withCtx: scoped,
    execute: (q: Query) => adapter.executeQuery(q),
    tables: () => {
      // registry 枚举（透明化）——名称/字段/列映射（诊断面——checkConsistency 输入）
      const out: { name: string; fields: Record<string, unknown>; dbFields: Record<string, { column?: string }> }[] = []
      for (const [name, rec] of tables) out.push({ name, fields: rec.t.shapeDef as Record<string, unknown>, dbFields: (rec.t as unknown as { __shapeDbFields: Record<string, { column?: string }> }).__shapeDbFields })
      return out
    },
    transaction: <T2>(fn: (tx: Orm) => Promise<T2>) => {
      if (!adapter.transaction) {
        // memory/无事务面：单线程直跑（无并发交错——no-op 等价·诚实标注）
        return fn(ormBase)
      }
      return adapter.transaction(async (execQ) => {
        const txOnce: DbAdapter = {
          executeQuery: (q) => execQ(q as never) as Promise<QueryResult>,
        }
        return fn(makeOrm(txOnce, tenant, tables))
      })
    },
  }
  return ormBase
}

// ── adapter 工厂 ──────────────────────────────────────────

/** postgres adapter：Query AST → compileQuery（参数化 SQL）→ 服务器（PG wire） */
export function postgresAdapter(
  pool: {
    query: (sql: string, params?: unknown[]) => Promise<QueryResult>
  },
  compile: (q: Query) => { sql: string; params: unknown[] },
): DbAdapter {
  return {
    executeQuery: async (q) => {
      const { sql, params } = compile(q)
      return pool.query(sql, params)
    },
    transaction: (fn) => {
      const poolT = pool as { transaction?: (f: (tx: { query: (sql: string, params?: unknown[]) => Promise<QueryResult> }) => Promise<unknown>) => Promise<unknown> }
      if (!poolT.transaction) throw new ValidationError('weifuwu/db: 当前 adapter 无事务能力')
      return poolT.transaction(async (tx) => {
        return fn((q) => {
          const { sql, params } = compile(q)
          return tx.query(sql, params)
        })
      }) as never
    },
  }
}

/** memory adapter：Query AST → 内存引擎直执行（fuzz 对账保证与 PG 等价） */
export function memoryAdapter(engine: {
  executeQuery(q: Query): QueryResult
  /** 事务快照/回滚（MemorySql 提供——无则 no-op 等价标注） */
  snapshot?(): unknown
  restore?(snap: unknown): void
}): DbAdapter {
  const txNs = new Map<string, unknown>()
  return {
    executeQuery: (q) => Promise.resolve(engine.executeQuery(q)),
    // 快照回滚事务（W2——memory 单线程；snapshot → fn → catch restore + 重抛）
    // 与真库语义对齐：事务内失败 → 事务外观察不到部分写入
    transaction: <T>(fn: (execute: (q: Query) => Promise<QueryResult>) => Promise<T>) => {
      if (!engine.snapshot || !engine.restore) {
        // 无事务面（无快照能力）——no-op 等价（诚实标注）
        return fn((q) => Promise.resolve(engine.executeQuery(q)))
      }
      const snap = engine.snapshot()
      return fn((q) => Promise.resolve(engine.executeQuery(q))).catch((e: unknown) => {
        engine.restore!(snap)
        throw e
      })
    },
  }
}
