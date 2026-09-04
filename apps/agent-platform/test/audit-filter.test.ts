/**
 * 审计日志筛选测试（G4——ROADMAP C3：时间范围 + action 过滤）
 *
 * 真库（.env DATABASE_URL——与其他服务测试同模式）——唯一 app_id 隔离 +
 * 回溯 created_at 造时间分布——断言 listAudit 的 from/to/action 组合。
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { postgres, WEIFUWU_USER_SCHEMA } from 'weifuwu'
import { AGENT_PLATFORM_SCHEMA } from '../src/db/tables.ts'
import { listAudit } from '../src/services/audit.ts'

let pg: ReturnType<typeof postgres>
const appId = randomUUID()
const userId = randomUUID()

const daysAgo = (d: number) => new Date(Date.now() - d * 86400 * 1000).toISOString()

before(async () => {
  pg = postgres({ memory: true })
  await pg.migrateModule('test-full', AGENT_PLATFORM_SCHEMA as never)
  await pg.migrateModule('test-users', WEIFUWU_USER_SCHEMA as never)
  // 时间分布：今天 ×2（不同 action）+ 10 天前 + 40 天前
  await pg.orm.query.insert('audit_logs').rows([
    { app_id: appId, user_id: userId, action: 'login_success', target_type: 'app', target_id: appId, detail: { src: 'today-1' }, created_at: new Date().toISOString() },
    { app_id: appId, user_id: userId, action: 'agent_create', target_type: 'agent', target_id: randomUUID(), detail: { src: 'today-2' }, created_at: new Date().toISOString() },
    { app_id: appId, user_id: userId, action: 'agent_create', target_type: 'agent', target_id: randomUUID(), detail: { src: 'd10' }, created_at: daysAgo(10) },
    { app_id: appId, user_id: userId, action: 'agent_update', target_type: 'agent', target_id: randomUUID(), detail: { src: 'd40' }, created_at: daysAgo(40) },
  ]).run()
})

after(async () => {
  await pg.orm.query.delete('audit_logs').where({ app_id: { eq: appId } }).run()
  await pg.close()
})

function ctx() {
  return { sql: pg.sql, orm: (pg as any).orm, appId } as any
}

test('G4a: 无筛选 → 全量（分页 total 一致）', async () => {
  const { entries, total } = await listAudit(ctx(), {})
  assert.equal(entries.length, 4)
  assert.equal(total, 4)
})

test('G4b: action 筛选（既有能力不回归）', async () => {
  const { entries } = await listAudit(ctx(), { action: 'agent_create' })
  assert.equal(entries.length, 2)
  assert.ok(entries.every((e: any) => e.action === 'agent_create'))
})

test('G4c: from 筛选——近 7 天（10/40 天前排除）', async () => {
  const { entries } = await listAudit(ctx(), { from: daysAgo(7) })
  assert.equal(entries.length, 2, '仅今天的 2 条')
  assert.deepEqual(entries.map((e: any) => e.detail.src).sort(), ['today-1', 'today-2'])
})

test('G4d: from 筛选——近 30 天（40 天前排除）', async () => {
  const { entries } = await listAudit(ctx(), { from: daysAgo(30) })
  assert.equal(entries.length, 3)
})

test('G4e: to 筛选——20 天前以前（仅 40 天前那条）', async () => {
  const { entries } = await listAudit(ctx(), { to: daysAgo(20) })
  assert.equal(entries.length, 1)
  assert.equal(entries[0].detail.src, 'd40')
})

test('G4f: from + to 窗口（5-15 天 → 仅 d10）', async () => {
  const { entries } = await listAudit(ctx(), { from: daysAgo(15), to: daysAgo(5) })
  console.log('[G4f]', JSON.stringify(entries.map((e: any) => e.detail)), JSON.stringify(entries.map((e: any) => e.created_at)))
  assert.equal(entries.length, 1)
  assert.equal(entries[0].detail.src, 'd10')
})

test('G4g: action + 时间组合（AND 语义）', async () => {
  const { entries } = await listAudit(ctx(), { action: 'agent_create', from: daysAgo(7) })
  assert.equal(entries.length, 1, 'agent_create × 近 7 天 = 仅 today-2')
  assert.equal(entries[0].detail.src, 'today-2')
})

test('G4h: 租户隔离——他 app 数据不可见', async () => {
  const other = { sql: pg.sql, orm: (pg as any).orm, appId: randomUUID() } as any
  const { entries, total } = await listAudit(other, {})
  assert.equal(entries.length, 0)
  assert.equal(total, 0)
})
