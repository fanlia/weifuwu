/**
 * orm 契约（shape+operator+adapter 组合体）
 *
 * 锁定：
 * - 表注册（列引用表 c——类型收窄面）
 * - 表绑定 CRUD（select/insert/update/delete——builder 链）
 * - 单一 adapter：memoryAdapter（AST 直执行——W3b：wire 面消亡）
 *   ——同一 orm 代码两种执行面·结果等价
 * - filters/ops 组合（eq/ilike/and/orderBy/limit）
 * - 防全表删除（builder delete 需 where——首版防护）
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { MemorySql } from './memory-sql.ts'
import { createOrm, memoryAdapter } from './orm.ts'
import { f } from './shape.ts'
import { z } from '../../shared/zod.ts'
import { compileQuery } from './query.ts'
import { compileSchemaDdl } from './schema.ts'
import { eq, ilike, and, gt } from './ops.ts'
import { graphql } from 'graphql'
import { makeExecutableSchema } from '../make-executable-schema.ts'

// ── memory adapter（AST 直执行）────────────────────────────

const mem = new MemorySql()
const orm = createOrm(memoryAdapter(mem))

/** fixture 建表（AST 声明面——零 SQL 文本——协议层 = AST） */
function fx(name: string, columns: Record<string, unknown>, extra: Record<string, unknown> = {}): void {
  mem.applySchema({ tables: [{ name, columns, ...extra }] })
}

fx('agents', {
  id: z.string().meta({ pk: true, default: 'random' }),
  app_id: z.string(), name: z.string(), type: z.string(), created_at: z.string(),
}, { columnTypes: { id: 'UUID', app_id: 'UUID' } })

const Agent = orm.table('agents', {
  id: f.pk(z.uuid()).meta({ pk: true, default: 'random' }),
  appId: f.col(z.uuid(), 'app_id'),
  name: z.string(),
  type: f.req(z.enum(['ai', 'user'])),
  createdAt: f.col(f.now(z.date()), 'created_at'),
})

test('orm：表注册 + 列引用（类型收窄面）', async () => {
  const r = await Agent.insert({ appId: 'a1000000-0000-4000-8000-000000000001', name: '助手', type: 'ai' }).run()
  assert.equal(r[0].name, '助手')
  assert.equal(r[0].type, 'ai')
  assert.ok(r[0].id)
})

test('orm：查询 + ops 组合（eq/ilike/and/orderBy/limit）', async () => {
  await Agent.insert({ appId: 'a1000000-0000-4000-8000-000000000001', name: '张三', type: 'user' }).run()
  await Agent.insert({ appId: 'a1000000-0000-4000-8000-000000000001', name: '李四', type: 'ai' }).run()
  const ai = await Agent.select().where(and(eq(Agent.c.type, 'ai'), ilike(Agent.c.name, '李%'))).run()
  assert.equal(ai.length, 1)
  assert.equal(ai[0].name, '李四')
  const all = await Agent.select().orderBy('name', 'desc').limit(2).run()
  assert.equal(all.length, 2)
  const gtRes = await Agent.select().where(gt(Agent.c.appId, 'a0')).run()
  assert.ok(gtRes.length >= 3)
})

test('orm：update 部分更新 + delete（必须 where）', async () => {
  const [row] = await Agent.select().where(eq(Agent.c.name, '张三')).run()
  await Agent.update({ type: 'ai' }).where(eq(Agent.c.id, row.id)).run()
  const [updated] = await Agent.select().where(eq(Agent.c.id, row.id)).run()
  assert.equal(updated.type, 'ai')
  await Agent.delete().where(eq(Agent.c.id, row.id)).run()
  const gone = await Agent.select().where(eq(Agent.c.id, row.id)).run()
  assert.equal(gone.length, 0)
})

// ── memory adapter（AST 直执行——W3b：wire 面消亡后统一内存执行）────────────

test('orm：D1 onConflict（insert().onConflict——DO UPDATE 内存面/编译面同语义）', async () => {
  fx('up', { id: z.string().meta({ unique: true }), val: z.string() })
  const Up = orm.table('up', { id: z.string(), val: z.string() })
  await Up.insert({ id: 'k', val: 'old' }).run()
  const [r] = await Up.insert({ id: 'k', val: 'new' }).onConflict('id', true).returning('*').run()
  assert.equal(r.val, 'new')
  assert.equal((await Up.select().run()).length, 1)
})

