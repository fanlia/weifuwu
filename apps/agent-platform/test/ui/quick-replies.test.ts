/**
 * CHAT-INTERACTION 波次 2：HITL 快捷确认 chip——UI seed 契约（不依赖真实 LLM）
 *
 * DB 直插消息 quick_replies（对齐 approvals.test 诚实裁剪路径）——锁定：
 * 1. 最后一条 AI 消息带选项 → chip 行渲染（描边胶囊可点）
 * 2. 点击 chip → 选项文本作为用户消息发送上屏 + chip 消失（已答不可重复答）
 * 3. 刷新恢复：GET 带列值 → 未答复时 chip 仍在；AI 消息后已有用户回复 → chip 不渲染
 * 4. 普通消息（无 quick_replies）零影响（渐进增强回归）
 */
import { buildQuery } from 'weifuwu'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, registerTenant, injectAuth, fatalErrors,
  type AgentServer, type TenantAuth,
  testDb,
} from './shared.ts'

let server: AgentServer
let browser: Browser
let BASE = ''
let owner: TenantAuth
let deptId = ''
let agentId = ''

/** seed 一条带选项的 AI 消息（DB 直插——真实渲染链） */
async function seedAiMsg(content: string, quickReplies: string[] | null): Promise<string> {
  const pg = testDb(BASE)
  try {
    const [row] = await pg.query(buildQuery().insert('messages').rows([{ department_id: deptId, sender_id: agentId, content, msg_type: 'text', ai_approved: true, quick_replies: quickReplies ?? null }]).returning('id').toQuery())
    return String(row.id)
  } finally { await pg.close() }
}

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
  owner = await registerTenant(BASE, 'qr')
  const d = await fetch(`${BASE}/api/departments`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ name: 'chip测试部' }),
  }).then((r) => r.json())
  deptId = d.department.id
  const a = await fetch(`${BASE}/api/agents`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${owner.token}` },
    body: JSON.stringify({ type: 'ai', name: 'chipAI', system_prompt: 'x' }),
  }).then((r) => r.json())
  agentId = a.agent.id
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

async function openDept() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, `/chat/${deptId}`)
  await page.waitForFunction(() => !!document.querySelector('input[placeholder*="输入消息"]'), undefined, { timeout: 10_000 })
  await page.waitForTimeout(400)
  return { page, errors }
}

test('chip 渲染：最后一条 AI 消息带选项 → 描边胶囊 chip 行', async () => {
  await seedAiMsg('检测到磁盘不足，请确认清理范围。', ['清理 30 天前备份', '全部清理', '暂不清理'])
  const { page, errors } = await openDept()
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('清理 30 天前备份'), undefined, { timeout: 10_000 })
  const chips = await page.evaluate(() => [...document.querySelectorAll('.ap-quick-chip')].map((c) => (c.textContent ?? '').trim()))
  assert.deepEqual(chips, ['清理 30 天前备份', '全部清理', '暂不清理'], `chip 渲染（实际：${JSON.stringify(chips)}）`)
  assert.ok(fatalErrors(errors).length === 0, `零页面错误: ${errors.join(' | ')}`)
  await page.close()
})

test('点击 chip → 选项文本作为用户消息发送 + chip 消失（已答不可重复答）', async () => {
  // 自包含 seed（不依赖用例顺序——node:test 单跑 --test-name-pattern 也过）
  await seedAiMsg('自包含确认点：选择清理范围。', ['清理 30 天前备份', '全部清理', '暂不清理'])
  const { page } = await openDept()
  await page.waitForFunction(() => document.querySelectorAll('.ap-quick-chip').length > 0, undefined, { timeout: 10_000 })
  await page.evaluate(() => {
    const chip = [...document.querySelectorAll('.ap-quick-chip')].find((c) => (c.textContent ?? '').includes('全部清理'))
    ;(chip as HTMLElement)?.click()
  })
  // 选项文本作为用户消息入库（sendText 复用链——API 权威断言而非脆 DOM 形态）
  await page.waitForFunction(async (tk) => {
    const api = await fetch(`/api/departments/${location.pathname.split('/')[2]}/messages?limit=10`, { headers: { Authorization: 'Bearer ' + tk } }).then((r) => r.json())
    return (api.messages ?? []).some((m: { content?: string }) => m.content === '全部清理')
  }, owner.token, { timeout: 10_000 })
  // chip 消失（本地清除 + 最后一条变成 user 消息——双保险）
  await page.waitForFunction(() => document.querySelectorAll('.ap-quick-chip').length === 0, undefined, { timeout: 10_000 })
  await page.close()
})

test('刷新恢复：GET 列值 → 未答复 chip 恢复；用户已答复的 AI 消息不渲染 chip', async () => {
  // 场景 A：AI 带选项是最后一条 → 刷新后 chip 恢复
  await seedAiMsg('第二个确认点：要继续吗？', ['继续', '停止'])
  {
    const { page } = await openDept()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('要继续吗'), undefined, { timeout: 10_000 })
    await page.waitForTimeout(300)
    const chips = await page.evaluate(() => document.querySelectorAll('.ap-quick-chip').length)
    assert.equal(chips, 2, `未答复刷新后 chip 恢复（实际 ${chips}）`)
    await page.close()
  }
  // 场景 B：AI 选项之后用户已回复（直插 user 消息）→ chip 不渲染
  const pg = testDb(BASE)
  try {
    const [me] = await pg.query(buildQuery().from('agents').select('id').where({ app_id: { eq: owner.app.id }, type: { eq: 'user' } }).limit(1).toQuery())
    await pg.query(buildQuery().insert('messages').rows([{ department_id: deptId, sender_id: me.id, content: '继续', msg_type: 'text', ai_approved: true }]).toQuery())
  } finally { await pg.close() }
  {
    const { page } = await openDept()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('继续'), undefined, { timeout: 10_000 })
    await page.waitForTimeout(300)
    const chips = await page.evaluate(() => document.querySelectorAll('.ap-quick-chip').length)
    assert.equal(chips, 0, `已答复后 chip 不渲染（实际 ${chips}）`)
    await page.close()
  }
})

test('渐进增强回归：无选项的普通 AI 消息零 chip（旧行为不变）', async () => {
  await seedAiMsg('普通回复，没有选项。', null)
  const { page, errors } = await openDept()
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('普通回复，没有选项'), undefined, { timeout: 10_000 })
  await page.waitForTimeout(300)
  const chips = await page.evaluate(() => document.querySelectorAll('.ap-quick-chip').length)
  assert.equal(chips, 0, '无选项消息不渲染 chip')
  assert.ok(fatalErrors(errors).length === 0, `零页面错误: ${errors.join(' | ')}`)
  await page.close()
})
