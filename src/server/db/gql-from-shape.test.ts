/**
 * gqlFromShape 契约（W6：shape→GraphQL 生成器）
 *
 * 锁定：
 * - SDL 生成（类型/Filter 输入/Sort 枚举/Insert/Patch/Query/Mutation——快照断言）
 * - resolver 桥执行（内置链路：makeExecutableSchema + graphql 执行——
 *   list/one/filter 算子/排序分页/insert/update/delete——MemorySql 引擎（W3b：wire 消亡））
 * - 租户 scope（tenant 自动注入——跨租户隔离）
 * - 校验面（insertSchema 校验错误——GraphQL 错误上抛）
 */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { graphql } from 'graphql'
import { MemorySql, createMemoryOrm } from './memory-sql.ts'
import { AGENT_PLATFORM_SCHEMA } from '../../../apps/agent-platform/src/db/tables.ts'
import { makeExecutableSchema } from '../make-executable-schema.ts'
import { gqlFromShape } from './gql-from-shape.ts'
import { shape, f } from './shape.ts'
import { z } from '../../shared/zod.ts'

const mem = new MemorySql()
mem.applySchema(AGENT_PLATFORM_SCHEMA)
const db = createMemoryOrm(mem)
before(async () => {
  await db.orm.query.insert('agents').rows([
    { id: '11111111-1111-4111-8111-111111111111', app_id: 'a1000000-0000-4000-8000-000000000001', name: '甲', type: 'user' },
  ]).run()
})

const Departments = shape({
  table: 'departments',
  fields: {
    id: f.pk(z.uuid()),
    appId: f.req(f.col(z.uuid(), 'app_id')),
    name: f.req(z.string()),
    isDm: f.col(z.boolean(), 'is_dm').meta({ default: false, notNull: true }),
    createdAt: f.col(f.now(z.date()), 'created_at'),
  },
})

const gqlDef = gqlFromShape(Departments, {
  tenant: { field: 'appId', value: (ctx: any) => ctx.appId },
})
const schema = makeExecutableSchema({ typeDefs: gqlDef.typeDefs, resolvers: gqlDef.resolvers })
const ctx = { orm: db.orm, appId: 'a1000000-0000-4000-8000-000000000001' }
async function run(source: string, variableValues: Record<string, unknown> = {}) {
  const r = await graphql({ schema, source, variableValues, contextValue: ctx })
  if (r.errors) throw new Error(`[gql] ${r.errors.map((e) => e.message).join('; ')}`)
  return r.data as Record<string, any>
}

// ── SDL 快照 ──────────────────────────────────────────────

test('gql：SDL 生成结构（快照）', () => {
  const sdl = gqlDef.typeDefs
  assert.ok(sdl.includes(`type Departments {`), '类型')
  assert.ok(sdl.includes(`  id: String!`))
  assert.ok(sdl.includes(`  name: String!`))
  assert.ok(sdl.includes(`  isDm: Boolean!`))
  assert.ok(sdl.includes(`  createdAt: String!`))
  assert.ok(sdl.includes(`input DepartmentsNameFilter {`), '字段 filter 输入')
  assert.ok(sdl.includes(`  contains: String`))
  assert.ok(sdl.includes(`  ilike: String`), '字符串算子面')
  assert.ok(sdl.includes(`  isNull: Boolean`), '空值算子面')
  assert.ok(sdl.includes(`input DepartmentsFilter {`), '顶层 filter')
  assert.ok(sdl.includes(`  and: [DepartmentsFilter!]`), '组合面')
  assert.ok(sdl.includes(`enum DepartmentsSortField {`), '排序枚举')
  assert.ok(sdl.includes(`  isDm`))
  assert.ok(sdl.includes(`input DepartmentsInsertInput {`))
  assert.ok(sdl.includes(`  appId: String!`), 'insert 必填（非 auto）')
  const insInput = sdl.slice(sdl.indexOf('input DepartmentsInsertInput'), sdl.indexOf('input DepartmentsPatchInput'))
  assert.ok(!insInput.includes('  id:'), 'auto 列省略（id 不在 insert input）')
  assert.ok(insInput.includes('  name: String!'), 'insert 必填保留')
  assert.ok(sdl.includes('departmentsList(filter: DepartmentsFilter, sort: [DepartmentsSortInput!], limit: Int, offset: Int): [Departments!]!'), 'Query 签名')
  assert.ok(sdl.includes('departmentsOne(filter: DepartmentsFilter): Departments'))
  assert.ok(sdl.includes('departmentsInsert(data: DepartmentsInsertInput!): Departments!'))
  assert.ok(sdl.includes('departmentsUpdate(id: ID!, patch: DepartmentsPatchInput!): Departments'))
  assert.ok(sdl.includes('departmentsDelete(id: ID!): Departments'))
})