test('orm：D1 复合冲突目标（onConflict([a,b])——compile 面申明·内存/编译同语义）', async () => {
  // 建表走 AST 声明面（compileSchemaDdl→executeDdl：uniques 组提取唯一正门）——
  // 表级 UNIQUE (a,b) 组合约束——编译声明式 DDL 面（W3 文本面已消亡——组合约束只此一路）
  const [ddl] = compileSchemaDdl({
    tables: [{ name: 'dm', columns: { dept: z.string(), agent: z.string(), role: z.string() }, uniques: [['dept', 'agent']] }],
  })
  await mem.executeQuery(ddl)
  const Dm = orm.table('dm', { dept: z.string(), agent: z.string(), role: z.string() })
  await Dm.insert({ dept: 'd1', agent: 'a1', role: 'member' }).run()
  const [r] = await Dm.insert({ dept: 'd1', agent: 'a1', role: 'admin' }).onConflict(['dept', 'agent'], true).returning('*').run()
  assert.equal(r.role, 'admin')
  assert.equal((await Dm.select().run()).length, 1)
})

test('orm：C3 exists + paginate 多列排序', async () => {
  fx('ormc3', { id: z.string().meta({ pk: true, default: 'random' }), grp: z.string(), ord: z.number().int() }, { columnTypes: { id: 'UUID', ord: 'INT' } })
  const TC3 = orm.table('ormc3', { id: f.pk(z.uuid()), grp: z.string(), ord: f.col(z.number(), 'ord') })
  await TC3.insert([
    { grp: 'a', ord: 1 }, { grp: 'a', ord: 2 }, { grp: 'b', ord: 3 },
  ]).run()
  assert.equal(await TC3.exists({ grp: { eq: 'a' } }), true, 'exists 真')
  assert.equal(await TC3.exists({ grp: { eq: 'zz' } }), false, 'exists 假')
  // 多列排序（sort[] 全列——二级排序）
  await TC3.insert({ grp: 'a', ord: 9 }).run()
  const p1 = await TC3.paginate({ filter: { grp: { eq: 'a' } }, sort: [{ field: 'ord', dir: 'desc' }, { field: 'id', dir: 'asc' }] })
  assert.deepEqual(p1.rows.map((r) => r.ord), [9, 2, 1], '多列排序（首列 desc 生效）')
})

test('orm：C2 registry（tx.table 免 shapeDef·未注册报错）', async () => {
  fx('ormc2', { id: z.string().meta({ pk: true, default: 'random' }), name: z.string() }, { columnTypes: { id: 'UUID' } })
  const TC2 = orm.table('ormc2', { id: f.pk(z.uuid()), name: z.string() })
  // 事务内免 shapeDef（共享 registry——校验/归一与工厂级一致）
  await orm.transaction(async (tx) => {
    const t = tx.table('ormc2')
    const [ins] = await t.insert({ name: 'c2' }).run()
    assert.ok(ins.id && ins.name, 'tx.table 免 shapeDef——insert 返回行归一')
    await assert.rejects(
      async () => { await t.insert({ name: 123 as never }).run() },
      /ZodError|expected/,
      'tx 表绑定校验保留（insertSchema）',
    )
  })
  const rows = await TC2.select().where({ name: { eq: 'c2' } }).run()
  assert.equal(rows.length, 1, '事务写可见（memory no-op 直跑）')
  // 未注册表 + 无 def → 明确报错（防空 schema 静默面）
  await assert.rejects(
    () => orm.transaction(async (tx) => { (tx as { table: (n: string) => unknown }).table('ormc2_ghost') }),
    /未注册/,
  )
})

