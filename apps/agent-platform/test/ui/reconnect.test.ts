/**
 * A2 断线补拉场景测试（G2——ROADMAP 验收债清偿）
 *
 * 场景（真实浏览器 + 真实 ws——A2 契约）：
 * 1. 打开 /chat/:id——ws 连接 + 订阅房间 + 消息初始加载
 * 2. setOffline(true)——ws 断线（CDP 网络仿真——浏览器真实断连）
 * 3. 断线期间经 API 发消息（服务端仍在线——广播时 ws 已断——消息丢失）
 * 4. setOffline(false)——ws 自动重连（1s 底退避）→ onStatusChange(true)
 *    → 重发订阅 + loadMessages(true) 补拉合并（id 去重——不重复上屏）
 * 5. 断言：断线期间消息出现**恰好一次**（补拉不重复——A2 核心契约）
 *
 * 单独运行：node --env-file=.env --test apps/agent-platform/test/ui/reconnect.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, fatalErrors, waitForText,
  registerTenant, injectAuth, apiAs,
  type AgentServer, type TenantAuth,
} from './shared.ts'

let server: AgentServer
let browser: Browser
let BASE = ''
let auth: TenantAuth
let deptId = ''
const MARK = `⏱ 断线补拉消息 ${Date.now()}`
/** 断线期间发的消息（广播时 ws 已断——A2 补拉唯一来源） */

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
  auth = await registerTenant(BASE, 'reconnect')
  const dept = await apiAs(BASE, auth, '/api/departments', {
    method: 'POST', body: JSON.stringify({ name: '重连测试部' }),
  })
  deptId = dept.department.id
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

test('A2 断线补拉：断线期间消息在重连后出现且恰好一次（id 去重）', async () => {
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await injectAuth(page, auth)
    // 快看门狗覆写（生产默认 15s/35s——测试加速：500ms 心跳/1.5s 超时）
    await context.addInitScript(() => {
      ;(window as any).__WF_WS_PING = { intervalMs: 500, timeoutMs: 1500 }
    })
    const errors = await openAgentPage(page, BASE, `/chat/${deptId}`)
    // 初始帧：聊天页渲染（等消息区出现——初始 0 条也渲染）
    await waitForText(page, '重连测试部')

    // 断线（CDP 网络仿真——ws 静默挂起——浏览器不触发 close/error）
    await context.setOffline(true)
    await page.waitForTimeout(600) // 让断网落地（socket 挂起态）

    // 断线期间经 API 发消息（服务端在线——广播时无 ws 订阅者——消息丢失）
    const sent = await apiAs(BASE, auth, `/api/departments/${deptId}/messages`, {
      method: 'POST', body: JSON.stringify({ content: MARK }),
    })
    assert.ok(sent.id || sent.message?.id, '服务端已入库')

    // 恢复网络——看门狗（静默超时 1.5s）强制 close → 重连（1s 底退避）→
    // onStatusChange(true) → 重发订阅 + loadMessages(true) 补拉
    await context.setOffline(false)
    await waitForText(page, MARK, 12_000)

    // 恰好一次（id 去重——补拉不重复上屏——A2 核心契约）
    // 消息元素（data-msgid）子串计数——消息渲染有稳定的 data-msgid 锚
    // （文本节点可能跨兄弟拆分——叶子计数脆——消息元素计数稳）
    const count = await page.evaluate(
      (t) => [...document.querySelectorAll('[data-msgid]')]
        .filter((el) => (el.textContent ?? '').includes(t)).length,
      MARK,
    )
    assert.equal(count, 1, `补拉消息恰好一次（实际 ${count} 次——重复上屏 = 去重失效）`)

    assert.deepEqual(fatalErrors(errors), [], `零错误（实际: ${fatalErrors(errors)[0] ?? '无'}）`)
  } finally {
    await context.close()
  }
})
