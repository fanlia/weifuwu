/**
 * 呼吸灯复位测试（CHAT-UX-PLAN 波次 1 防线——C1）
 *
 * 实证：AI 回复完成（tokens 徽章已渲染）后左栏成员仍「干活中…」——
 * 服务端 wf:done/token/tool 裸发（无 agentId）→ 客户端 `ev.agentId ?? 'ai'`
 * 关灯打在 'ai' 上——真实 agentId 永不复位。
 *
 * 修复面（双端）：
 * - 服务端：emitWf 单点包装——所有 wf:* 事件带 agentId（services.test.ts 契约）
 * - 客户端：wf-events done/error 无 agentId 时从消息 sender_id 推导（兜底）
 *
 * 本文件用确定性 wf 注入钩子（/api/test/wf——不依赖真实 LLM）端到端锁定：
 * - 开灯：wf:step llm（带 agentId）→ 成员显示「干活中…」
 * - 关灯（兜底路径）：wf:done **不带 agentId**（同 messageId——sender 推导）→ 复位「空闲」
 * - 关灯（标准路径）：wf:done 带 agentId → 复位「空闲」
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, registerTenant, injectAuth, apiAs,
  waitForBodyText,
  type AgentServer, type TenantAuth,
} from './shared.ts'

let server: AgentServer
let browser: Browser
let BASE = ''
let owner: TenantAuth
let deptId = ''
let agentId = ''

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
  owner = await registerTenant(BASE, 'breath')
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '呼吸灯部门' }) })
  deptId = dept.department.id
  const agent = await apiAs(BASE, owner, '/api/agents', {
    method: 'POST', body: JSON.stringify({ name: '呼吸AI', type: 'ai', system_prompt: '测试' }),
  })
  agentId = agent.agent?.id ?? agent.id
  await apiAs(BASE, owner, `/api/departments/${deptId}/members`, {
    method: 'POST', body: JSON.stringify({ agent_id: agentId }),
  })
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

/** 注入 wf 事件到部门房间（确定性钩子） */
async function injectWf(events: any[]): Promise<void> {
  const r = await fetch(`${BASE}/api/test/wf`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ room: deptId, events }),
  })
  if (!r.ok) throw new Error(`wf 注入失败: ${await r.text()}`)
}

/** 左栏成员状态读数（干活中…/空闲） */
async function memberStatus(page: import('playwright').Page): Promise<string | null> {
  return page.evaluate((aid) => {
    const rows = [...document.querySelectorAll('aside div')]
    const row = rows.find((r) => r.querySelector(`img, span`) && r.textContent?.includes('呼吸AI'))
    const status = [...document.querySelectorAll('aside span')].find((s) => /^(干活中…|空闲)$/.test((s.textContent ?? '').trim()))
    return status ? (status.textContent ?? '').trim() : null
  }, agentId)
}

test('C1：开灯（step llm 带 agentId）→ 干活中；关灯（done 无 agentId——sender 推导兜底）→ 空闲', async () => {
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, `/chat/${deptId}`)
  await waitForBodyText(page, '呼吸灯部门')
  assert.equal(await memberStatus(page), '空闲', '初始空闲')

  // 开灯：wf:step llm（带 agentId——首帧事件）
  await injectWf([{ type: 'wf:step', messageId: 'msg-breath-1', agentId, agentName: '呼吸AI', stepType: 'llm' }])
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('干活中…'), undefined, { timeout: 10_000 })

  // 关灯（兜底路径）：wf:done 不带 agentId（复现旧服务端形态——sender 推导必须复位）
  await injectWf([{ type: 'wf:done', messageId: 'msg-breath-1', content: '完成内容' }])
  await page.waitForFunction(() => !(document.body.textContent ?? '').includes('干活中…'), undefined, { timeout: 10_000 })
  assert.equal(await memberStatus(page), '空闲', 'done 无 agentId——sender 推导必须复位呼吸灯')
  await page.close()
})

test('C1：关灯（done 带 agentId——服务端修复后的标准路径）→ 空闲', async () => {
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, `/chat/${deptId}`)
  await waitForBodyText(page, '呼吸灯部门')
  // 开灯
  await injectWf([{ type: 'wf:step', messageId: 'msg-breath-2', agentId, agentName: '呼吸AI', stepType: 'llm' }])
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('干活中…'), undefined, { timeout: 10_000 })
  // 关灯（标准路径：带 agentId——服务端 emitWf 修复后的形态）
  await injectWf([{ type: 'wf:done', messageId: 'msg-breath-2', agentId, content: '完成' }])
  await page.waitForFunction(() => !(document.body.textContent ?? '').includes('干活中…'), undefined, { timeout: 10_000 })
  await page.close()
})