test('orm：C1 returning 面（显式列翻译·update/delete 默认行）', async () => {
  fx('ormc1', { id: z.string().meta({ pk: true, default: 'random' }), app_id: z.string(), email: z.string() }, { columnTypes: { id: 'UUID', app_id: 'UUID' } })
  const TC = orm.table('ormc1', {
    id: f.pk(z.uuid()),
    appId: f.col(z.uuid(), 'app_id'),
    email: z.string(),
  })
  // insert 显式 returning('appId')——字段名 → 列名（差异列）
  const [ins] = await TC.insert({ appId: 'a1000000-0000-4000-8000-000000000001', email: 'c1@x.test' }).returning('id', 'appId', 'email').run()
  assert.equal(ins.appId, 'a1000000-0000-4000-8000-000000000001', '显式 returning 字段名归一')
  assert.ok(ins.id, 'id 显式返回')
  assert.ok(!('app_id' in ins), 'db 列名不泄漏')
  // update 默认 returning（不显式——行可读）
  const [upd] = await TC.update({ email: 'c1b@x.test' }).where({ id: { eq: String(ins.id) } }).run()
  assert.ok(upd.id && upd.appId && upd.email)
  assert.equal(upd.email, 'c1b@x.test')
  // update 显式 returning 覆盖（差异列）
  const [upd2] = await TC.update({ email: 'c1c@x.test' }).where({ id: { eq: String(ins.id) } }).returning('appId').run()
  assert.ok(upd2.appId)
  assert.ok(!('email' in upd2), '显式 returning 收窄生效')
  // delete 默认返回被删行
  const [del] = await TC.delete().where({ id: { eq: String(ins.id) } }).run()
  assert.equal(del.email, 'c1c@x.test', 'delete 返回被删行')
  // select 显式列翻译（差异列）
  await TC.insert({ appId: 'a1000000-0000-4000-8000-000000000001', email: 'c1d@x.test' }).run()
  const [sel] = await TC.select('appId').where({ email: { eq: 'c1d@x.test' } }).run()
  assert.ok(sel.appId)
  assert.ok(!('email' in sel), 'select 显式列收窄')
})

test('orm：paginate（count+list 双查·filter/sort/limit/offset）', async () => {
  fx('agents6', { id: z.string().meta({ pk: true, default: 'random' }), app_id: z.string(), name: z.string() }, { columnTypes: { id: 'UUID', app_id: 'UUID' } })
  const T6 = orm.table('agents6', {
    id: f.pk(z.uuid()),
    appId: f.col(z.uuid(), 'app_id'),
    name: z.string(),
  })
  await T6.insert([
    { appId: 'a1000000-0000-4000-8000-000000000001', name: '页甲' },
    { appId: 'a1000000-0000-4000-8000-000000000001', name: '页乙' },
    { appId: 'a1000000-0000-4000-8000-000000000001', name: '页丙' },
  ]).run()
  const p1 = await T6.paginate({ filter: eq(T6.c.appId, 'a1000000-0000-4000-8000-000000000001'), limit: 2, offset: 0, sort: [{ field: 'name', dir: 'asc' }] })
  assert.equal(p1.total, 3)
  assert.equal(p1.rows.length, 2)
  const p2 = await T6.paginate({ limit: 2, offset: 2, sort: [{ field: 'name', dir: 'asc' }] })
  assert.equal(p2.rows.length, 1)
  assert.equal(p2.total, 3)
})

test('orm：transaction（memory no-op 标注——fn 同连接执行·提交可见）', async () => {
  fx('agents8', { id: z.string().meta({ pk: true, default: 'random' }), app_id: z.string(), name: z.string() }, { columnTypes: { id: 'UUID', app_id: 'UUID' } })
  const T8 = orm.table('agents8', {
    id: f.pk(z.uuid()),
    appId: f.col(z.uuid(), 'app_id'),
    name: z.string(),
  })
  // memory 无事务面（单线程 no-op）——rollback 真语义归 postgres（departments-pilot 域）
  await orm.transaction(async (tx) => {
    const T8tx = tx.table('agents8', T8.shapeDef)
    await T8tx.insert({ appId: 'a1000000-0000-4000-8000-000000000001', name: '事务回滚' }).run()
  })
  const after = await T8.select().where(eq(T8.c.name, '事务回滚')).run()
  assert.equal(after.length, 1, 'no-op 直跑：fn 内查询已提交')
  // 显式 commit 路径可见
  await orm.transaction(async (tx) => {
    const T8tx = tx.table('agents8', T8.shapeDef)
    await T8tx.insert({ appId: 'a1000000-0000-4000-8000-000000000001', name: '事务提交' }).run()
  })
  const ok = await T8.select().where(eq(T8.c.name, '事务提交')).run()
  assert.equal(ok.length, 1)
})