// ── resolver 执行（内置链路）───────────────────────────────

test('gql：insert + list + filter 算子', async () => {
  const ins = await run(`mutation { departmentsInsert(data: { appId: "a1000000-0000-4000-8000-000000000001", name: "技术部" }) { id name isDm } }`)
  assert.equal(ins.departmentsInsert.name, '技术部')
  assert.equal(ins.departmentsInsert.isDm, false)
  const list = await run(`query { departmentsList { id name isDm } }`)
  assert.ok(list.departmentsList.some((d: any) => d.name === '技术部'))
  const filtered = await run(`query { departmentsList(filter: { name: { contains: "技术" } }) { name } }`)
  assert.equal(filtered.departmentsList.length, 1)
  const one = await run(`query { departmentsOne(filter: { isDm: { eq: false } }) { name } }`)
  assert.ok(one.departmentsOne)
})

test('gql：租户 scope（跨租户注入）', async () => {
  // 租户外插入（直接 SQL——绕开 gql）
  await db.orm.query.insert('departments').values({ app_id: 'a2000000-0000-4000-8000-000000000002', name: '外租户部' }).run()
  const list = await run(`query { departmentsList { name } }`)
  assert.ok(!list.departmentsList.some((d: any) => d.name === '外租户部'), '跨租户不可见')
})

test('gql：排序 + 分页', async () => {
  await run(`mutation { departmentsInsert(data: { appId: "a1000000-0000-4000-8000-000000000001", name: "排序甲" }) { id } }`)
  await run(`mutation { departmentsInsert(data: { appId: "a1000000-0000-4000-8000-000000000001", name: "排序乙" }) { id } }`)
  const sorted = await run(`query { departmentsList(sort: [{ field: name, dir: desc }], limit: 2) { name } }`)
  const names = (sorted.departmentsList as { name: string }[]).map((d) => d.name)
  assert.equal(names.length, 2)
  assert.ok(names[0] >= names[1], 'desc 排序（倒序前大）')
})

test('gql：update + delete', async () => {
  const upd = await run(`mutation { departmentsUpdate(id: "x", patch: { name: "改名部" }) { id } }`, {})
  assert.equal(upd.departmentsUpdate, null) // 不存在 id → null
  const ins = await run(`mutation { departmentsInsert(data: { appId: "a1000000-0000-4000-8000-000000000001", name: "待删部" }) { id } }`)
  const id = (ins.departmentsInsert as { id: string }).id
  const del = await run(`mutation { departmentsDelete(id: "${id}") { name } }`)
  assert.equal((del.departmentsDelete as { name: string }).name, '待删部')
  const gone = await run(`query { departmentsOne(filter: { name: { eq: "待删部" } }) { id } }`)
  assert.equal(gone.departmentsOne, null)
})

test('gql：校验面（insert 缺必填——GraphQL 错误）', async () => {
  const r = await graphql({ schema, source: `mutation { departmentsInsert(data: { appId: "a1000000-0000-4000-8000-000000000001" }) { id } }`, contextValue: ctx })
  assert.ok(r.errors?.length, '缺 name 必填——GQL 层校验错误')
})

