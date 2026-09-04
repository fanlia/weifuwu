/**
 * CHAT-UX 波次 3 防线：消息密度（D1-D3）
 *
 * - D1 操作行 hover 化：桌面（hover:hover）非悬停 opacity:0、悬停/focus 展开；
 *   触屏仿真（hover:none）保持常驻（降级 = 旧行为——安全缺省）。
 *   opacity 而非 display——布局稳定 + 键盘可聚焦（display:none 摘除 Tab 序）。
 * - D2 日期分隔线：跨日相邻消息之间插入「今天/昨天/M月D日」分隔。
 * - D3 绝对时间：HH:mm（相对时间需重渲染才更新——timeVersion 死状态已删）。
 *
 * 锁定契约见每断言注释。
 */
import { buildQuery } from 'weifuwu'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, registerTenant, injectAuth, apiAs, fatalErrors,
  type AgentServer, type TenantAuth,
  testDb,
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
  owner = await registerTenant(BASE, 'wave3')
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '波次三部' }) })
  deptId = dept.department.id
  const agent = await apiAs(BASE, owner, '/api/agents', {
    method: 'POST',
    body: JSON.stringify({ name: '波次三AI', type: 'ai', system_prompt: '测试' }),
  })
  agentId = agent.agent.id ?? agent.id
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

/** SQL 直插消息（可指定 created_at——日期分隔线需要跨日种子） */
async function seedMessage(content: string, createdAt?: string): Promise<void> {
  const { postgres } = await import('weifuwu')
  const pg = testDb(BASE)
  try {
    if (createdAt) {
      await pg.query(buildQuery().insert('messages').rows([{ department_id: deptId, sender_id: agentId, content, msg_type: 'text', created_at: createdAt }]).toQuery())
    } else {
      await pg.query(buildQuery().insert('messages').rows([{ department_id: deptId, sender_id: agentId, content, msg_type: 'text' }]).toQuery())
    }
  } finally {
    await pg.close()
  }
}

test('D2+D3：日期分隔线（昨天/今天）+ 绝对时间 HH:mm（无相对时间残留）', async () => {
  // 种子：昨天一条 + 今天两条（跨日 → 分隔线）
  await seedMessage('昨天的问题', new Date(Date.now() - 86400_000).toISOString())
  await seedMessage('今天第一条')
  await seedMessage('今天第二条')
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, `/chat/${deptId}`)
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('今天第二条'), undefined, { timeout: 10_000 })
  const state = await page.evaluate(() => {
    const pills = [...document.querySelectorAll('.wf-center .wf-pill')].map((p) => (p.textContent ?? '').trim())
    const text = document.body.textContent ?? ''
    return {
      dayPills: pills,
      hasRelative: /\d+ 分钟前/.test(text) || /（刚刚）|>刚刚</.test(text),
      absTimeCount: (text.match(/\d{2}:\d{2}/g) ?? []).length,
    }
  })
  // D2：昨天 → 今天各一条分隔线
  assert.ok(state.dayPills.includes('昨天'), `应有「昨天」分隔线，实际：${state.dayPills.join(',')}`)
  assert.ok(state.dayPills.includes('今天'), `应有「今天」分隔线，实际：${state.dayPills.join(',')}`)
  // D3：相对时间清零、绝对时间存在
  assert.ok(!state.hasRelative, '不应再有「N 分钟前」相对时间（需重渲染才更新——死状态已删）')
  assert.ok(state.absTimeCount >= 3, `消息时间应为绝对 HH:mm（实际 ${state.absTimeCount} 处）`)
  assert.ok(fatalErrors(errors).length === 0, `页面零错误红线: ${errors.join(' | ')}`)
  await page.close()
})

test('D1 桌面 hover：操作行非悬停隐藏（opacity:0）+ 悬停展开（opacity:1）', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, `/chat/${deptId}`)
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('今天第二条'), undefined, { timeout: 10_000 })
  const hoverCapable = await page.evaluate(() => matchMedia('(hover: hover)').matches)
  assert.ok(hoverCapable, '桌面 chromium 应报告 hover:hover（触屏仿真是另一契约分支——见下一用例）')
  const before = await page.evaluate(() => {
    const acts = [...document.querySelectorAll('.ap-msg-actions')]
    return { count: acts.length, opacities: [...new Set(acts.map((a) => getComputedStyle(a).opacity))] }
  })
  assert.ok(before.count >= 3, `应有操作行元素（实际 ${before.count}）`)
  assert.deepEqual(before.opacities, ['0'], `非悬停时操作行应隐藏（opacity 0），实际：${before.opacities.join(',')}`)
  // 悬停消息 → 操作行展开（locator nth——分隔线 div 与消息 div 混排，:nth-of-type 会错位）
  await page.locator('[data-msgid]').nth(1).hover()
  // 等 0.12s opacity 过渡完成（立即读数取到过渡起点 0——实证 flake）
  await page.waitForFunction(() => {
    const msgs = [...document.querySelectorAll('[data-msgid]')]
    const target = msgs.find((m) => m.matches(':hover'))
    if (!target) return false
    const acts = [...target.querySelectorAll('.ap-msg-actions')]
    return acts.length > 0 && acts.every((a) => getComputedStyle(a).opacity === '1')
  }, undefined, { timeout: 3000 }).catch(() => {})
  const after = await page.evaluate(() => {
    const msgs = [...document.querySelectorAll('[data-msgid]')]
    const target = msgs.find((m) => m.matches(':hover')) ?? msgs[1]
    const acts = target ? [...target.querySelectorAll('.ap-msg-actions')] : []
    return acts.map((a) => getComputedStyle(a).opacity)
  })
  assert.ok(after.length > 0 && after.every((o) => o === '1'), `悬停消息操作行应展开（实际：${after.join(',')}）`)
  assert.ok(fatalErrors(errors).length === 0, `页面零错误红线: ${errors.join(' | ')}`)
  await page.close()
})

test('D1 触屏降级：hover:none 下操作行常驻（安全缺省——降级 = 旧行为）', async () => {
  // hasTouch: true → hover 媒体特性报告 none（触屏设备形态）
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, `/chat/${deptId}`)
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('今天第二条'), undefined, { timeout: 10_000 })
  const state = await page.evaluate(() => {
    const acts = [...document.querySelectorAll('.ap-msg-actions')]
    return {
      hoverCapable: matchMedia('(hover: hover)').matches,
      opacities: [...new Set(acts.map((a) => getComputedStyle(a).opacity))],
    }
  })
  assert.ok(!state.hoverCapable, '触屏仿真应报告 hover:none')
  assert.deepEqual(state.opacities, ['1'], `触屏操作行应常驻（opacity 1），实际：${state.opacities.join(',')}`)
  assert.ok(fatalErrors(errors).length === 0, `页面零错误红线: ${errors.join(' | ')}`)
  await page.close()
})
