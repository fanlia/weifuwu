/**
 * MemoryPostgresServer — 平台场景覆盖契约（W1：shape+operator 数据层计划）
 *
 * 锁定点（探针实证——补齐后翻转）：
 * - 声明式 Schema（tables.ts 单源）→ 内存引擎按声明构造（wire 服务器执行基座）
 * - 平台查询面采样结果正确性（COUNT FILTER/RETURNING/JOIN/upsert/ILIKE/now() 表达式）
 * - 全部经 wire（postgres client ↔ MemoryPostgresServer 全链路——非 MemorySql 直调）
 *
 * 判负（平台面外——不补）：
 * - WHERE 子查询（业务查询 0 处——仅迁移 DO 块（迁移面 SQL 保留——真栈跑））
 * - ::int/::uuid cast（wire 服务器按行值类型推 OID——cast 语法面在真库；等价断言不需要）
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { MemoryPostgresServer } from './postgres-server.ts'
import { postgres } from '../postgres/client.ts'
import { AGENT_PLATFORM_SCHEMA } from '../../../apps/agent-platform/src/db/tables.ts'
import { nowAgo } from './ops.ts'

const pgServer = new MemoryPostgresServer()
await pgServer.start()
after(async () => { await pgServer.close() })

const db = postgres({ connection: pgServer.url })

before(async () => {
  // 声明式 Schema（tables.ts 单源）→ 内存引擎按声明构造表元数据（wire 服务器执行基座）
  ;(pgServer as unknown as { engine: { applySchema: (m: unknown) => void } }).engine.applySchema(AGENT_PLATFORM_SCHEMA)
})

test('平台声明式 Schema 经 wire 建库（24 表·无错）', async () => {
  // information_schema 为 PG 目录表（内存无 catalog 面——判负：建表验证走业务表）
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
  // 冲突（slug 唯一）→ DO UPDATE：非冲突列更新·returning 读更新后行（D1 语义）
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