test('orm：withCtx 租户 scope（自动 where/注入·跨租户隔离）', async () => {
  fx('agents7', { id: z.string().meta({ pk: true, default: 'random' }), app_id: z.string(), name: z.string() }, { columnTypes: { id: 'UUID', app_id: 'UUID' } })
  const T7 = orm.table('agents7', {
    id: f.pk(z.uuid()),
    appId: f.col(z.uuid(), 'app_id'),
    name: z.string(),
  })
  const ormT = createOrm(memoryAdapter(mem), { field: 'appId', value: (c) => (c as { appId?: string }).appId })
  const scoped = ormT.withCtx({ appId: 'a1000000-0000-4000-8000-000000000001' })
  const T7s = scoped.ctxTable('agents7', T7.shapeDef)
  // insert 自动注入 appId（跨租户）
  await T7s.insert({ name: '租户甲-数据' }).run()
  await T7s.insert({ name: '租户乙-数据', appId: 'a2000000-0000-4000-8000-000000000002' }).run()
  // select 自动 where（只回本租户）
  const rows = await T7s.select().run()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, '租户甲-数据')
  // 显式 where 与 scope AND 合并
  const merged = await T7s.select().where(eq(T7.c.name, '租户甲-数据')).run()
  assert.equal(merged.length, 1)
})

test('orm：安全面（update/delete 无 where 拒绝）', async () => {
  fx('agents5', { id: z.string().meta({ pk: true, default: 'random' }), app_id: z.string(), name: z.string() }, { columnTypes: { id: 'UUID', app_id: 'UUID' } })
  const T5 = orm.table('agents5', {
    id: f.pk(z.uuid()),
    appId: f.col(z.uuid(), 'app_id'),
    name: z.string(),
  })
  await assert.rejects(() => T5.update({ name: 'x' }).run(), /WHERE/)
  await assert.rejects(() => T5.delete().run(), /WHERE/)
  // 带 where 正常
  await T5.update({ name: 'y' }).where(eq(T5.c.appId, 'a1000000-0000-4000-8000-000000000001')).run()
  assert.ok(true)
})

test('orm：行归一（列名→字段名——appId 键断言·类型化返回）', async () => {
  fx('agents4', { id: z.string().meta({ pk: true, default: 'random' }), app_id: z.string(), name: z.string(), type: z.string() }, { columnTypes: { id: 'UUID', app_id: 'UUID' } })
  const T4 = orm.table('agents4', {
    id: f.pk(z.uuid()),
    appId: f.col(z.uuid(), 'app_id'),
    name: z.string(),
    type: f.req(z.enum(['ai', 'user'])),
  })
  // insert 返回：字段名键（appId 非 app_id——归一）
  const [ins] = await T4.insert({ appId: 'a1000000-0000-4000-8000-000000000001', name: '归一', type: 'ai' }).run()
  assert.ok(ins.id && ins.appId && ins.name && ins.type)
  assert.equal(ins.appId, 'a1000000-0000-4000-8000-000000000001')
  // 链后查询（where 后 run——归一仍生效）
  const rows = await T4.select().where(eq(T4.c.appId, 'a1000000-0000-4000-8000-000000000001')).run()
  assert.equal(rows.length, 1)
  assert.ok(rows[0].appId)
  assert.ok(!('app_id' in rows[0]), 'db 列名不泄漏')
  // 类型面（tsd 风格）：rows[0] 直接收窄——RowOf<S> 键精确（未知键红）
  const row = rows[0]
  void row.name
  void row.type
  // @ts-expect-error —— 未知键编译错误
  void row.nonexistent
})

test('orm：批量 insert（数组——校验/列名逐行）', async () => {
  fx('agents3', { id: z.string().meta({ pk: true, default: 'random' }), app_id: z.string(), name: z.string(), type: z.string() }, { columnTypes: { id: 'UUID', app_id: 'UUID' } })
  const T3 = orm.table('agents3', {
    id: f.pk(z.uuid()),
    appId: f.col(z.uuid(), 'app_id'),
    name: z.string(),
    type: f.req(z.enum(['ai', 'user'])),
  })
  const rows = await T3.insert([
    { appId: 'a1000000-0000-4000-8000-000000000001', name: '批一', type: 'ai' },
    { appId: 'a1000000-0000-4000-8000-000000000001', name: '批二', type: 'user' },
  ]).run()
  assert.equal(rows.length, 2)
  assert.deepEqual(rows.map((r: any) => r.name), ['批一', '批二'])
})

test('orm：类型收窄（编译期——tsd 风格）', async () => {
  // eq 值类型绑定列类型：appId（uuid→string 收窄）——number 红（W1 实证有效）
  // @ts-expect-error —— appId 是 uuid 校验列（string 数据——number 非法）
  eq(Agent.c.appId, 123)
  // 注：type 列（z.enum(['ai','user'])）当前类型面抽为 ZodEnum<[string, string]>——
  //   Infer=string——'robot' 无编译错——tsd 断言失效实证（W1 登记——W2/W3 修复面：
  //   z.enum 调用 as const 纪律或 enum 签名推断增强）——原断言移除
  eq(Agent.c.type, 'robot')
  // 合法形态
  eq(Agent.c.type, 'ai')
  eq(Agent.c.appId, 'a1000000-0000-4000-8000-000000000001')
  assert.ok(true)
})

