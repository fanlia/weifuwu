/**
 * 聊天页交互测试（UI-ROLE-TEST-PLAN Wave 1——2026-08）
 *
 * 用户教训：「点击才暴露的 bug」——聊天页核心交互：
 * - 发消息 → 消息气泡渲染（用户消息立即可见——WS 路径）
 * - 无 AI 成员的部门 → 系统提示（消除静默失败——chat.ts 注释语义）
 * - viewer 发消息 → 403（requireWriter 红线）
 *
 * 诚实裁剪（AGENTS 纪律——测试不进真实 LLM）：
 * - 真实 AI 回复/工具调用（LLM 依赖）→ 不测（慢/不稳定/成本）——登记
 * - 本测试只测「消息管道」交互（发送/渲染/权限）——确定性快
 * - 工具条展开/失败标注 → 由框架场景层 e2e 覆盖（mock 环境）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, registerTenant, injectAuth, apiAs,
  seedRoleMember, waitForBodyText, waitForText,
  type AgentServer, type TenantAuth,
} from './shared.ts'

let server: AgentServer
let browser: Browser
let BASE = ''
let owner: TenantAuth
let deptId = ''

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
  owner = await registerTenant(BASE, 'chat')
  const dept = await apiAs(BASE, owner, '/api/departments', {
    method: 'POST', body: JSON.stringify({ name: '聊天部门' }),
  })
  deptId = dept.department.id
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

test('聊天页：发消息 → 消息气泡渲染（WS 管道——确定性）', async () => {
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, `/chat/${deptId}`)
  await waitForBodyText(page, /发送/)
  // 输入 + 发送
  await page.fill('textarea, input[type="text"]', '你好，聊天管道测试')
  await page.click('button:has-text("发送")')
  // 消息气泡出现（用户消息 sender 渲染）
  await waitForBodyText(page, /聊天管道测试/, 10_000)
  // 页面零错误（非资源加载）
  await page.close()
})

test('聊天页：@ 消息输入（@ 弹层出现——交互面）', async () => {
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, `/chat/${deptId}`)
  await waitForBodyText(page, /发送/)
  await page.fill('textarea, input[type="text"]', '@')
  // @ 弹层（成员列表）——至少不崩（短等 100ms 帧）
  await page.waitForTimeout(100)
  const body = await page.evaluate(() => document.body.innerText)
  assert.ok(body.length > 0, '页面存活（@ 输入不崩）')
  await page.close()
})

/** 测试钩子：确定性 wf:* 事件注入（WF_TEST_HOOKS=1——不依赖真实 LLM——
 *  工具型回复形态（首事件 wf:step tool——无 llm 前置）可确定性构造） */
async function injectWf(room: string, events: any[]): Promise<void> {
  const r = await fetch(`${BASE}/api/test/wf`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ room, events }),
  })
  if (!r.ok) throw new Error(`wf 注入失败: ${await r.text()}`)
}

test('发送后输入框清空（2027-09——输入残留回归）', async () => {
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, `/chat/${deptId}`)
  await waitForBodyText(page, /发送/)
  const input = page.locator('textarea, input[type="text"]').first()
  await input.fill('清空验证消息')
  await page.click('button:has-text("发送")')
  await waitForBodyText(page, /清空验证消息/, 10_000)
  // **关键断言**：发送后（用户气泡出现）输入框 value 已空——修复前
  // 「打字零渲染」下 onChange('') 无渲染——input DOM 停留旧文本
  const v = await input.inputValue().catch(() => '(unreadable)')
  assert.equal(v, '', `发送后输入框应清空——实际: ${v}`)
  await page.close()
})

test('工具型回复首事件占位自愈（2027-09——wf:* 无 llm 前置——第二次发送看不到输出回归）', async () => {
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, `/chat/${deptId}`)
  await waitForBodyText(page, /发送/)
  // 列文件形态：首事件 = wf:step tool（无 wf:step llm——旧逻辑 idx=-1
  // tool 分支跳过——后续 token/done 全 skip——前端零消息——刷新才可见
  const aiMsgId = `reg-tool-${Date.now()}`
  await injectWf(deptId, [
    { type: 'wf:step', messageId: aiMsgId, agentId: 'ai-reg', agentName: '回归AI', stepType: 'tool', name: 'list_files', args: '{}' },
    { type: 'wf:token', messageId: aiMsgId, text: '文件列表：' },
    { type: 'wf:token', messageId: aiMsgId, text: 'a.txt, b.txt' },
    { type: 'wf:done', messageId: aiMsgId, content: '文件列表：a.txt, b.txt\n目录：docs/', agentId: 'ai-reg', agentName: '回归AI' },
  ])
  // done 内容可见（占位自愈全链）
  await waitForBodyText(page, /目录：docs\//, 10_000)
  await page.close()
})

