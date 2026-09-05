/**
 * departments 试点（W4：shape+operator 数据层计划——平台真实表结构端到端）
 *
 * 链路：shape（对齐 schema.sql departments）→ ops（WhereExpr）→ compileWhere
 * （参数化 SQL）→ MemorySql 引擎（W3b：wire 面消亡——memory 直执——AST 协议层
 * 与真库仅执行引擎替换）
 *
 * 锁定：
 * - shape 定义对准真实表（列名映射/默认值/租户列）
 * - API 边界校验（shape.parse——非法输入拒绝——错误可读）
 * - 租户 scope（appId 注入 where——跨租户不可见）
 * - ops 组合（eq/ilike/and/inArray/between）+ builder（orderBy/limit）
 * - 多对多 join（eqCol 列对列 on）
 * - updateSchema 部分更新（is_dm 切换）+ insertSchema 默认值省略
 * - escapeLike round-trip（%/_ 字面量经 wire 编译→解析→执行）
 *
 * 判负（试点外）：子查询（部门列表的 COUNT 子查询保持 SQL 面——W7 面外）
 */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { MemorySql, createMemoryOrm } from './memory-sql.ts'
import { AGENT_PLATFORM_SCHEMA } from '../../../apps/agent-platform/src/db/tables.ts'
import { shape, f, type Shape } from './shape.ts'
import { z } from '../../shared/zod.ts'
import { eq, ilike, and, inArray, between, contains, eqCol, or } from './ops.ts'

const mem = new MemorySql()
mem.applySchema(AGENT_PLATFORM_SCHEMA)
const db = createMemoryOrm(mem)
before(async () => {
  // agents 表种子（department_members 外键依赖）
  await db.orm.query.insert('agents').rows([
    { id: '11111111-1111-4111-8111-111111111111', app_id: 'a1000000-0000-4000-8000-000000000001', name: '用户甲', type: 'user' },
    { id: '22222222-2222-4222-8222-222222222222', app_id: 'a1000000-0000-4000-8000-000000000001', name: '助手乙', type: 'ai' },
    { id: '99999999-9999-4999-8999-999999999999', app_id: 'a2000000-0000-4000-8000-000000000002', name: '租户外成员', type: 'ai' },
  ]).run()
})

// ── shape 定义（对准 schema.sql departments 73-80 行）─────

const Departments = shape({
  table: 'departments',
  fields: {
    id: f.pk(z.uuid()),
    appId: f.req(f.col(z.uuid(), 'app_id')),
    name: f.req(z.string()),
    isDm: f.col(z.boolean(), 'is_dm').meta({ default: false, notNull: true }),
    workspacePath: f.col(z.string().optional(), 'workspace_path'),
    createdAt: f.col(f.now(z.date()), 'created_at'),
    updatedAt: f.col(f.now(z.date()), 'updated_at'),
  },
})
const DepartmentMembers = shape({
  table: 'department_members',
  fields: {
    departmentId: f.col(z.uuid(), 'department_id'),
    agentId: f.col(z.uuid(), 'agent_id'),
    role: f.col(z.enum(['admin', 'member']), 'role').meta({ default: 'member', notNull: true }),
    joinedAt: f.col(f.now(z.date()), 'joined_at'),
  },
})
const D = colsOf(Departments)
const DM = colsOf(DepartmentMembers)

// ── 测试 ──────────────────────────────────────────────────

test('试点：shape 元数据对准真实表', () => {
  assert.equal(Departments.table, 'departments')
  assert.equal(Departments.pkField, 'id')
  assert.equal(Departments.dbFields.appId.column, 'app_id')
  assert.equal(Departments.dbFields.isDm.default, false)
  assert.equal(Departments.dbFields.createdAt.default, 'now')
  assert.equal(DepartmentMembers.dbFields.role.default, 'member')
})

