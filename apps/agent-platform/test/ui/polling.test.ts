/**
 * E1 轮询补偿场景测试（G5——ROADMAP E 余项）
 *
 * 场景（真实浏览器——WS 永久断线 + HTTP 可达）：
 * - window.WebSocket 覆写为永不 onopen 的 stub（模拟 WS 通道整体不可用
 *   ——重连持续失败——HTTP 请求不受影响）
 * - Chat 挂载：ws 状态 = false → E1 轮询启动（__WF_CHAT_POLL_MS 覆写 400ms）
 * - 断线期间经 API 发消息（广播不可达——轮询是唯一接收通道）
 * - 等一个轮询周期 → 消息经 HTTP 补拉出现（id 去重——恰好一次）
 * - 页面上「连接断开」徽章可见（断线感知——E1 兜底的前提）
 *
 * 单独运行：node --env-file=.env --test apps/agent-platform/test/ui/polling.test.ts
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
const MARK = `🔄 轮询兜底消息 ${Date.now()}`

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
  auth = await registerTenant(BASE, 'polling')
  const dept = await apiAs(BASE, auth, '/api/departments', {
    method: 'POST', body: JSON.stringify({ name: '轮询测试部' }),
  })
  deptId = dept.department.id
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

test('E1 轮询补偿：WS 永久断线——轮询兜底拉取断线期间消息（恰好一次）', async () => {
  const context = await browser.newContext()
  const page = await context.newPage()
  try {
    await injectAuth(page, auth)
    // WS 通道整体不可用（stub 永不 onopen——重连持续失败）——HTTP 不受影响
    await context.addInitScript(() => {
      ;(window as any).__WF_CHAT_POLL_MS = 400 // 快轮询（生产默认 30s）
      const Stub = function (this: any, _url: string) {
        this.readyState = 0 // CONNECTING——永不 OPEN
        this.onmessage = null; this.onopen = null; this.onclose = null; this.onerror = null
        this.send = (_d: string) => {} // 静默——stub 不发送
        this.close = () => {} // 静默——不触发 onclose（永不重启信号）
      } as unknown as typeof WebSocket
      ;(window as any).WebSocket = Stub
    })
    const errors = await openAgentPage(page, BASE, `/chat/${deptId}`)
    await waitForText(page, '轮询测试部')

    // 断线徽章可见（ws 未连——E1 兜底的前提感知）——waitForText 后徽章稳定
    const badge = await page.evaluate(() => document.body.textContent?.includes('连接断开') ?? false)
    assert.ok(badge, '「连接断开」徽章（WS 通道不可用感知）')

    // 断线期间经 API 发消息（广播不可达——轮询是唯一接收通道）
    const sent = await apiAs(BASE, auth, `/api/departments/${deptId}/messages`, {
      method: 'POST', body: JSON.stringify({ content: MARK }),
    })
    assert.ok(sent.id || sent.message?.id, '服务端已入库')

    // 轮询兜底：HTTP 补拉（400ms 周期——最多几个周期内出现）
    await waitForText(page, MARK, 10_000)

    // 恰好一次（id 去重——轮询多次 merge 不重复上屏）
    const count = await page.evaluate(
      (t) => [...document.querySelectorAll('[data-msgid]')]
        .filter((el) => (el.textContent ?? '').includes(t)).length,
      MARK,
    )
    assert.equal(count, 1, `轮询补拉消息恰好一次（实际 ${count} 次——去重失效）`)

    assert.deepEqual(fatalErrors(errors), [], `零错误（实际: ${fatalErrors(errors)[0] ?? '无'}）`)
  } finally {
    await context.close()
  }
})
