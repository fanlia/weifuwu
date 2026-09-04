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
import { AGENT_PLATFORM_SCHEMA } from '../src/db/tables.ts'
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
  await pg.orm.query.delete('department_members').where({ department_id: { eq: DEPT_ID } }).run()
  await pg.orm.query.delete('agents').where({ app_id: { eq: APP_ID } }).run()
  await pg.orm.query.delete('departments').where({ id: { eq: DEPT_ID } }).run()
}

before(async () => {
  pg = postgres({ memory: true })
  // 协议层 = AST：声明式建库（migrateModule——零 SQL 文本）
  await pg.migrateModule('test-full', AGENT_PLATFORM_SCHEMA as never)
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
  await pg.orm.query.insert('departments').rows([{ id: DEPT_ID, app_id: APP_ID, name: '测试部' }]).run()
  await pg.orm.query.insert('agents').rows([{ id: MGR_ID, app_id: APP_ID, type: 'department', name: '测试部经理', model: 'deepseek-v4-flash', department_id: DEPT_ID, is_active: true, tools: '[]' }]).run()
  await pg.orm.query.insert('department_members').rows([{ department_id: DEPT_ID, agent_id: MGR_ID, role: 'manager' }]).run()
}

async function promptOf(): Promise<string> {
  const [a] = await pg.orm.query.from('agents').select('system_prompt').where({ id: { eq: MGR_ID } }).run()
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
  await pg.orm.query.insert('agents').rows([
    { id: AI_ID, app_id: APP_ID, type: 'ai', name: '分析猿', model: 'deepseek-chat', is_active: true, tools: '[]' },
    { id: HUMAN_ID, app_id: APP_ID, type: 'user', name: '真实用户', user_id: '11111111-1111-1111-1111-111111111111', is_active: true },
  ]).run()
  await pg.orm.query.insert('department_members').rows([
    { department_id: DEPT_ID, agent_id: AI_ID, role: 'member' },
    { department_id: DEPT_ID, agent_id: HUMAN_ID, role: 'member' },
  ]).run()
  await refreshManagerPrompt(pg.orm, APP_ID, DEPT_ID)
  const p = await promptOf()
  assert.match(p, /分析猿/)
  assert.ok(!p.includes('测试部经理'), '经理自身不进名单')
  assert.ok(!p.includes('真实用户'), 'user 类型不进名单')
})

test('W1c: 移除成员 → 回「暂无 AI 成员」+ 幂等（两次刷新一致）', async () => {
  await fixture()
  await pg.orm.query.insert('agents').rows([{ id: AI_ID, app_id: APP_ID, type: 'ai', name: '分析猿', model: 'deepseek-chat', is_active: true, tools: '[]' }]).run()
  await pg.orm.query.insert('department_members').rows([{ department_id: DEPT_ID, agent_id: AI_ID, role: 'member' }]).run()
  await refreshManagerPrompt(pg.orm, APP_ID, DEPT_ID)
  assert.match(await promptOf(), /分析猿/)
  await pg.orm.query.delete('department_members').where({ agent_id: { eq: AI_ID } }).run()
  await refreshManagerPrompt(pg.orm, APP_ID, DEPT_ID)
  const p1 = await promptOf()
  assert.match(p1, /暂无 AI 成员/)
  assert.ok(!p1.includes('分析猿'))
  await refreshManagerPrompt(pg.orm, APP_ID, DEPT_ID)
  assert.equal(await promptOf(), p1, '幂等：两次刷新结果一致')
})

test('W1d: 经理不存在 → no-op 不抛', async () => {
  await pg.orm.query.delete('agents').where({ id: { eq: MGR_ID } }).run()
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