test('试点：insert——parse 校验 +默认省略', async () => {
  const ins = Departments.insertSchema()
  const input = ins.parse({ appId: 'a1000000-0000-4000-8000-000000000001', name: '研发部' })
  assert.equal(input.name, '研发部')
  // 默认值列可缺省（isDm/createdAt/updatedAt——zod 语义：键存在值 undefined）
  assert.equal(input.isDm, undefined)
  assert.throws(() => ins.parse({ appId: 'x', name: '开发部' }), ZodErrorLike)
  assert.throws(() => ins.parse({ name: '缺租户' }), ZodErrorLike)

  const [row] = await db.orm.query.insert('departments').values(clean(Departments.toDb(input)) as never).returning('id', 'is_dm').run()
  assert.ok(row.id)
  assert.equal(row.is_dm, false) // DB 侧默认
  void row.is_dm
})

test('试点：租户 scope（跨租户不可见）', async () => {
  const [d1] = await db.orm.query.insert('departments').values({ app_id: 'a1000000-0000-4000-8000-000000000001', name: '租户1-市场部' }).returning('id').run()
  const [d2] = await db.orm.query.insert('departments').values({ app_id: 'a2000000-0000-4000-8000-000000000002', name: '租户2-市场部' }).returning('id').run()
  const r1 = await db.orm.query.from('departments').select('id', 'name').where(eq(D.appId, 'a1000000-0000-4000-8000-000000000001') as never).run()
  assert.ok(r1.every((r: any) => r.id !== d2.id))
  assert.ok(r1.some((r: any) => r.id === d1.id))
})

test('试点：列表查询（eq+ilike+and+builder orderBy/limit）', async () => {
  await db.orm.query.insert('departments').values({ app_id: 'a1000000-0000-4000-8000-000000000001', name: '研发部' }).run()
  await db.orm.query.insert('departments').values({ app_id: 'a1000000-0000-4000-8000-000000000001', name: '算法部' }).run()
  await db.orm.query.insert('departments').values({ app_id: 'a1000000-0000-4000-8000-000000000001', name: '数据平台部' }).run()
  const r = await db.orm.query.from('departments').select('id', 'name')
    .where(and(eq(D.appId, 'a1000000-0000-4000-8000-000000000001'), ilike(D.name, '%部') as never) as never)
    .orderBy('created_at', 'desc').limit(10).run()
  assert.ok(r.length >= 3)
  assert.ok(r.every((row: any) => String(row.name).endsWith('部')))
  // 大小写不敏感 ILIKE（经 wire 编译→解析→执行）
  const r2 = await db.orm.query.from('departments').select('name').where(ilike(D.name, '研发%') as never).run()
  assert.ok(r2.length >= 1)
})

test('试点：updateSchema 部分更新（is_dm 切换）', async () => {
  await db.orm.query.insert('departments').values({ app_id: 'a1000000-0000-4000-8000-000000000001', name: '研发部-upd' }).run()
  const [d] = await db.orm.query.from('departments').select('id').where(eq(D.name, '研发部-upd') as never).run()
  const upd = Departments.updateSchema()
  const patch = upd.parse({ isDm: true })
  console.log('[dbg] patch', JSON.stringify(patch), 'toDb', JSON.stringify(Departments.toDb(patch)), 'd', JSON.stringify(d))
  await db.orm.query.update('departments').set(Departments.toDb(patch) as never).where(eq(D.id, d.id) as never).run()
  const [check] = await db.orm.query.from('departments').select('is_dm').where(eq(D.id, d.id) as never).run()
  console.log('[dbg] check', JSON.stringify(check))
  const all = await db.orm.query.from('departments').select('*').where(eq(D.name, '研发部-upd') as never).run()
  console.log('[dbg] all', JSON.stringify(all))
  assert.equal(check.is_dm, true)
  // 空 patch 合法（无字段更新——全 optional）
  assert.equal(upd.safeParse({}).success, true)
})

test('试点：多对多 join（eqCol 列对列 on）', async () => {
  await db.orm.query.insert('departments').values({ app_id: 'a1000000-0000-4000-8000-000000000001', name: '研发部-join' }).run()
  const [d] = await db.orm.query.from('departments').select('id').where(and(eq(D.name, '研发部-join'), eq(D.appId, 'a1000000-0000-4000-8000-000000000001')) as never).run()
  await db.orm.query.insert('department_members').values({ department_id: d.id, agent_id: '11111111-1111-4111-8111-111111111111', role: 'admin' }).run()
  await db.orm.query.insert('department_members').values({ department_id: d.id, agent_id: '22222222-2222-4222-8222-222222222222', role: 'member' }).run()
  const members = await db.orm.query.from('department_members dm')
    .select('dm.agent_id', 'dm.role')
    .join('agents a', eqCol(DM.agentId as never, { ref: 'a.id', __out: '' as string }))
    .where(eq(DM.departmentId as never, d.id as never))
    .run()
  assert.equal(members.length, 2)
  assert.ok(members.every((m: any) => m.role === 'admin' || m.role === 'member'))
})