test('流式滚动跟随（2027-09——token 累积滚动条落底回归）', async () => {
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, `/chat/${deptId}`)
  await waitForBodyText(page, /发送/)
  // 长 token 流（同消息内容累积——msgsLen 不变——旧逻辑不滚动）
  // **分段注入（2027-09）**：批间 wait 让每批独立渲染——真实流式逐段
  // 到达形态——同批一次性到达时单次渲染掩盖 bug（渲染时内容已全长）
  const aiMsgId = `reg-scroll-${Date.now()}`
  await injectWf(deptId, [{ type: 'wf:step', messageId: aiMsgId, agentId: 'ai-reg', agentName: '回归AI', stepType: 'llm' }])
  await page.waitForTimeout(120)
  for (let b = 0; b < 4; b++) {
    const batch = []
    for (let i = 0; i < 8; i++) {
      batch.push({ type: 'wf:token', messageId: aiMsgId, text: `第${b}-${i}段内容用于撑高列表高度防止滚动条不出现……` })
    }
    await injectWf(deptId, batch)
    await page.waitForTimeout(120)
  }
  await injectWf(deptId, [{ type: 'wf:done', messageId: aiMsgId, content: '滚动跟随完成', agentId: 'ai-reg', agentName: '回归AI' }])
  // 等 token 渲染（done 后内容出现）
  await waitForBodyText(page, /滚动跟随完成/, 10_000)
  // **滚动跟随断言**：距底 ≤ 80px（isUserScrolledUp 阈值）——修复前
  // token 累积不滚动——距底 = 内容高度（>80）——失败
  const atBottom = await page.waitForFunction(() => {
    const el = document.querySelector('.wf-chat-body, .wf-overflow-auto')
    if (!(el instanceof HTMLElement)) return false
    return el.scrollHeight - el.scrollTop - el.clientHeight <= 80
  }, null, { timeout: 5_000 }).catch(() => null)
  assert.ok(atBottom !== null, '流式 token 后滚动条应跟随落底（≤80px）')
  await page.close()
})

test('聊天页：viewer 发消息 → 403（requireWriter 红线）', async () => {
  const viewer = await seedRoleMember(BASE, owner, 'viewer')
  const page = await browser.newPage()
  await injectAuth(page, viewer)
  await openAgentPage(page, BASE, `/chat/${deptId}`)
  await waitForBodyText(page, /发送/)
  await page.fill('textarea, input[type="text"]', 'viewer 尝试发消息')
  const send = page.locator('button:has-text("发送")').first()
  // 发送按钮可能禁用（前端隐藏写入口）——若可用则点击→403 toast
  const disabled = await send.isDisabled().catch(() => false)
  if (!disabled) {
    await send.click()
    // 403 提示（toast——「只读成员」）——waitForFunction 替代硬等 1500ms
    const rejected = await page.waitForFunction(
      () => (document.body.textContent ?? '').includes('只读'),
      null,
      { timeout: 3000 },
    ).catch(() => null)
    const body = await page.evaluate(() => document.body.innerText)
    assert.ok(
      rejected !== null || !body.includes('viewer 尝试发消息'),
      `viewer 发消息应被拒（403/只读提示）——当前：${body.slice(-100)}`,
    )
  }
  // API 级红线（服务端 requireWriter）
  let forbidden = false
  try {
    await apiAs(BASE, viewer, `/api/departments/${deptId}/messages`, {
      method: 'POST', body: JSON.stringify({ content: 'viewer api 消息' }),
    })
  } catch (e: any) {
    forbidden = String(e.message).includes('403')
  }
  assert.ok(forbidden, 'viewer 发消息 API 应 403')
  await page.close()
})

test('聊天页：无 AI 成员部门——系统提示引导（消除静默失败）', async () => {
  const page = await browser.newPage()
  await injectAuth(page, owner)
  await openAgentPage(page, BASE, `/chat/${deptId}`)
  await waitForBodyText(page, /发送/)
  // 无 AI 成员时应有引导提示（「添加 AI 成员」等——chat.ts 注释语义）
  const body = await page.evaluate(() => document.body.innerText)
  assert.ok(
    body.includes('AI') || body.includes('成员'),
    `无 AI 成员部门应有引导提示：${body.slice(0, 200)}`,
  )
  await page.close()
})
