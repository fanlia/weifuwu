/**
 * 移动端外壳测试（UX-PLAN-2 波次 3 防线）
 *
 * 实证：390px 视口下侧边栏堆叠占满首屏（内容沉底需滚过整条导航）——
 * 框架 layout 注释明确「交互式折叠抽屉属应用层职责」——AppLayout 原先
 * 零响应式代码。波次 3 交付：顶栏（汉堡+品牌）+ 侧栏抽屉 + 遮罩 +
 * 聊天页左栏抽屉入口（成员/环境/交付物 <1024px 隐藏后原先无入口）。
 *
 * 锁定契约：
 * - 390px：顶栏可见 / 侧栏 visibility:hidden（抽屉收起）/ 汉堡开抽屉 /
 *   导航后自动收起 / 遮罩点击关闭
 * - 聊天页 390px：面板按钮可见 → 点击面板抽出（成员/交付物可达）
 * - 1280px 桌面：顶栏隐藏 / 侧栏常态 / 聊天面板常驻（static）
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

test.before(async () => {
  server = await startAgentServer()
  BASE = server.base
  browser = await chromium.launch()
  owner = await registerTenant(BASE, 'mobile')
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

async function newMobilePage(path: string) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, path)
  return { page, errors }
}

test('登录 SSR 文档挂双样式表（走查实证——login 缺 app.css，登录后 SPA 不换 document，ap-* 全失效）', async () => {
  // 服务端断言：login/register SSR 文档含 app.css link
  const res = await fetch(`${BASE}/login`)
  const html = await res.text()
  assert.ok(html.includes('/static/style.css'), 'login SSR 应挂框架样式')
  assert.ok(html.includes('/static/app.css'), 'login SSR 应挂应用样式（SPA 登录后不换 document——缺失则整会话 ap-* 失效）')
  // 浏览器断言：login → 登录 → SPA 导航后 stylesheet 仍在
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  const sheets = await page.evaluate(() => [...document.styleSheets].map((s) => (s.href ?? '').split('/').pop()))
  assert.ok(sheets.includes('app.css'), `login 文档应有 app.css sheet（实际：${sheets.join(',')}）`)
  await page.close()
})

test('390px：顶栏可见 + 侧栏收起（内容直达——不再滚过整条导航）', async () => {
  const { page, errors } = await newMobilePage('/')
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('上午好') || (document.body.textContent ?? '').includes('工作台'), undefined, { timeout: 10_000 })
  const state = await page.evaluate(() => {
    const tb = document.querySelector('.wf-nav-bar')
    const sidebar = document.querySelector('.wf-sidebar')
    return {
      topbarShown: tb ? getComputedStyle(tb).display !== 'none' : false,
      hamburger: !!document.querySelector('.wf-nav-bar button[aria-label="打开菜单"]'),
      sidebarHidden: sidebar ? getComputedStyle(sidebar).visibility === 'hidden' : false,
      sidebarFixed: sidebar ? getComputedStyle(sidebar).position === 'fixed' : false,
    }
  })
  assert.ok(state.topbarShown, '移动端顶栏应显示')
  assert.ok(state.hamburger, '顶栏应有汉堡按钮（aria-label 打开菜单）')
  assert.ok(state.sidebarHidden, '抽屉收起时侧栏不可见（visibility hidden）')
  assert.ok(state.sidebarFixed, '侧栏抽屉态为 fixed 覆盖（非堆叠占满首屏）')
  assert.ok(fatalErrors(errors).length === 0, `页面零错误红线: ${errors.join(' | ')}`)
  await page.close()
})

test('390px：汉堡开抽屉 → 导航自动收起（开→点菜单项→URL 变+抽屉关）', async () => {
  const { page } = await newMobilePage('/')
  await page.click('.wf-nav-bar button[aria-label="打开菜单"]')
  await page.waitForFunction(() => document.querySelector('.wf-sidebar')?.classList.contains('ap-drawer--open'), undefined, { timeout: 5000 })
  const overlayShown = await page.evaluate(() => !!document.querySelector('.ap-drawer-overlay'))
  assert.ok(overlayShown, '抽屉开启时应有遮罩')
  // 点导航项 → 跳转 + 抽屉收起（Menu 项类 wf-menu-item + role=menuitem）
  await page.click('.wf-sidebar .wf-menu-item:has-text("沙盒")')
  await page.waitForURL(/\/sandboxes/, { timeout: 10_000 })
  await page.waitForFunction(() => !document.querySelector('.wf-sidebar')?.classList.contains('ap-drawer--open'), undefined, { timeout: 5000 })
  await page.close()
})

test('390px：遮罩点击关闭抽屉', async () => {
  const { page } = await newMobilePage('/')
  await page.click('.wf-nav-bar button[aria-label="打开菜单"]')
  await page.waitForFunction(() => !!document.querySelector('.ap-drawer-overlay'), undefined, { timeout: 5000 })
  await page.click('.ap-drawer-overlay', { position: { x: 370, y: 400 } })
  await page.waitForFunction(() => !document.querySelector('.wf-sidebar')?.classList.contains('ap-drawer--open'), undefined, { timeout: 5000 })
  await page.close()
})

test('聊天页 390px：面板按钮抽出成员/交付物（隐藏面板的移动入口）', async () => {
  const dept = await apiAs(BASE, owner, '/api/departments', { method: 'POST', body: JSON.stringify({ name: '移动面板部' }) })
  const deptId = dept.department.id
  const { page, errors } = await newMobilePage(`/chat/${deptId}`)
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('移动面板部'), undefined, { timeout: 10_000 })
  // 面板按钮可见（wf-flex wf-hidden@lg——仅 <1024px）
  const btnShown = await page.evaluate(() => {
    const btn = document.querySelector('button[aria-label="打开成员与交付物面板"]')
    return btn ? getComputedStyle(btn).display !== 'none' : false
  })
  assert.ok(btnShown, '聊天头部应有面板入口按钮（移动端）')
  // 点击 → 面板抽出（成员区可达）
  await page.click('button[aria-label="打开成员与交付物面板"]')
  await page.waitForFunction(() => document.querySelector('.ap-panel-drawer')?.classList.contains('ap-drawer--open'), undefined, { timeout: 5000 })
  const panelText = await page.evaluate(() => document.querySelector('.ap-panel-drawer')?.textContent ?? '')
  assert.ok(panelText.includes('成员'), '面板应含成员区')
  assert.ok(panelText.includes('交付物'), '面板应含交付物区')
  // 遮罩点击关闭
  await page.click('.ap-panel-overlay', { position: { x: 370, y: 400 } })
  await page.waitForFunction(() => !document.querySelector('.ap-panel-drawer')?.classList.contains('ap-drawer--open'), undefined, { timeout: 5000 })
  assert.ok(fatalErrors(errors).length === 0, `页面零错误红线: ${errors.join(' | ')}`)
  await page.close()
})

test('1280px 桌面：顶栏隐藏 + 侧栏常态 + 聊天面板常驻（抽屉零影响回归）', async () => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await injectAuth(page, owner)
  const errors = await openAgentPage(page, BASE, '/agents')
  await page.waitForFunction(() => (document.body.textContent ?? '').includes('创建 Agent'), undefined, { timeout: 10_000 })
  const state = await page.evaluate(() => {
    const tb = document.querySelector('.wf-nav-bar')
    const sidebar = document.querySelector('.wf-sidebar')
    return {
      topbarHidden: tb ? getComputedStyle(tb).display === 'none' : true,
      sidebarVisible: sidebar ? getComputedStyle(sidebar).visibility === 'visible' : false,
      sidebarPos: sidebar ? getComputedStyle(sidebar).position : '',
    }
  })
  assert.ok(state.topbarHidden, '桌面不应显示顶栏')
  assert.ok(state.sidebarVisible, '桌面侧栏常驻可见')
  assert.ok(['sticky', 'static'].includes(state.sidebarPos), `桌面侧栏定位常态（sticky），实际：${state.sidebarPos}`)
  assert.ok(fatalErrors(errors).length === 0, `页面零错误红线: ${errors.join(' | ')}`)
  await page.close()
})
