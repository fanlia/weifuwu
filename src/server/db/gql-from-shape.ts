/**
 * weifuwu/gql —— gqlFromShape：shape → GraphQL 生成器（纯函数）
 *
 * shape（数据"是什么"）→ SDL 字符串 + resolver 桥（filter 参数 → WhereExpr 算子）
 * 输出即内置接口输入（graphql() 的 schema/resolvers——makeExecutableSchema 链路）
 *
 * 生成面（W6 首版·诚实边界见 plan 判负记录）：
 *   - Query:  list(filter/sort/limit/offset) · one(filter)
 *   - Mutation: insert(data) · update(id,patch) · delete(id)
 *   - 类型：string/uuid→String·number→Float·boolean→Boolean·date→String(ISO)·
 *     enum/literal→GraphQL enum·array→[T!]·optional→可空
 *   - Filter：每字段输入对象（eq/ne/gt/gte/lt/lte/in/notIn/isNull/contains/ilike/
 *     startsWith/endsWith——按列类型裁剪）+ and/or 组合
 *   - Sort：[{ field: enum!, dir: enum }]
 *   - 租户 scope：tenant 配置自动注入 where/insert（上下文 appId）
 * 判负（后续再议）：关系面（JOIN/嵌套对象——非 W6）·json 字段（String 序列化）·
 *   复杂 mutation（批量/upsert/事务）·uuid→ID 映射（String 面）
 */
import { type Shape } from './shape.ts'
import { filterToWhere } from './filter.ts'
import {
  z, ZodString, ZodNumber, ZodBoolean, ZodDate, ZodEnum, ZodLiteral, ZodArray,
  ZodVector, ZodOptional, ZodNullable, ZodDefault, ZodTransform, ZodEffects,
  type ZodType, type ZodRawShape,
} from '../../shared/zod.ts'

// ── 类型面 ────────────────────────────────────────────────

export interface GqlShapeOptions {
  /** 生成类型名（默认表名 PascalCase） */
  name?: string
  /** 执行面取数（默认 ctx.orm——协议层 = AST；orm.gql 内部绑定 ormBase） */
  sql?: (ctx: unknown) => unknown
  /** 租户 scope：字段名 + 上下文取值（自动注入 where/insert——跨租户隔离；
   *  与 OrmTenant.value 同签名——undefined=无值（不注入） */
  tenant?: { field: string; value: (ctx: unknown) => string | undefined }
  /** 默认分页上限（默认 100） */
  maxLimit?: number
  /** 字段策略（命名契约 W0——fieldPolicy 首版）：敏感列豁免——
   *  SDL 不生成（字段/Filter/Sort/Insert/Patch 全不出现）+ resolver 不返回 */
  hidden?: string[]
}

export interface GqlShapeOutput {
  typeDefs: string
  resolvers: Record<string, Record<string, (...args: any[]) => any>>
}

// ── 类型映射 ──────────────────────────────────────────────

/** 剥壳（optional/nullable/default/refine/transform——取内层实体） */
function unwrap(schema: ZodType): ZodType {
  let s = schema as ZodType
  for (;;) {
    if (s instanceof ZodOptional || s instanceof ZodNullable || s instanceof ZodDefault || s instanceof ZodEffects) {
      s = (s as any).inner as ZodType
    } else if (s instanceof ZodTransform) {
      s = (s as any).inner as ZodType
    } else break
  }
  return s
}

function isOptional(schema: ZodType): boolean {
  return schema instanceof ZodOptional || schema instanceof ZodDefault
}

function pascal(s: string): string {
  return s.replace(/[-_](.)/g, (_, c: string) => c.toUpperCase()).replace(/^(.)/, (c) => c.toUpperCase())
}

