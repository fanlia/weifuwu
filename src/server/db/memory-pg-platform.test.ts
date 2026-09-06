/**
 * 平台声明式 Schema 契约（W3b 改版：wire 面消亡 → memory 引擎直执 + compileQuery SQL 形状静态契约）
 *
 * W1 锁定点（探针实证——补齐后翻转）：
 * - 声明式 Schema（tables.ts 单源）→ 内存引擎按声明构造（applySchema 直构造元数据）
 * - 平台查询面采样结果正确性（COUNT FILTER/RETURNING/JOIN/upsert/ILIKE/now() 表达式）
 * - compileQuery SQL 形状静态契约（单向封闭输出——wire 消亡后编译面金丝雀：
 *   FILTER 子句/参数化/别名——AST→SQL 正确性不再靠服务器 round-trip）
 *
 * 判负（平台面外——不补）：
 * - WHERE 子查询（业务查询 0 处——仅迁移 DO 块（迁移面 SQL 保留——真栈跑））
 * - ::int/::uuid cast（内存按行值类型推 OID——cast 语法面在真库；等价断言不需要）
 */
import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { MemorySql, createMemoryOrm } from './memory-sql.ts'
import { AGENT_PLATFORM_SCHEMA } from '../../../apps/agent-platform/src/db/tables.ts'
import { compileQuery, compileSelect } from './query.ts'
import { nowAgo } from './ops.ts'

const mem = new MemorySql()
mem.applySchema(AGENT_PLATFORM_SCHEMA)
const db = createMemoryOrm(mem)

test('平台声明式 Schema 建库（24 表·无错）', async () => {
  for (const tbl of ['agents', 'departments', 'messages', 'department_members', 'kb_chunks', 'survey_campaigns']) {
    await db.orm.query.from(tbl).count('*', 'n').run()
  }
  // 枚举类型生效（agents.type 列接受枚举值——列类型宽松面已支持）
  await db.orm.query.insert('agents').rows([{ app_id: 'a1', type: 'ai', name: '探针agent', state: 'active' }]).run()
  const rows = await db.orm.query.from('agents').select('name').where({ app_id: { eq: 'a1' } }).run()
  assert.equal(rows[0]?.name, '探针agent')
})

test('COUNT(*) FILTER（监控面——平台 20 处）', async () => {
  const [r] = await db.orm.query.from('agents').count('*', 'total').count('*', 'active', { state: { eq: 'active' } }).run()
  assert.equal(Number(r?.total), 1)
  assert.equal(Number(r?.active), 1)
})

test('INSERT/UPDATE/DELETE RETURNING（平台 46 处）', async () => {
  const [ins] = await db.orm.query.insert('agents').rows([{ app_id: 'a2', type: 'user', name: '张三' }]).returning('id').run()
  assert.ok(ins?.id, 'INSERT RETURNING 返回 id')
  const [upd] = await db.orm.query.update('agents').set({ name: '李四' }).where({ id: { eq: String(ins.id) } }).returning('id', 'name').run()
  assert.equal(upd?.name, '李四')
  const [del] = await db.orm.query.delete('agents').where({ id: { eq: String(ins.id) } }).returning('id').run()
  assert.equal(del?.id, ins.id)
})

test('JOIN（左连接——部门/消息链）', async () => {
  const [d] = await db.orm.query.insert('departments').rows([{ app_id: 'a1', name: 'A部' }]).returning('id').run()
  await db.orm.query.insert('agents').rows([{ app_id: 'a1', type: 'ai', name: '小王', department_id: d.id }]).run()
  const rows = await db.orm.query.from('agents ag')
    .join('departments d', { 'd.id': { col: 'ag.department_id' } }, { type: 'left' })
    .select('ag.name', 'd.name as dept')
    .where({ 'ag.app_id': { eq: 'a1' } })
    .run()
  assert.ok(rows.some((r: any) => r.name === '小王' && r.dept === 'A部'))
})

test('ILIKE 搜索（messages/departments 面）', async () => {
  const rows = await db.orm.query.from('departments').select('name').where({ name: { ilike: '%A%' }, app_id: { eq: 'a1' } }).run()
  assert.ok(rows.length >= 1, 'ILIKE 命中')
})

test('upsert（ON CONFLICT DO UPDATE——平台 3 处）', async () => {
  await db.orm.query.insert('role_templates').rows([{ name: '模板A', slug: 'tpl-a' }]).run()
  const [up] = await db.orm.query.insert('role_templates').rows([{ name: '模板A2', slug: 'tpl-a' }]).onConflict('slug', true).returning('name').run()
  assert.equal((up as { name?: string })?.name, '模板A2')
  const [n] = await db.orm.query.from('role_templates').count('*', 'n').where({ slug: { eq: 'tpl-a' } }).run()
  assert.equal(Number((n as { n?: number })?.n), 1) // 未插入新行
})

