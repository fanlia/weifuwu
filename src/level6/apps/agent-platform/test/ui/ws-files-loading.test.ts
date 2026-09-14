/**
 * 工作空间文件区：重进永久「加载中」修复防线（2027-10 用户实证）
 *
 * 根因（组件层——FilesSection 模块级快照回归）：2027-08 防自喂循环引入
 * same 快照跳过——模块级 Map 跨实例存活，但「快照命中 ≠ 本实例已初始化」：
 * 首访存下列表签名 → 离开再进入 → 新实例 wsLoading=true（DepartmentDetail
 * 无 initialFiles）→ loadWsList 命中 same → 跳过 wsLoading=false →
 * 永久 <Loading />。列表未变（含「看不到文件」的 .pending 惰性目录形态）
 * 即触发——精确匹配用户报告「没有文件就一直显示加载中」。
 *
 * 锁定契约：
 * - 重进（模块快照已热）：加载态必须翻转、条目与离开前一致
 * - 防自喂循环语义保持：手动刷新 + 数据未变 → 恰 1 次 /workspace/list 请求
 * （判负：零闪烁首拍断言——观测点落在页面数据加载时序上（部门详情先拉
 *   dept 数据再挂文件区）——非本修复可观测面——脆弱判负 2027-10）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import {
  startAgentServer, openAgentPage, registerTenant, injectAuth, apiAs, fatalErrors,
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
  owner = await registerTenant(BASE, 'wsfiles')
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '工作区部' }) })
  deptId = dept.department.id
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

/** 等文件区加载完成（非 loading 态）并返回条目签名 */
async function settleSection(page: import('playwright').Page, timeout = 10_000): Promise<{ count: number; names: string }> {
  await page.waitForFunction(() => {
    const sec = document.querySelector('#sec-files')
    return sec && !sec.querySelector('.wf-loading') && (sec.textContent ?? '').includes('工作空间文件')
  }, undefined, { timeout })
  return page.evaluate(() => {
    const sec = document.querySelector('#sec-files')
    const entries = [...(sec?.querySelectorAll('button') ?? [])]
      .map((b) => (b.textContent ?? '').trim())
      .filter((t) => t.endsWith('/') || /\d+(\.\d+)?(KB|B)/.test(t))
    return { count: entries.length, names: entries.join(',') }
  })
}

test('重进部门（模块快照已热）：加载态翻转 + 条目一致——永久加载中回归哨兵', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, `/departments/${deptId}`)
  const first = await settleSection(page)
  // SPA 客户端导航走（⚠️ 必须非 goto——goto 全页刷新重置模块级 Map，不复现）——
  // 先进同部门聊天页（Chat 也挂 FilesSection 同 deptId——先存快照）再回详情页
  await page.evaluate(() => {
    const link = [...document.querySelectorAll('a,button,[role="button"]')].find((el) => (el.textContent ?? '').includes('进入聊天')) as HTMLElement | undefined
    link?.click()
  })
  await page.waitForFunction(() => /\/chat\//.test(location.pathname), undefined, { timeout: 10_000 })
  await page.waitForFunction(() => !!document.querySelector('#sec-files'), undefined, { timeout: 10_000 })
  await page.waitForTimeout(600) // Chat 文件区完成首载（快照落盘）
  await page.evaluate(() => {
    const link = [...document.querySelectorAll('a,button,[role="button"]')].find((el) => (el.textContent ?? '').includes('部门详情')) as HTMLElement | undefined
    link?.click()
  })
  await page.waitForFunction(() => /\/departments\//.test(location.pathname), undefined, { timeout: 10_000 })
  // 关键断言：重进后 5s 内必须到非加载态（修复前：wf-loading 永驻）
  const second = await settleSection(page, 5_000)
  const stillLoading = await page.evaluate(() => !!document.querySelector('#sec-files .wf-loading'))
  assert.ok(!stillLoading, '重进部门不应永久显示加载中（same 快照命中必须初始化本地态）')
  assert.equal(second.count, first.count, `重进后条目数应一致（离开前 ${first.count} 项 / 重进后 ${second.count} 项）`)
  assert.ok(fatalErrors(errors).length === 0, `页面零错误红线: ${errors.join(' | ')}`)
  await page.close()
})

test('防自喂循环语义保持：手动刷新 + 数据未变 → 恰 1 次列表请求（零渲染风暴回归）', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(page, owner)
  let listRequests = 0
  page.on('request', (req) => {
    if (req.url().includes(`/api/departments/${deptId}/workspace/list`)) listRequests++
  })
  const errors = await openAgentPage(page, BASE, `/departments/${deptId}`)
  await settleSection(page)
  const afterLoad = listRequests
  await page.click('#sec-files button:has-text("刷新")')
  await page.waitForTimeout(800)
  assert.equal(listRequests, afterLoad + 1, `手动刷新应恰发 1 次列表请求（实际 ${listRequests - afterLoad}）——防重入/自喂循环回归`)
  const secOk = await page.evaluate(() => {
    const sec = document.querySelector('#sec-files')
    return sec && !sec.querySelector('.wf-loading')
  })
  assert.ok(secOk, '刷新后仍为非加载态（数据未变——本地态保持）')
  assert.ok(fatalErrors(errors).length === 0, `页面零错误红线: ${errors.join(' | ')}`)
  await page.close()
})
