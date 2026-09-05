/**
 * W0 契约：filterToWhere 共享桥 + fieldPolicy.hidden（命名契约落地）
 *
 * - filterToWhere：字段→列映射 · and/or 递归 · 算子转译（contains→ilike 转义）
 *   · 单 eq 特判 · 空值跳过——gql/rest 三面共享单源（提取等价——不改变
 *   既有 gql 行为）
 * - fieldPolicy.hidden：SDL 不生成（字段/Filter/Sort/Insert/Patch）+
 *   resolver 不返回（双向防护——敏感列豁免）
 */
import assert from 'node:assert/strict'
import { test, before } from 'node:test'
import { graphql } from 'graphql'
import { MemorySql, createMemoryOrm } from './memory-sql.ts'
import { makeExecutableSchema } from '../make-executable-schema.ts'
import { gqlFromShape } from './gql-from-shape.ts'
import { filterToWhere } from './filter.ts'
import { shape, f } from './shape.ts'
import { z } from '../../shared/zod.ts'

// ── filterToWhere 共享桥 ──────────────────────────────────

const Dept = shape({
  table: 'departments',
  fields: {
    id: f.pk(z.uuid()),
    appId: f.req(f.col(z.uuid(), 'app_id')),
    name: f.req(z.string()),
    isDm: f.col(z.boolean(), 'is_dm').meta({ default: false, notNull: true }),
  },
})

test('filterToWhere：字段→列映射 + 算子转译 + and/or 递归 + 空值跳过', () => {
  // 字段→列映射（appId → app_id）
  assert.deepEqual(filterToWhere({ appId: { eq: 'x' } }, Dept), { app_id: { eq: 'x' } })
  // contains→ilike 转义（% _ \ 反斜杠）
  assert.deepEqual(filterToWhere({ name: { contains: '50%_off' } }, Dept), {
    name: { ilike: '%50\\%\\_off%' },
  })
  // 单 eq 特判（组合式 path）
  assert.deepEqual(filterToWhere({ id: { eq: 'a', ne: 'b' } }, Dept), { id: { ne: 'b', eq: 'a' } })
  // and/or 递归
  const w = filterToWhere({ and: [{ id: { eq: 'x' } }, { or: [{ name: { eq: 'n' } }, { name: { eq: 'm' } }] }] }, Dept)
  assert.deepEqual(w, { and: [{ id: { eq: 'x' } }, { or: [{ name: { eq: 'n' } }, { name: { eq: 'm' } }] }] })
  // I1（W1）：eq:null → isNull 判空（O1 对齐——组合面 eq:null + contains 并存）
  assert.deepEqual(filterToWhere({ name: { eq: null, contains: 'a' } }, Dept), { name: { isNull: true, ilike: '%a%' } })
  // 纯 eq:null → 单键 isNull
  assert.deepEqual(filterToWhere({ name: { eq: null } }, Dept), { name: { isNull: true } })
  // undefined 跳过（无值是「没传」——不入 WhereExpr）
  assert.deepEqual(filterToWhere({ name: { contains: 'a', ne: undefined } }, Dept), { name: { ilike: '%a%' } })
  // null filter → {}
  assert.deepEqual(filterToWhere(null, Dept), {})
})

// ── fieldPolicy.hidden（gql 面）────────────────────────────

const Secret = shape({
  table: 'secrets',
  fields: {
    id: f.pk(z.uuid()),
    name: f.req(z.string()),
    apiKey: f.req(f.col(z.string(), 'api_key')),
    appId: f.req(f.col(z.uuid(), 'app_id')),
  },
})

const gqlDef = gqlFromShape(Secret, { hidden: ['apiKey'] })
const schema = makeExecutableSchema({ typeDefs: gqlDef.typeDefs, resolvers: gqlDef.resolvers })
const mem = new MemorySql()
mem.applySchema({ tables: [{ name: 'secrets', columns: { id: z.string(), name: z.string(), api_key: z.string(), app_id: z.string() } }] })
const db = createMemoryOrm(mem)
before(async () => {
  const orm = db.orm
  orm.table('secrets', { id: z.string(), name: z.string(), api_key: z.string(), app_id: z.string() })
  await orm.table('secrets').insert({ id: 's1', name: 'k1', api_key: 'SECRET-1', app_id: 'a1' }).run()
})
async function run(source: string, variableValues: Record<string, unknown> = {}) {
  const r = await graphql({ schema, source, variableValues, contextValue: { orm: db.orm } })
  if (r.errors) throw new Error(`[gql] ${r.errors.map((e) => e.message).join('; ')}`)
  return r.data as Record<string, any>
}

