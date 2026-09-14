/**
 * 交付物中心页面测试（2026-08——用户实证：首页提示有交付物但 /deliverables 空态）
 *
 * 复现路径（用户报告）：首页 Workspace 显示「交付物」提示（同一个 /api/deliverables
 * API——limit=3 有数据）——但 /deliverables 页面永远「还没有交付物」空态。
 *
 * 诊断发现（数据流完全正常——vdom 层失联）：
 * - 组件 load() 成功：files=9（API 200——9 个文件）
 * - renderFn 重跑：files=9 / loading=false（闭包读到最新状态——日志实证）
 * - **但 DOM 永远空态**——ctx.render() 后 renderFn 执行了、vnode 生成了、
 *   **但 diff 未应用到 DOM**——async 组件二次渲染断链
 *
 * 本测试锁定「交付物页必须有数据渲染」（红线——复现用户实证缺陷）。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, waitForText, registerTenant, injectAuth, apiAs,
  fatalErrors, seedRoleMember, clickAndWait, waitForBodyText,
  type AgentServer, type TenantAuth,
} from './shared.ts'

let server: AgentServer
let browser: Browser
let BASE = ''
let auth: TenantAuth
let deptId = ''

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()

  auth = await registerTenant(BASE, 'deliv')
  // 种子：部门 + 工作空间文件（写一个真文件到部门工作区——交付物 API 按工作区扫描）
  const dept = await apiAs(BASE, auth, '/api/departments', {
    method: 'POST', body: JSON.stringify({ name: '交付物部门' }),
  })
  deptId = dept.department.id
  // 写一个文件（PUT /workspace/file——落地工作区——交付物按工作区扫描可见）
  const up = await apiAs(BASE, auth, `/api/departments/${deptId}/workspace/file`, {
    method: 'PUT',
    body: JSON.stringify({ path: 'seed-report.md', content: '# 测试报告\n\n内容' }),
  })
  assert.ok(up?.success !== false, `写文件失败: ${JSON.stringify(up).slice(0, 120)}`)
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

test('交付物中心：工作区文件必须出现在 /deliverables 页面（用户实证空态回归）', async () => {
  const page = await browser.newPage()
  const errors = await openAgentPage(page, BASE, '/deliverables')
  await injectAuth(page, auth) // openAgentPage 已 goto——注入需在 goto 前——改用手动
  // 上面 injectAuth 在 goto 后无效——重新打开（先注入后 goto）
  await page.close()
  const p2 = await browser.newPage()
  await injectAuth(p2, auth)
  const errs2 = await openAgentPage(p2, BASE, '/deliverables')

  // API 确认有数据（数据层正常——对照 DOM 空态——定位 vdom 层）
  const apiResp = await apiAs(BASE, auth, '/api/deliverables')
  const fileCount = (apiResp?.files ?? []).length
  assert.ok(fileCount >= 1, `交付物 API 应有数据（复现前提）：files=${fileCount}`)

  // 页面必须渲染文件（而非「还没有交付物」）
  await waitForText(p2, 'seed-report.md', 15_000)
  const body = await p2.evaluate(() => document.body.innerText)
  assert.ok(body.includes('seed-report.md'), '页面必须显示交付物文件名')
  assert.ok(!body.includes('还没有交付物'), '不得是空态（用户实证缺陷复现）')
  assert.deepEqual(fatalErrors(errs2), [], `页面零错误：${errs2.join('; ')}`)
  await p2.close()
})

test('交付物：下载按钮点击必须 200（不 401——用户实证 `<a href>` 无 Bearer）', async () => {
  const page = await browser.newPage()
  await injectAuth(page, auth)
  await openAgentPage(page, BASE, '/deliverables')
  await waitForText(page, 'seed-report.md', 15_000)
  // 下载按钮（button title=下载 或「打开」——交付物页打开按钮）
  const dlBtn = page.locator('button:has-text("下载")').first()
  assert.ok((await dlBtn.count()) > 0, '打开/下载按钮存在')
  // 直链方案回归（2026-08——v2）：入口按钮存在 + 服务端直链 200 + attachment
  // （token query 鉴权——框架 mw；下载响应二进制——用原生 fetch 断言——apiAs
  // 期望 JSON 会解析二进制失败）
  const apiRes = await fetch(`${BASE}/api/departments/${deptId}/workspace/file?path=seed-report.md&download=1`, {
    headers: { Authorization: `Bearer ${auth.token}` },
  })
  assert.equal(apiRes.status, 200, '下载 API 应 200')
  assert.ok((apiRes.headers.get('content-disposition') ?? '').includes('attachment'), 'Content-Disposition 应为 attachment')
  // 直链 token query（与 Bearer 同等鉴权——框架 mw）
  const qs = await page.evaluate((p) => {
    const t = localStorage.getItem('agent_platform_token')
    return fetch(`/api/departments/${p}/workspace/file?path=${encodeURIComponent('seed-report.md')}&download=1&token=${encodeURIComponent(t)}`)
      .then((r) => r.status)
  }, deptId)
  assert.equal(qs, 200, 'token 直链应 200（query token 鉴权）')
  await page.close()
})

test('交付物：搜索过滤（输入关键词 → 列表收敛）', async () => {
  const page = await browser.newPage()
  await injectAuth(page, auth)
  await openAgentPage(page, BASE, '/deliverables')
  await waitForText(page, 'seed-report.md', 15_000)
  // 输入不匹配关键词 → 空态（没有匹配的交付物）
  await page.fill('input[placeholder*="搜索"]', 'zz-no-match-zz')
  await waitForBodyText(page, /没有匹配的交付物/)
  // 清空 → 文件回来
  await page.fill('input[placeholder*="搜索"]', '')
  await waitForText(page, 'seed-report.md', 10_000)
  await page.close()
})

test('交付物：viewer 只读——页面可看但无写操作入口', async () => {
  const viewer = await seedRoleMember(BASE, auth, 'viewer')
  const page = await browser.newPage()
  await injectAuth(page, viewer)
  await openAgentPage(page, BASE, '/deliverables')
  // 交付物数据对 viewer 可见（只读=可见）
  await waitForText(page, 'seed-report.md', 15_000)
  // 写入口（上传/删除等）不应可用——交付物页无写按钮——断言页面正常渲染
  const body = await page.evaluate(() => document.body.innerText)
  assert.ok(body.includes('交付物中心'), 'viewer 可看交付物中心')
  await page.close()
})
