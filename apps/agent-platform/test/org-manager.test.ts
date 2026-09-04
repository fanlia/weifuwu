/**
 * 组织层级经理契约测试（AGENT-TYPES-OPTIMIZE W1/W2）
 *
 * 锁定：
 *  - refreshManagerPrompt 行为：暂无成员 → 含部门名；加成员 → 含成员名（不含经理）；
 *    移除 → 回「暂无 AI 成员」；幂等；经理不存在 no-op 不抛
 *  - 单源纪律（红→绿机制）：经理提示词模板只存在于 org-manager.ts——
 *    routes 内联模板回归 = 测试红
 */
import { test, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from 'weifuwu'
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { refreshManagerPrompt } from '../src/services/org-manager.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const APP_ROOT = join(__dirname, '..')

const APP_ID = '00000000-0000-0000-0000-000000000701'
const DEPT_ID = '00000000-0000-0000-0000-000000000702'
const MGR_ID = '00000000-0000-0000-0000-000000000703'
const AI_ID = '00000000-0000-0000-0000-000000000704'
const HUMAN_ID = '00000000-0000-0000-0000-000000000705' // user 类型——不进名单

let pg: ReturnType<typeof postgres>

async function clean(): Promise<void> {
  await pg.sql`DELETE FROM department_members WHERE department_id = ${DEPT_ID}`
  await pg.sql`DELETE FROM agents WHERE app_id = ${APP_ID}`
  await pg.sql`DELETE FROM departments WHERE id = ${DEPT_ID}`
}

before(async () => {
  pg = postgres({ memory: true })
  await clean()
})

beforeEach(async () => {
  await clean()
})

after(async () => {
  await clean()
  await pg.close()
})

async function fixture(): Promise<void> {
  await pg.sql`
    INSERT INTO departments (id, app_id, name) VALUES (${DEPT_ID}, ${APP_ID}, '测试部')
  `
  await pg.sql`
    INSERT INTO agents (id, app_id, type, name, model, department_id, is_active, tools)
    VALUES (${MGR_ID}, ${APP_ID}, 'department', '测试部经理', 'deepseek-v4-flash', ${DEPT_ID}, true, '[]')
  `
  await pg.sql`
    INSERT INTO department_members (department_id, agent_id, role)
    VALUES (${DEPT_ID}, ${MGR_ID}, 'manager')
  `
}

async function promptOf(): Promise<string> {
  const [a] = await pg.sql`SELECT system_prompt FROM agents WHERE id = ${MGR_ID}`
  return String(a?.system_prompt ?? '')
}

test('W1a: 无 AI 成员 → 提示词含部门名 + 「暂无 AI 成员」', async () => {
  await fixture()
  await refreshManagerPrompt(pg.orm, APP_ID, DEPT_ID)
  const p = await promptOf()
  assert.match(p, /「测试部」的部门经理/)
  assert.match(p, /暂无 AI 成员/)
})

test('W1b: 加 AI 成员 → 提示词含成员名（不含经理名/user 类型）', async () => {
  await fixture()
  await pg.sql`
    INSERT INTO agents (id, app_id, type, name, model, department_id, is_active, tools)
    VALUES (${AI_ID}, ${APP_ID}, 'ai', '分析猿', 'deepseek-chat', null, true, '[]')
  `
  await pg.sql`
    INSERT INTO agents (id, app_id, type, name, user_id, is_active)
    VALUES (${HUMAN_ID}, ${APP_ID}, 'user', '真实用户', '11111111-1111-1111-1111-111111111111', true)
  `
  await pg.sql`
    INSERT INTO department_members (department_id, agent_id, role)
    VALUES (${DEPT_ID}, ${AI_ID}, 'member'), (${DEPT_ID}, ${HUMAN_ID}, 'member')
  `
  await refreshManagerPrompt(pg.orm, APP_ID, DEPT_ID)
  const p = await promptOf()
  assert.match(p, /分析猿/)
  assert.ok(!p.includes('测试部经理'), '经理自身不进名单')
  assert.ok(!p.includes('真实用户'), 'user 类型不进名单')
})

test('W1c: 移除成员 → 回「暂无 AI 成员」+ 幂等（两次刷新一致）', async () => {
  await fixture()
  await pg.sql`
    INSERT INTO agents (id, app_id, type, name, model, department_id, is_active, tools)
    VALUES (${AI_ID}, ${APP_ID}, 'ai', '分析猿', 'deepseek-chat', null, true, '[]')
  `
  await pg.sql`INSERT INTO department_members (department_id, agent_id, role) VALUES (${DEPT_ID}, ${AI_ID}, 'member')`
  await refreshManagerPrompt(pg.orm, APP_ID, DEPT_ID)
  assert.match(await promptOf(), /分析猿/)
  await pg.sql`DELETE FROM department_members WHERE agent_id = ${AI_ID}`
  await refreshManagerPrompt(pg.orm, APP_ID, DEPT_ID)
  const p1 = await promptOf()
  assert.match(p1, /暂无 AI 成员/)
  assert.ok(!p1.includes('分析猿'))
  await refreshManagerPrompt(pg.orm, APP_ID, DEPT_ID)
  assert.equal(await promptOf(), p1, '幂等：两次刷新结果一致')
})

test('W1d: 经理不存在 → no-op 不抛', async () => {
  await pg.sql`DELETE FROM agents WHERE id = ${MGR_ID}`
  await refreshManagerPrompt(pg.orm, APP_ID, DEPT_ID) // 不抛即通过
  await fixture() // 恢复（后续测试用）
})

test('W1e: 提示词模板单源——routes 无内联模板', () => {
  const marker = '部门经理，代表该部门参与协作'
  const offenders: string[] = []
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return
    const st = statSync(dir)
    if (!st.isDirectory()) return
    for (const f of readdirSync(dir)) {
      const p = join(dir, f)
      if (f === 'node_modules' || f === 'dist' || f === 'test') continue
      if (p.endsWith('.ts')) {
        if (readFileSync(p, 'utf-8').includes(marker)) offenders.push(p)
      } else if (existsSync(p) && statSync(p).isDirectory()) walk(p)
    }
  }
  walk(join(APP_ROOT, 'src'))
  assert.deepEqual(offenders, [join(APP_ROOT, 'src/services/org-manager.ts')],
    `经理提示词模板只允许在 org-manager.ts（单源）——发现内联：${offenders.join(', ')}`)
})