/** zod → GraphQL 类型名（含自注册 enum）；不支持 → null（过滤/字段跳过） */
function zodToGql(
  schema: ZodType,
  enumName: string,
  enumNames: Set<string>,
  enumDefs: string[],
): string | null {
  const inner = unwrap(schema)
  if (inner instanceof ZodString || inner instanceof ZodDate) return 'String'
  if (inner instanceof ZodNumber) return 'Float'
  if (inner instanceof ZodBoolean) return 'Boolean'
  if (inner instanceof ZodLiteral) {
    if (!enumNames.has(enumName)) {
      enumNames.add(enumName)
      enumDefs.push(`enum ${enumName} { ${JSON.stringify(inner.value)} }`)
    }
    return enumName
  }
  if (inner instanceof ZodEnum) {
    if (!enumNames.has(enumName)) {
      enumNames.add(enumName)
      enumDefs.push(`enum ${enumName} { ${inner.values.join(' ')} }`)
    }
    return enumName
  }
  if (inner instanceof ZodArray) {
    const item = zodToGql(inner.itemSchema, `${enumName}Item`, enumNames, enumDefs)
    return item ? `[${item}!]` : null
  }
  // I5（W2）：vector → [Float!]（Infer=number[] 对齐——旧版静默跳过——字段从 SDL 消失不透明）
  if (inner instanceof ZodVector) return '[Float!]'
  // 嵌套对象/union——首版跳过（判负记录）
  return null
}

// ── 生成器 ────────────────────────────────────────────────

export function gqlFromShape<S extends ZodRawShape>(
  shapeDef: Shape<S>,
  opts: GqlShapeOptions = {},
): GqlShapeOutput {
  const name = opts.name ?? pascal(shapeDef.table)
  const enumNames = new Set<string>()
  const enumDefs: string[] = []
  const fieldDefs: string[] = []
  const filterDefs: string[] = []
  const sortEnums: string[] = []
  const insertDefs: string[] = []
  const patchDefs: string[] = []

  const hidden = new Set(opts.hidden ?? [])
  const isHidden = (fname: string) => hidden.has(fname)
  for (const [fname, fschema] of Object.entries(shapeDef.fields as Record<string, ZodType>)) {
    if (isHidden(fname)) continue
    const nullable = isOptional(fschema) ? '' : '!'
    const gql = zodToGql(fschema, `${name}${pascal(fname)}Enum`, enumNames, enumDefs)
    if (gql) fieldDefs.push(`  ${fname}: ${gql}${nullable}`)
    const inner = unwrap(fschema)
    const base = inner instanceof ZodString || inner instanceof ZodDate ? 'str'
      : inner instanceof ZodNumber ? 'num'
      : inner instanceof ZodBoolean ? 'bool'
      : null
    if (!base) {
      // I4（W2）：enum/literal 列 Filter（值面 GraphQL enum——旧版无过滤面——agents.type 类查询缺失）
      if (inner instanceof ZodEnum || inner instanceof ZodLiteral) {
        const enumType = zodToGql(fschema, `${name}${pascal(fname)}Enum`, enumNames, enumDefs)
        if (enumType) filterDefs.push(`input ${name}${pascal(fname)}Filter {\n  eq: ${enumType}\n  ne: ${enumType}\n  in: [${enumType}!]\n  notIn: [${enumType}!]\n  isNull: Boolean\n}`)
      }
      continue // 对象/数组——首版 filter 跳过（判负记录）
    }
    const ops: string[] = ['eq', 'ne', 'in', 'notIn', 'isNull']
    if (base === 'str') ops.push('contains', 'ilike', 'startsWith', 'endsWith')
    if (base === 'num') ops.push('gt', 'gte', 'lt', 'lte')
    const typeGql = base === 'num' ? 'Float' : base === 'bool' ? 'Boolean' : 'String'
    const innerDef = ops.map((op) => `  ${op}: ${op === 'in' || op === 'notIn' ? `[${typeGql}!]` : op === 'isNull' ? 'Boolean' : typeGql}`).join('\n')
    filterDefs.push(`input ${name}${pascal(fname)}Filter {\n${innerDef}\n}`)
    sortEnums.push(`  ${fname}`)
  }

  // insert/patch 变体字段（省略 auto 列 + hidden 列）
  for (const [fname, fschema] of Object.entries(shapeDef.fields as Record<string, ZodType>)) {
    if (isAuto(shapeDef, fname) || isHidden(fname)) continue
    const g = zodToGql(fschema, `${name}${pascal(fname)}Enum`, enumNames, enumDefs)
    if (!g) continue
    // insert 可选性同 insertSchema 规则：zod optional 或 DB 默认值列（可缺省）
    const insertOpt = isOptional(fschema) || shapeDef.dbFields[fname]?.default !== undefined
    insertDefs.push(`  ${fname}: ${g}${insertOpt ? '' : '!'}`)
    patchDefs.push(`  ${fname}: ${g}`)
  }

  // 顶层 Filter 引用只列支持过滤的字段（enum/对象/数组字段无 Filter 输入——不引用；hidden 列不可过滤）
  const filterable = Object.keys(shapeDef.fields as Record<string, unknown>).filter((f) => {
    if (isHidden(f)) return false
    const inner = unwrap((shapeDef.fields as Record<string, ZodType>)[f])
    return inner instanceof ZodString || inner instanceof ZodDate || inner instanceof ZodNumber || inner instanceof ZodBoolean
      || inner instanceof ZodEnum || inner instanceof ZodLiteral // I4：enum 列可过滤
  })

  const sdl = [
    `type ${name} {\n${fieldDefs.join('\n')}\n}`,
    ...enumDefs,
    ...filterDefs,
    `input ${name}Filter {\n${filterable.map((f) => `  ${f}: ${name}${pascal(f)}Filter`).join('\n')}\n  and: [${name}Filter!]\n  or: [${name}Filter!]\n}`,
    `enum ${name}SortField {\n${sortEnums.join('\n')}\n}`,
    `enum SortDir { asc desc }`,
    `input ${name}SortInput { field: ${name}SortField! dir: SortDir }`,
    `input ${name}InsertInput {\n${insertDefs.join('\n')}\n}`,
    `input ${name}PatchInput {\n${patchDefs.join('\n')}\n}`,
    `type Query {\n  ${lc(name)}List(filter: ${name}Filter, sort: [${name}SortInput!], limit: Int, offset: Int): [${name}!]!\n  ${lc(name)}One(filter: ${name}Filter): ${name}\n}`,
    `type Mutation {\n  ${lc(name)}Insert(data: ${name}InsertInput!): ${name}!\n  ${lc(name)}Update(id: ID!, patch: ${name}PatchInput!): ${name}\n  ${lc(name)}Delete(id: ID!): ${name}\n}`,
  ].join('\n\n')

  return { typeDefs: sdl, resolvers: buildResolvers(shapeDef, name, opts) }
}