test('hidden：SDL 全面不出现（类型/Filter/Sort/Insert/Patch）', () => {
  const sdl = gqlDef.typeDefs
  assert.ok(!sdl.includes('apiKey'), '字段不出现在类型')
  assert.ok(!sdl.includes('apiKeyFilter'), 'Filter 不生成')
  assert.ok(!sdl.includes('apiKey'), 'Sort 枚举不含')
  assert.ok(!sdl.includes('secretsApiKey'), 'Insert/Patch 不含')
  assert.ok(sdl.includes('name: String!'), '非 hidden 字段保留')
})

test('hidden：resolver 不返回（list 叶子剔除——双向防护）', async () => {
  const data = await run('{ secretsList { id name } }')
  assert.ok(data.secretsList.length >= 1)
  assert.ok(!('apiKey' in data.secretsList[0]))
})

// ── W1：一致性收口（I1 eq:null 双端 / I2 多字段排序 / I3 租户自动注入） ──

const Sortable = shape({
  table: 'sortables',
  fields: {
    id: f.pk(z.uuid()),
    grp: f.req(z.string()),
    seq: f.req(z.number().int()),
    tag: z.string().nullable(),
  },
})

const mem2 = new MemorySql()
mem2.applySchema({ tables: [{ name: 'sortables', columns: { id: z.string(), grp: z.string(), seq: z.number().int(), tag: z.string().nullable() } }] })
const db2 = createMemoryOrm(mem2)
const orm2 = db2.orm
orm2.table('sortables', { id: z.string(), grp: z.string(), seq: z.number().int(), tag: z.string().nullable() })
await orm2.query.insert('sortables').rows([
  { id: 'a1', grp: 'b', seq: 1, tag: null },
  { id: 'a2', grp: 'a', seq: 2, tag: 'x' },
  { id: 'a3', grp: 'a', seq: 1, tag: 'y' },
]).run()

const sortGql = gqlFromShape(Sortable)
const sortSchema = makeExecutableSchema({ typeDefs: sortGql.typeDefs, resolvers: sortGql.resolvers })
async function runS(source: string, variableValues: Record<string, unknown> = {}) {
  const r = await graphql({ schema: sortSchema, source, variableValues, contextValue: { orm: orm2 } })
  if (r.errors) throw new Error(`[gql] ${r.errors.map((e) => e.message).join('; ')}`)
  return r.data as Record<string, any>
}

test('W1/I1：filter eq:null 与 isNull:true 双端等价（O1 对齐——真实求值）', async () => {
  const a = await runS('{ sortablesList(filter: { tag: { eq: null } }) { id } }')
  const b = await runS('{ sortablesList(filter: { tag: { isNull: true } }) { id } }')
  assert.deepEqual(
    (a.sortablesList as { id: string }[]).map((r) => r.id).sort(),
    (b.sortablesList as { id: string }[]).map((r) => r.id).sort(),
  )
  assert.deepEqual((a.sortablesList as { id: string }[]).map((r) => r.id), ['a1'])
})

test('W1/I2：多字段排序链（SDL [SortInput!] 数组真实化——旧实现只排 sort[0]）', async () => {
  const data = await runS('{ sortablesList(sort: [{ field: grp, dir: asc }, { field: seq, dir: desc }]) { id } }')
  // grp asc → a 组前；a 组内 seq desc → a2(2) 在 a3(1) 前——链式 orderBy 顺序语义
  assert.deepEqual((data.sortablesList as { id: string }[]).map((r) => r.id), ['a2', 'a3', 'a1'])
})

test('W1/I3：orm.gql 自动派生 tenant（createOrm.tenant 单源——gql 面不可绕过租户）', async () => {
  const { createOrm, memoryAdapter } = await import('./orm.ts')
  const mem3 = new MemorySql()
  mem3.applySchema({ tables: [{ name: 't3', columns: { id: z.string(), app_id: z.string(), name: z.string() } }] })
  const orm3 = createOrm(memoryAdapter(mem3), { field: 'app_id', value: (c) => (c as { appId?: string })?.appId })
  orm3.table('t3', { id: z.string(), app_id: z.string(), name: z.string() })
  await orm3.table('t3').insert([{ id: 't1', app_id: 'app-1', name: 'one' }, { id: 't2', app_id: 'app-2', name: 'two' }]).run()
  // orm.gql 不传 tenant——createOrm.tenant 自动派生（opts 显式优先——覆盖面保留）
  const g = orm3.gql(orm3.table('t3') as never) as { typeDefs: string; resolvers: Record<string, Record<string, unknown>> }
  const sc = makeExecutableSchema({ typeDefs: g.typeDefs, resolvers: g.resolvers })
  const r = await graphql({ schema: sc, source: '{ t3List { id name } }', contextValue: { orm: orm3, appId: 'app-1' } })
  if (r.errors) throw new Error(`[gql] ${r.errors.map((e) => e.message).join('; ')}`)
  const rows = (r.data as { t3List: { id: string }[] }).t3List
  assert.deepEqual(rows.map((x) => x.id), ['t1'], '租户 scope 自动注入——app-2 行不可见')
})
