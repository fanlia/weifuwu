/**
 * weifuwu/rest —— restFromShape：shape → RESTful 路由组（纯函数）
 *
 * 命名契约（W0）：`restFromShape(shapeDef, opts)` / `orm.rest(Table)` 入口对称
 * （orm.gql/gqlFromShape 同构）。
 *
 * 生成面（W4 首版——分层纪律：协议面 + 样板 handler；业务走 hooks/覆盖）：
 *   - GET    {base}            list（query 参数：eq 直排 `?col=v` + sort
 *     `?sort=-created_at,name`（-前缀 desc·逗号多字段）+ limit/offset——
 *     eq 直排经 filterToWhere 与 gql filter 同核语义）
 *   - GET    {base}/:id        one（404）
 *   - POST   {base}            insert（201 + insertSchema 校验 400）
 *   - PATCH  {base}/:id        update（404/400）
 *   - DELETE {base}/:id        delete（404/204）
 *
 * 内置承诺：
 *   - query 参数 schema 从 shape 派生（枚举白名单——`?type=robot` → 400 ·
 *     sort 字段白名单 · limit clamp）
 *   - 敏感列 fieldPolicy.hidden（SDL/返回双面不出现——与 gql 同策略）
 *   - 租户 scope：ctx.orm (CtxOrm) 的 ctxTable——与 orm 单源（无独立 tenant
 *     配置面）
 *   - hooks 接缝（before/after——权限守卫/响应增强——业务 handler 插点）
 *
 * 判负（首版——后续再议）：嵌套资源路由（/dept/:id/members）· 全算子 query
 * 参数（in/gt/contains——rest 参数 flat 面只 eq 直排——复杂过滤走
 * orm.table/gql）· 批量/upsert · 自定义错误形状
 */
import type { ZodRawShape, ZodType } from '../../shared/zod.ts'
import type { Shape } from './shape.ts'
import { filterToWhere } from './filter.ts'

export interface RestHooks {
  beforeList?: (req: Request, ctx: unknown) => Promise<void> | void
  afterList?: (rows: Record<string, unknown>[], req: Request, ctx: unknown) => Record<string, unknown>[] | Promise<Record<string, unknown>[]>
  beforeInsert?: (data: Record<string, unknown>, req: Request, ctx: unknown) => Promise<void> | void
  beforeUpdate?: (id: string, patch: Record<string, unknown>, req: Request, ctx: unknown) => Promise<void> | void
  beforeDelete?: (id: string, req: Request, ctx: unknown) => Promise<void> | void
}

export interface RestShapeOptions {
  /** 资源名（默认表名——仅元数据） */
  name?: string
  /** 默认分页上限（默认 100） */
  maxLimit?: number
  /** 字段策略（fieldPolicy——敏感列豁免：列表/单查/返回不出现；写入面保留） */
  hidden?: string[]
  /** 业务接缝（hooks——分层纪律：业务 handler 插点） */
  hooks?: RestHooks
}

export interface RestShapeOutput {
  /** 挂载面（app.get/post/patch/delete 注册——`/api/agents` 等 base） */
  mount: (app: {
    get: (p: string, h: (req: Request, ctx: never) => Promise<Response>) => unknown
    post: (p: string, h: (req: Request, ctx: never) => Promise<Response>) => unknown
    patch: (p: string, h: (req: Request, ctx: never) => Promise<Response>) => unknown
    delete: (p: string, h: (req: Request, ctx: never) => Promise<Response>) => unknown
  }, base: string) => void
}

function unwrap(schema: ZodType): ZodType {
  let s = schema as ZodType
  for (;;) {
    const inner = (s as unknown as { inner?: ZodType }).inner as ZodType | undefined
    if (inner && typeof (s as unknown as { _typeName?: string })._typeName === 'string' && ['optional', 'nullable', 'default', 'effects', 'transform'].includes((s as unknown as { _typeName: string })._typeName)) {
      s = inner
    } else break
  }
  return s
}

