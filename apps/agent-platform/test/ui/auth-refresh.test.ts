/**
 * 刷新后 401 → refresh 链防回归（2027-09——「重启后刷新跳登录」根因锁定）
 *
 * 根因链（复现实证）：
 * - access token 15min 过期；refresh token 7 天（DB 持久——重启不丢）
 * - 原实现 onUnauthorized 经 onAuth 接线的 authRef 调 refresh——
 *   **onAuth 仅在 login/refresh 成功时赋值**——**页面刷新后模块变量
 *   重置——authRef=null——401 时 refresh 未调用——直接清 token 跳登录**
 * - 「每次重启刷新跳登录」：重启往往是长时间离开后的记忆点（access
 *   必过期）——**不重启超 15min 后刷新同样跳**——根因与重启无因果
 * - 修复：onUnauthorized 直接调 authClient.refresh()（闭包直接引用——
 *   消除接线时机依赖）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { createHmac } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { startAgentServer, openAgentPage, registerTenant, waitForBodyText, type AgentServer, type TenantAuth } from './shared.ts'

let server: AgentServer
let browser: Browser
let BASE = ''
let owner: TenantAuth

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
  owner = await registerTenant(BASE, 'authrefresh')
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

/** 与 src/server/user/token.ts 同算法（HS256——.env JWT_SECRET）签已过期 access token */
function expiredToken(sub: string): string {
  const secret = (readFileSync('.env', 'utf8').match(/^JWT_SECRET=(.+)$/m)?.[1] ?? 'default-secret').trim()
  const b64 = (obj: unknown) => Buffer.from(JSON.stringify(obj)).toString('base64url')
  const now = Math.floor(Date.now() / 1000)
  const data = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub, iat: now - 3600, exp: now - 1800 })}`
  const sig = createHmac('sha256', secret).update(data).digest('base64url')
  return `${data}.${sig}`
}

test('过期 access + 有效 refresh：刷新不踢登录（refresh 链接线防回归）', async () => {
  const page = await browser.newPage()
  const userId = owner.user.id ?? ''
  assert.ok(userId, 'registerTenant 应返回 userId')
  // 注入已过期 access（服务端签名校验同 secret——exp 过去）+
  // 有效 refresh（DB 持久——注册时签发）——模拟 15min 后刷新
  await page.addInitScript(({ token, refresh }) => {
    localStorage.setItem('agent_platform_token', token)
    localStorage.setItem('agent_platform_refresh', refresh)
  }, { token: expiredToken(userId), refresh: owner.refreshToken })
  await openAgentPage(page, BASE, '/chat/new')
  // **关键断言**：不跳 /login——已登录界面（工作台导航）可见
  await waitForBodyText(page, /工作台/, 10_000)
  const path = new URL(page.url()).pathname
  assert.notEqual(path, '/login', `刷新后应保持原路径（refresh 成功）——实际跳转: ${path}`)
  // token 已被刷新（新 access 非过期签名——服务端验证通过——页面数据可载）
  const bodyHasNav = (await page.evaluate(() => document.body.innerText)).includes('工作台')
  assert.ok(bodyHasNav, '已登录界面应渲染（导航可见）')
  await page.close()
})