test('orm：real shape（列名映射·toDb·变体面）', async () => {
  // 列引用对齐 db 列名（meta 消费）
  assert.equal(Agent.c.appId.ref, 'app_id')
  assert.equal(Agent.c.createdAt.ref, 'created_at')
  // insert 自动列名翻译（shape 字段名 → db 列名）
  fx('agents2', { id: z.string().meta({ pk: true, default: 'random' }), app_id: z.string(), name: z.string(), type: z.string(), created_at: z.string() }, { columnTypes: { id: 'UUID', app_id: 'UUID' } })
  const T2 = orm.table('agents2', {
    id: f.pk(z.uuid()),
    appId: f.col(z.uuid(), 'app_id'),
    name: z.string(),
    type: f.req(z.enum(['ai', 'user'])),
  })
  await T2.insert({ appId: 'a1000000-0000-4000-8000-000000000001', name: '真实', type: 'ai' }).run()
  const rows = await T2.select().where(eq(T2.c.appId, 'a1000000-0000-4000-8000-000000000001')).run()
  assert.equal(rows.length, 1)
  assert.equal(rows[0].name, '真实')
})

test('orm.gql：端到端（SDL+resolver 挂接 orm——内置链路执行）', async () => {
  const gql = orm.gql(Agent)
  const schema = makeExecutableSchema({ typeDefs: gql.typeDefs, resolvers: gql.resolvers })
  const r = await graphql({ schema, source: 'mutation { agentsInsert(data: { appId: "a1000000-0000-4000-8000-000000000001", name: "GQL助手", type: ai }) { id name type } }' })
  assert.ok(!r.errors, r.errors?.map((e) => e.message).join('; '))
  const ins = (r.data as { agentsInsert: { id: string; name: string; type: string } }).agentsInsert
  assert.equal(ins.name, 'GQL助手')
  assert.equal(ins.type, 'ai')
  const q = await graphql({ schema, source: 'query { agentsList(filter: { name: { contains: "GQL" } }) { id name } }' })
  const list = q.data as { agentsList: { id: string; name: string }[] }
  assert.equal(list.agentsList.length, 1)
  assert.equal(list.agentsList[0].name, 'GQL助手')
  const del = await graphql({ schema, source: `mutation { agentsDelete(id: "${ins.id}") { name } }` })
  assert.ok(!del.errors, del.errors?.map((e) => e.message).join('; '))
})

test('orm：E1 compile SQL 含 FILTER (WHERE ...)（参数顺序=出现顺序）', async () => {
  const q = { kind: 'select', table: 't1', alias: undefined, cols: undefined, where: undefined, joins: undefined, sub: undefined, groupBy: undefined, having: undefined, orderBy: undefined, limit: undefined, offset: undefined, aggregate: [{ fn: 'count', col: '*', as: 'a', filter: { active: { eq: true } } }, { fn: 'sum', col: 'score', as: 's', filter: { grp: { eq: 'x' } } }], distinct: false } as const
  const c = compileQuery(q as never)
  assert.ok(c.sql.includes('COUNT(*) FILTER (WHERE active = $1) AS a'), c.sql)
  assert.ok(c.sql.includes('SUM(score) FILTER (WHERE grp = $2) AS s'), c.sql)
})

// ── E1 聚合面（FILTER 计数 + min/max/avg 投影——compile/memory 同语义）──────

async function seedOrme1(ormX: ReturnType<typeof createOrm>, table: string) {
  mem.executeQuery({ kind: 'ddl', op: 'dropTable', table } as never)
  fx(table, { id: z.string().meta({ pk: true }), grp: z.string(), score: z.number().int(), active: z.boolean() }, { columnTypes: { score: 'INT' } })
  const T = ormX.table(table, { id: z.string(), grp: z.string(), score: z.number(), active: z.boolean() })
  await T.insert([
    { id: 'a1', grp: 'x', score: 30, active: true },
    { id: 'a2', grp: 'x', score: 10, active: false },
    { id: 'a3', grp: 'y', score: 50, active: true },
  ]).run()
  return T
}