test('gql：one 多条件 and 组合', async () => {
  const r = await run(`query { departmentsList(filter: { and: [{ name: { contains: "技术" } }, { isDm: { eq: false } }] }) { name } }`)
  assert.ok(r.departmentsList.length >= 1)
})

// ── 盲区补测（W5 平台试点暴露——enum 面 + nullable insert input） ──
// agents 面（DDL 对齐：type enum + model/avatar_url nullable——W5 试点同构）
const Agents = shape({
  table: 'agents',
  fields: {
    id: f.pk(z.uuid()),
    app_id: f.req(z.uuid()),
    name: f.req(z.string()),
    type: f.req(z.enum(['ai', 'user', 'webhook', 'knowledge_base', 'department'])),
    model: z.string().nullable(),
  },
})
const agentsGql = gqlFromShape(Agents, { tenant: { field: 'app_id', value: (c: any) => c.appId } })
const agentsSchema = makeExecutableSchema({ typeDefs: agentsGql.typeDefs, resolvers: agentsGql.resolvers })
async function runAgents(source: string) {
  const r = await graphql({ schema: agentsSchema, source, contextValue: ctx })
  if (r.errors) throw new Error(`[gql] ${r.errors.map((e) => e.message).join('; ')}`)
  return r.data as Record<string, any>
}

test('gql：enum 列——字面量输入（不带引号）+ 输出序列化 + 过滤面', async () => {
  const ins = await runAgents(`mutation { agentsInsert(data: { app_id: "a1000000-0000-4000-8000-000000000001", name: "enum甲", type: ai }) { id type } }`)
  assert.equal((ins.agentsInsert as { type: string; name: string }).type, 'ai', '输出序列化')
  const list = await runAgents(`query { agentsList(filter: { type: { eq: ai } }) { name type } }`)
  assert.ok((list.agentsList as { type: string; name: string }[]).some((a) => a.name === 'enum甲'), 'enum 过滤面')
  // 字符串输入 ≠ enum 字面量（GraphQL 规范）——执行错误
  const r = await graphql({ schema: agentsSchema, source: `mutation { agentsInsert(data: { app_id: "a1000000-0000-4000-8000-000000000001", name: "bad", type: "ai" }) { id } }`, contextValue: ctx })
  assert.ok(r.errors?.length, 'StringValue 不能表示 enum——规范错误')
})

test('gql：nullable 列 insert input 可缺省（DB NULL——对齐 insertSchema）', async () => {
  const ins = await runAgents(`mutation { agentsInsert(data: { app_id: "a1000000-0000-4000-8000-000000000001", name: "null甲", type: ai }) { name model } }`)
  assert.equal((ins.agentsInsert as { model: string | null }).model, null, '缺省 → NULL')
})

test('gql：租户列 insert 可缺省（服务端自动注入——SDL 不强制）', async () => {
  // app_id 不传（tenant 注入面）——insert 成功 + 归属当前租户
  const ins = await runAgents(`mutation { agentsInsert(data: { name: "注入甲", type: ai }) { name app_id } }`)
  assert.equal((ins.agentsInsert as { app_id: string }).app_id, 'a1000000-0000-4000-8000-000000000001', '服务端注入')
  const sdl = agentsGql.typeDefs
  const inputBlock = sdl.split('\n')
  const start = inputBlock.findIndex((l) => l.includes('input AgentsInsertInput')) + 1
  const block = inputBlock.slice(start, start + 40).join('\n')
  const appLine = block.split('\n').find((l) => l.trim().startsWith('app_id:'))
  assert.ok(appLine && !appLine.includes('!'), `租户列非 required——实际: ${appLine}`)
})

test('gql：type 面 nullable 列可空（model 输出 String 非 String!）', () => {
  const sdl = agentsGql.typeDefs
  const line = sdl.split('\n').find((l) => l.includes('model:'))
  assert.ok(line && /model: String(\n|$)/.test(line.trim()), 'nullable 列无 !')
})