/** query 参数 → filter（eq 直排——flat 面；标量列只接受标量值——枚举白名单） */
function queryToFilter(search: URLSearchParams, shapeDef: { dbFields: Record<string, { column?: string }> }, enumOf: (f: string) => string[] | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of search.entries()) {
    if (k === 'sort' || k === 'limit' || k === 'offset') continue
    const values = enumOf(k)
    if (values && !values.includes(v)) throw new Error(`invalid enum value for ${k}: ${v}（允许：${values.join(' | ')}）`)
    out[k] = { eq: v }
  }
  return out
}

export function restFromShape<S extends ZodRawShape>(shapeDef: Shape<S>, opts: RestShapeOptions = {}): RestShapeOutput {
  const name = opts.name ?? shapeDef.table
  const hidden = new Set(opts.hidden ?? [])
  const maxLimit = opts.maxLimit ?? 100
  const cols = Object.keys(shapeDef.fields as Record<string, ZodType>).filter((c) => !hidden.has(c))
  const dbCols = cols.map((c) => shapeDef.dbFields[c]?.column ?? c)
  const colSet = new Set(cols)
  const pkField = shapeDef.pkField ?? 'id'

  const stripHidden = (r: Record<string, unknown>): Record<string, unknown> => {
    const out = (shapeDef as unknown as { fromDb: (x: Record<string, unknown>) => Record<string, unknown> }).fromDb(r)
    for (const h of hidden) delete out[h]
    return out
  }
  const ctxTable = (ctx: unknown): unknown => {
    const o = (ctx as { orm: { ctxTable?: (n: string) => unknown; table: (n: string) => unknown } }).orm
    // CtxOrm（tenant 配置——自动 scope）或无 tenant（table——无 scope 语义）——与中间件面一致
    return typeof o.ctxTable === 'function' ? o.ctxTable(name) : o.table(name)
  }

  /** 错误映射（校验/枚举/未知列 → 400——业务守卫抛错也 400；不吞——路由器日志） */
  function errorOf(e: unknown): Response {
    const msg = e instanceof Error ? e.message : String(e)
    return Response.json({ error: msg }, { status: 400 })
  }
  const parseBody = async (req: Request): Promise<Record<string, unknown>> => {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') throw new Error('invalid JSON body')
    return body as Record<string, unknown>
  }

  const enumOf = (f: string): string[] | undefined => {
    const s = unwrap((shapeDef.fields as Record<string, ZodType>)[f] as ZodType)
    const v = (s as unknown as { values?: string[] }).values
    return Array.isArray(v) ? v.map(String) : undefined
  }

  return {
    mount: (app, base) => {
      // GET list——eq 直排 + sort(多字段 -desc) + limit/offset
      app.get(base, async (req: Request, ctx: never): Promise<Response> => {
        try {
        const hooks = opts.hooks
        await hooks?.beforeList?.(req, ctx)
        const url = new URL(req.url)
        const t = ctxTable(ctx) as { paginate: (po: { filter?: unknown; sort?: { field: string; dir: 'asc' | 'desc' }[]; limit: number; offset: number }) => Promise<{ rows: Record<string, unknown>[]; total: number }> }
        // query → filter（枚举白名单校验外——未知非标量参数直接走 eq——shape 列校验兜底）
        const filter = queryToFilter(url.searchParams, shapeDef, enumOf)
        // sort 解析（`-created_at,name` → [{created_at,desc},{name,asc}]）
        const sortRaw = url.searchParams.get('sort')
        const sort: { field: string; dir: 'asc' | 'desc' }[] = []
        if (sortRaw) for (const part of sortRaw.split(',')) {
          const dir = part.startsWith('-') ? 'desc' : 'asc'
          const field = dir === 'desc' ? part.slice(1) : part
          if (!colSet.has(field)) return Response.json({ error: `invalid sort field: ${field}` }, { status: 400 })
          sort.push({ field, dir })
        }
        const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10) || 20))
        const offset = Math.max(0, parseInt(url.searchParams.get('offset') ?? '0', 10) || 0)
        let rows = await t.paginate({ filter, sort, limit, offset })
        // 与 paginate 对齐：rows/total（CtxOrm paginate 自动 scope）
        const pageOut = rows
        let out = pageOut.rows.map(stripHidden)
        if (hooks?.afterList) out = await hooks.afterList(out, req, ctx)
        return Response.json({ [name]: out, total: pageOut.total })
        } catch (e) { return errorOf(e) }
      })

      // GET one
      app.get(`${base}/:id`, async (req: Request, ctx: never): Promise<Response> => {
        try {
        const id = (ctx as { params: Record<string, string> }).params.id
        const t = ctxTable(ctx) as { select: (...c: string[]) => { where: (w: Record<string, unknown>) => { limit: (n: number) => { run: () => Promise<Record<string, unknown>[]> } } } }
        const rows = await t.select(...dbCols).where({ [pkField]: { eq: id } }).limit(1).run()
        if (!rows.length) return Response.json({ error: 'not found' }, { status: 404 })
        return Response.json(stripHidden(rows[0]))
        } catch (e) { return errorOf(e) }
      })

      // POST insert
      app.post(base, async (req: Request, ctx: never): Promise<Response> => {
        try {
        await opts.hooks?.beforeInsert?.(await parseBody(req).catch(() => ({})) as Record<string, unknown>, req, ctx)
        const data = await parseBody(req)
        const t = ctxTable(ctx) as { insert: (v: unknown) => { returning: (...c: string[]) => { run: () => Promise<Record<string, unknown>[]> } } }
        // 校验与映射单源：ctxTable.insert 内部（注入+insertSchema.format+toDb）——rest 只传 data
        // （API 边界校验错误 → 400 语义——catch 映射）
        const rows = await t.insert(data).returning(...dbCols).run()
        return Response.json(stripHidden(rows[0] ?? {}), { status: 201 })
        } catch (e) { return errorOf(e) }
      })

      // PATCH update
      app.patch(`${base}/:id`, async (req: Request, ctx: never): Promise<Response> => {
        try {
        const id = (ctx as { params: Record<string, string> }).params.id
        await opts.hooks?.beforeUpdate?.(id, await parseBody(req).catch(() => ({})) as Record<string, unknown>, req, ctx)
        const data = await parseBody(req)
        const t = ctxTable(ctx) as { update: (v: unknown) => { where: (w: Record<string, unknown>) => { returning: (...c: string[]) => { run: () => Promise<Record<string, unknown>[]> } } } }
        // 校验与映射单源：ctxTable.update 内部（patch schema+toDb+scope where 并入）
        const rows = await t.update(data).where({ [pkField]: { eq: id } }).returning(...dbCols).run()
        if (!rows.length) return Response.json({ error: 'not found' }, { status: 404 })
        return Response.json(stripHidden(rows[0]))
        } catch (e) { return errorOf(e) }
      })

      // DELETE
      app.delete(`${base}/:id`, async (req: Request, ctx: never): Promise<Response> => {
        try {
        const id = (ctx as { params: Record<string, string> }).params.id
        await opts.hooks?.beforeDelete?.(id, req, ctx)
        const t = ctxTable(ctx) as { select: (...c: string[]) => { where: (w: Record<string, unknown>) => { limit: (n: number) => { run: () => Promise<Record<string, unknown>[]> } } }; delete: () => { where: (w: Record<string, unknown>) => { run: () => Promise<unknown> } } }
        const rows = await t.select(...dbCols).where({ [pkField]: { eq: id } }).limit(1).run()
        if (!rows.length) return Response.json({ error: 'not found' }, { status: 404 })
        await t.delete().where({ [pkField]: { eq: id } }).run()
        return new Response(null, { status: 204 })
        } catch (e) { return errorOf(e) }
      })
    },
  }
}