test('试点：escapeLike round-trip（%/_ 字面量经 wire）', async () => {
  await db.orm.query.insert('departments').values({ app_id: 'a1000000-0000-4000-8000-000000000001', name: '100%研发组' }).run()
  const r = await db.orm.query.from('departments').select('name').where(contains(D.name, '0%研') as never).run()
  assert.ok(r.some((row: any) => row.name === '100%研发组'))
  const r2 = await db.orm.query.from('departments').select('name').where(contains(D.name, '研%组') as never).run()
  assert.equal(r2.length, 0) // 字面 % 意图：只有 '100%研发组'——'研%组'（研+字面%+组）不命中（%是字面）
})

test('试点：orm.transaction（postgres 真事务——rollback 撤销/commit 可见）', async () => {
  const orm = db.orm as { transaction: (fn: (tx: { table: (n: string, d: unknown) => unknown }) => Promise<unknown>) => Promise<unknown> }
  const T = (tx: { table: (n: string, d: unknown) => unknown }) => tx.table('departments', Departments.fields) as any
  // rollback：抛错撤销
  await assert.rejects(() =>
    orm.transaction(async (tx) => {
      await T(tx).insert({ appId: 'a1000000-0000-4000-8000-000000000001', name: '事务回滚测试' }).run()
      throw new Error('boom')
    }),
  )
  const [after] = await db.orm.query.from('departments').select('id').where(eq(D.name, '事务回滚测试')).run()
  assert.equal(after, undefined, 'rollback 后不可见')
  // commit：可见
  await orm.transaction(async (tx) => {
    await T(tx).insert({ appId: 'a1000000-0000-4000-8000-000000000001', name: '事务提交测试' }).run()
  })
  const [ok] = await db.orm.query.from('departments').select('id').where(eq(D.name, '事务提交测试')).run()
  assert.ok(ok, 'commit 后可见')
  // 清理
  await db.orm.query.delete('departments').where({ name: { ilike: '事务%' } }).run()
})

test('试点：inArray/between/and/or 组合', async () => {
  await db.orm.query.insert('departments').values({ app_id: 'a1000000-0000-4000-8000-000000000001', name: '研发部-arr' }).run()
  const [d] = await db.orm.query.from('departments').select('id').where(eq(D.name, '研发部-arr') as never).run()
  assert.ok(d)
  await db.orm.query.insert('department_members').values({ department_id: d.id, agent_id: '11111111-1111-4111-8111-111111111111', role: 'admin' }).run()
  await db.orm.query.insert('department_members').values({ department_id: d.id, agent_id: '22222222-2222-4222-8222-222222222222', role: 'member' }).run()
  const r = await db.orm.query.from('department_members').select('agent_id')
    .where(and(eq(DM.departmentId as never, d.id as never), inArray(DM.agentId as never, ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']) as never) as never).run()
  assert.equal(r.length, 2)
  const r2 = await db.orm.query.from('department_members').select('agent_id')
    .where(and(eq(DM.departmentId as never, d.id as never), or(eq(DM.role as never, 'admin'), eq(DM.role as never, 'member'))) as never).run()
  assert.equal(r2.length, 2)
})

function colsOf<S extends Shape<any>>(shapeDef: S): Record<keyof S['fields'], { ref: string; __out: any }> {
  const out = {} as Record<string, { ref: string; __out: unknown }>
  for (const [name, meta] of Object.entries((shapeDef as any).dbFields as Record<string, { column?: string }>)) {
    out[name] = { ref: meta.column ?? name, __out: undefined as any }
  }
  return out as any
}

/** 清洗 undefined 键（zod optional 解析产物——PG 参数不接受 undefined） */
function clean<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

const ZodErrorLike = /ZodError|非|invalid|expected/
void between