test('now() 表达式（平台 80 处 cast 面）', async () => {
  const rows = await db.orm.query.from('departments').select('id', 'created_at')
    .where({ created_at: { gte: nowAgo(1, 'day') }, app_id: { eq: 'a1' } }).run()
  assert.ok(rows.length >= 1, 'cast + now() 面')
})

test('compileQuery SQL 形状静态契约（wire 消亡后单向封闭输出金丝雀）', () => {
  // 参数顺序契约：聚合 FILTER 参数先于 WHERE（编译顺序=出现顺序——诚实断言）
  const q = { kind: 'select', table: 'agents', alias: undefined, cols: ['id'], where: { app_id: { eq: 'a1' }, state: { eq: 'active' } }, joins: undefined, sub: undefined, groupBy: undefined, having: undefined, orderBy: [{ col: 'created_at', dir: 'desc' }], limit: 10, offset: undefined, aggregate: [{ fn: 'count', col: '*', as: 'cnt', filter: { state: { eq: 'active' } } }], distinct: false } as const
  const c = compileSelect(q as never)
  assert.match(c.sql, /COUNT\(\*\) FILTER \(WHERE state = \$1\) AS cnt/)
  assert.match(c.sql, /WHERE app_id = \$2 AND state = \$3/)
  assert.match(c.sql, /ORDER BY created_at DESC LIMIT \$4/)
  assert.deepEqual(c.params, ['active', 'a1', 'active', 10])
  // upsert 编译（ON CONFLICT DO UPDATE SET 排除冲突列）
  const up = compileQuery({ kind: 'insert', table: 'role_templates', rows: [{ name: 'x', slug: 's' }], onConflict: { col: 'slug', update: true } } as never)
  assert.match(up.sql, /ON CONFLICT \(slug\) DO UPDATE SET name = EXCLUDED\.name/)
})


// ── 空条件契约（2027-09 platform /api/agents 400「syntax error at or near AND」根因防线） ──
// 根因：listQuery 空 filter={} 经 ctxTable scope 合并 `{ and: [{}, sc] }` →
// compileWhere 空对象子项编译为空串 → `( AND app_id = $1 )`（PG 语法错）。
// 语义定案：空对象 = 无条件（memory matchWhereExpr 同语义——双端对账一致）。

test('空对象 where 子项 = 无条件——compile 无裸 AND（and 组/顶层/全空组）', () => {
  // ① and 组内含空对象子项（ctxTable scope 合并形态——bug 现场）
  const c1 = compileSelect({ kind: 'select', table: 'agents', where: { and: [{}, { app_id: { eq: 'a1' } }] }, cols: ['*'] } as never)
  assert.doesNotMatch(c1.sql, /\bAND AND\b|\( AND|^\(AND/)
  assert.match(c1.sql, /WHERE \(\$1\)|WHERE \(.*app_id = \$1\)/)
  assert.deepEqual(c1.params, ['a1'])
  // ② 顶层空对象 = 无条件（无 WHERE 子句）
  const c2 = compileSelect({ kind: 'select', table: 'agents', where: {}, cols: ['*'] } as never)
  assert.doesNotMatch(c2.sql, /WHERE/)
  // ③ 全空 and 组 = 无条件（同 ②）
  const c3 = compileSelect({ kind: 'select', table: 'agents', where: { and: [{}] }, cols: ['*'] } as never)
  assert.doesNotMatch(c3.sql, /WHERE/)
  // ④ or 组内空对象子项 = 跳过（裸 OR 同款）
  const c4 = compileSelect({ kind: 'select', table: 'agents', where: { or: [{}, { state: { eq: 'active' } }] }, cols: ['*'] } as never)
  assert.doesNotMatch(c4.sql, /OR OR|\( OR /)
  assert.match(c4.sql, /state = \$1/)
  // ⑤ update/delete 空条件显式拒绝（防全表守卫延续——不静默）
  assert.throws(() => compileQuery({ kind: 'update', table: 'agents', sets: { name: 'x' }, where: {} } as never), /条件为空/)
  assert.throws(() => compileQuery({ kind: 'delete', table: 'agents', where: {} } as never), /条件为空/)
})

test('空对象 where 子项——memory 同语义对账（{} = true——无条件）', async () => {
  const mem = new MemorySql()
  mem.applySchema(AGENT_PLATFORM_SCHEMA as never)
  await mem.executeQuery({ kind: 'insert', table: 'agents', rows: [{ app_id: 'a1', name: 'x', type: 'ai' }] } as never)
  // ① and 含空对象子项——等价于单条件（空对象不干扰——非死条件）
  const q1 = { kind: 'select', table: 'agents', cols: ['*'], where: { and: [{}, { app_id: { eq: 'a1' } }] } } as never
  const r1 = (await mem.executeQuery(q1)) as unknown as unknown[]
  assert.equal(r1.length, 1)
  // ② 空对象 alone = 全量（无条件）
  const q2 = { kind: 'select', table: 'agents', cols: ['*'], where: {} } as never
  const r2 = (await mem.executeQuery(q2)) as unknown as unknown[]
  assert.equal(r2.length, 1)
})
