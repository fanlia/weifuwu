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
  // 空值跳过（undefined/null 不入 WhereExpr）
  assert.deepEqual(filterToWhere({ name: { eq: null, contains: 'a' } }, Dept), { name: { ilike: '%a%' } })
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