function isAuto<S extends ZodRawShape>(shapeDef: Shape<S>, name: string): boolean {
  const m = shapeDef.dbFields[name]
  return m?.default === 'random' || m?.default === 'now'
}

function lc(s: string): string {
  return s.replace(/^(.)/, (c) => c.toLowerCase())
}

// ── resolver 桥（filter → WhereExpr——执行面复用 W3 契约）────────

function buildResolvers<S extends ZodRawShape>(
  shapeDef: Shape<S>,
  name: string,
  opts: GqlShapeOptions,
): GqlShapeOutput['resolvers'] {
  const table = shapeDef.table
  const pk = shapeDef.pkField ?? 'id'
  const hidden = new Set(opts.hidden ?? [])
  const cols = Object.keys(shapeDef.fields as Record<string, unknown>).filter((c) => !hidden.has(c))
  const dbCols = cols.map((c) => shapeDef.dbFields[c]?.column ?? c)
  // 列名映射 + hidden 剔除（声明面 + 返回面双保险——hidden 列不出现在任何叶子）
  const rowOf = (r: Record<string, unknown>) => {
    const out = (shapeDef as unknown as { fromDb: (x: Record<string, unknown>) => Record<string, unknown> }).fromDb(r)
    for (const h of hidden) delete out[h]
    return out
  }
  const sqlOf = opts.sql ?? ((ctx: unknown) => (ctx as { orm?: unknown }).orm)
  const tenantCol = opts.tenant ? (shapeDef.dbFields[opts.tenant.field]?.column ?? opts.tenant.field) : undefined

  function db(ctx: unknown): any {
    return (sqlOf(ctx) as { query: any }).query
  }

  /** filter 输入 → WhereExpr（W0：共享 filterToWhere——租户注入调用侧拼装——单源） */
  function whereFrom(filter: Record<string, unknown> | null | undefined, ctx?: unknown): Record<string, unknown> {
    const out = filterToWhere(filter, shapeDef)
    // 租户 scope 自动注入（先于 filter 处理——无 filter 也生效）
    if (tenantCol && ctx) {
      const v = opts.tenant!.value(ctx)
      if (v !== undefined && out[tenantCol] === undefined) out[tenantCol] = { eq: v }
    }
    return out
  }

  return {
    Query: {
      [`${lc(name)}List`]: async (_: unknown, args: Record<string, unknown>, ctx: unknown) => {
        const q = db(ctx).from(table).select(...dbCols)
        const where = whereFrom(args.filter as Record<string, unknown> | null, ctx)
        if (Object.keys(where).length) q.where(where)
        // I2（W1）：多字段排序链——SDL `[SortInput!]` 数组真实化（旧实现只取 sort[0]——声明-实现不一致）
        const sort = args.sort as { field: string; dir: string }[] | undefined
        if (sort?.length) for (const s of sort) q.orderBy(shapeDef.dbFields[s.field]?.column ?? s.field, s.dir === 'desc' ? 'desc' : 'asc')
        if (args.limit !== undefined && args.limit !== null) q.limit(Math.min(Number(args.limit), opts.maxLimit ?? 100))
        if (args.offset !== undefined && args.offset !== null) q.offset(Number(args.offset))
        const rows = await q.run()
        return (rows as Record<string, unknown>[]).map((r) => rowOf(r))
      },
      [`${lc(name)}One`]: async (_: unknown, args: Record<string, unknown>, ctx: unknown) => {
        const rows = await db(ctx).from(table).select(...dbCols)
          .where(whereFrom(args.filter as Record<string, unknown> | null, ctx)).limit(1).run()
        return rows[0] ? rowOf(rows[0]) : null
      },
    },
    Mutation: {
      [`${lc(name)}Insert`]: async (_: unknown, args: Record<string, unknown>, ctx: unknown) => {
        const data = (shapeDef as unknown as { insertSchema: () => { parse: (v: unknown) => Record<string, unknown> } }).insertSchema().parse(args.data)
        if (opts.tenant) {
          const v = opts.tenant.value(ctx)
          if (v !== undefined && data[opts.tenant.field] === undefined) data[opts.tenant.field] = v
        }
        const out = (shapeDef as unknown as { toDb: (r: Record<string, unknown>) => Record<string, unknown> }).toDb(data)
        const rows = await db(ctx).insert(table).values(out).returning(...dbCols).run()
        return rows[0] ? rowOf(rows[0]) : null
      },
      [`${lc(name)}Update`]: async (_: unknown, args: Record<string, unknown>, ctx: unknown) => {
        const patch = (shapeDef as unknown as { updateSchema: () => { parse: (v: unknown) => Record<string, unknown> } }).updateSchema().parse(args.patch)
        const set = (shapeDef as unknown as { toDb: (r: Record<string, unknown>) => Record<string, unknown> }).toDb(patch)
        const where = whereFrom({ [pk]: { eq: args.id } }, ctx)
        const rows = await db(ctx).update(table).set(set).where(where).returning(...dbCols).run()
        return rows[0] ? rowOf(rows[0]) : null
      },
      [`${lc(name)}Delete`]: async (_: unknown, args: Record<string, unknown>, ctx: unknown) => {
        const where = whereFrom({ [pk]: { eq: args.id } }, ctx)
        const rows = await db(ctx).from(table).select(...dbCols).where(where).run()
        if (!rows.length) return null
        await db(ctx).delete(table).where(where).run()
        return rowOf(rows[0])
      },
    },
  }
}