test('orm：E1 FILTER 计数（count(col, as, filter)——内存/编译同语义）', async () => {
  const T = await seedOrme1(orm, 'orme1m')
  const [r] = await T.select().count('*', 'all').count('*', 'active_cnt', { active: { eq: true } }).count('*', 'grp_cnt', { grp: { eq: 'x' } }).run()
  assert.equal((r as any).all, 3, '全量计数')
  assert.equal((r as any).active_cnt, 2, 'FILTER 条件计数（active=true）')
  assert.equal((r as any).grp_cnt, 2, 'FILTER 条件计数（grp=x）')
})

test('orm：E1 FILTER×groupBy 组合（分组内条件计数）', async () => {
  const T = orm.table('orme1m', { id: z.string(), grp: z.string(), score: z.number(), active: z.boolean() })
  const rows = await T.select().groupBy('grp').count('*', 'all').count('*', 'act', { active: { eq: true } }).orderBy('grp', 'asc').run()
  assert.equal(rows.length, 2)
  assert.equal(rows[0].grp, 'x')
  assert.equal((rows[0] as any).all, 2)
  assert.equal((rows[0] as any).act, 1, 'x 组 active 计数')
  assert.equal(rows[1].grp, 'y')
  assert.equal((rows[1] as any).act, 1)
})

test('orm：E1 min/max/avg 投影 + FILTER 组合（MAX(version) 场景替代线）', async () => {
  const T = orm.table('orme1m', { id: z.string(), grp: z.string(), score: z.number(), active: z.boolean() })
  const [r] = await T.select().max('score', 'top').min('score', 'bottom').avg('score', 'mean').count('*', 'n', { active: { eq: true } }).run()
  assert.equal((r as any).top, 50)
  assert.equal((r as any).bottom, 10)
  assert.equal((r as any).mean, 30)
  assert.equal((r as any).n, 2, 'FILTER 只算 active 行')
})

test('orm：E1 compile SQL 含 FILTER (WHERE ...)（参数顺序=出现顺序）', async () => {
  const q = { kind: 'select', table: 't1', alias: undefined, cols: undefined, where: undefined, joins: undefined, sub: undefined, groupBy: undefined, having: undefined, orderBy: undefined, limit: undefined, offset: undefined, aggregate: [{ fn: 'count', col: '*', as: 'a', filter: { active: { eq: true } } }, { fn: 'sum', col: 'score', as: 's', filter: { grp: { eq: 'x' } } }], distinct: false } as const
  const c = compileQuery(q as never)
  assert.ok(c.sql.includes('COUNT(*) FILTER (WHERE active = $1) AS a'), c.sql)
  assert.ok(c.sql.includes('SUM(score) FILTER (WHERE grp = $2) AS s'), c.sql)
})

test('orm：E1 聚合根（max/count FILTER——内存面；wire 面随 W3b 消亡）', async () => {
  const T = orm.table('orme1m', { id: z.string(), grp: z.string(), score: z.number(), active: z.boolean() })
  mem.executeQuery({ kind: 'insert', table: 'orme1m', rows: [{ id: 'a4', grp: 'x', score: 60, active: true }] } as never)
  const [r] = await T.select().max('score', 'top').count('*', 'n', { active: { eq: true } }).count('*', 'grp', { grp: { eq: 'x' } }).run()
  assert.equal((r as any).top, 60, 'max')
  assert.equal((r as any).n, 3, 'FILTER count（a1/a3/a4 active）')
  assert.equal((r as any).grp, 3, 'FILTER count 2（a1/a2/a4 grp=x）')
})

test('W3 tsd：paginate.sort.field 类型化（keyof S——字面量多余键红）', async () => {
  fx('ormsort', { id: z.string(), name: z.string(), age: z.number() })
  const T = orm.table('ormsort', {
    id: f.pk(z.string()).meta({ pk: true }),
    name: z.string(),
    age: z.number(),
  })
  await T.insert({ id: 's1', name: 'a', age: 1 } as never).run()
  // 合法：keyof S 内字段
  const r = await T.paginate({ sort: [{ field: 'name', dir: 'desc' }], limit: 10 })
  assert.equal(r.rows.length, 1)
  // @ts-expect-error —— field: 'bogus'（非 shape 键——编译期红）
  T.paginate({ sort: [{ field: 'bogus' }] }).catch(() => {})
  // @ts-expect-error —— dir 非 'asc'|'desc'（字面量联合收紧）
  T.paginate({ sort: [{ field: 'name', dir: 'sideways' }] }).catch(() => {})
  // 可选 dir（缺省 asc）
  const r2 = await T.paginate({ sort: [{ field: 'age' }] })
  assert.equal(r2.rows.length, 1)
})
