/**
 * 场景 e2e——playwright 访问真实页面断言 DOM 行为
 *
 * 运行：node src/test/scenario/e2e.ts（自动起 server——端口 3299）
 * 断言纪律：真实 DOM（outerHTML/rect/portal 归属）——不用 textContent 掩盖结构。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser, type Page } from 'playwright'
import { spawn, type ChildProcess } from 'node:child_process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = resolve(fileURLToPath(new URL('.', import.meta.url)))

const PORT = 0 // 随机端口（自包含——避免端口残留/TIME_WAIT）——实际端口从 server stdout 解析
let BASE = ''

let server: ChildProcess
let browser: Browser

test.before(async () => {
  const serverPath = resolve(__dirname, 'server.ts')
  const repoRoot = resolve(__dirname, '..', '..', '..') // src/test/scenario → 仓库根
  server = spawn('node', [serverPath], {
    cwd: repoRoot, // 仓库根（server 内相对路径：./src/test/scenario/main.tsx）
    env: { ...process.env, SCENARIO_PORT: String(PORT) },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  server.stdout?.on('data', (d) => { logs += String(d) })
  server.stderr?.on('data', (d) => { logs += String(d) })
  // 等待端口日志（确定性等待）
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) break
    const m = logs.match(/server on :(\d+)/)
    if (m) {
      BASE = `http://localhost:${m[1]}`
      break
    }
    await new Promise((r) => setTimeout(r, 100))
  }
  if (!BASE) throw new Error(`scenario server 启动失败:\n${logs}`)
  // 确认可响应
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(`${BASE}/`); if (r.ok) break } catch { /* not ready */ }
    await new Promise((r) => setTimeout(r, 100))
  }
  browser = await chromium.launch()
})

test.after(async () => {
  await browser?.close()
  server?.kill()
})

async function openScenario(page: Page, id: string): Promise<void> {
  page.on('pageerror', (e) => console.error('[pageerror]', String(e).slice(0, 300)))
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console.error]', m.text().slice(0, 300)) })
  try {
    await page.goto(`${BASE}/scenario/${id}`, { waitUntil: 'networkidle' })
    // 首帧渲染完成（场景 root 有内容）
    await page.waitForSelector('#root > *')
  } catch (e) {
    console.error('[openScenario]', BASE, id, String(e).slice(0, 200))
    throw e
  }
}

// ── 场景 1：占位同构（§6.3 提交按钮消失事故回归） ──────────────────────
// children 含 false 占位——DOM 同构（childNodes 长度恒定）——
// diff 不误删兄弟（按钮保留）——空洞 → 真实元素切换（Alert 在按钮前）。
test('hole-placeholder：false 占位不误删兄弟——空洞切换位置正确', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, 'hole-placeholder')

    // 首帧：字段 + 按钮存在（false 占位 = 注释节点——按钮不被误删）
    const before = await page.evaluate(() => document.querySelector('.hole-scene')!.childNodes.length)
    assert.equal(before, 3, '三个槽位（字段/占位/按钮）——childNodes 恒定')
    assert.equal(await page.locator('.submit-btn').count(), 1, '按钮保留（占位不塌缩）')

    // 点击 → false → 真实 Alert——出现在按钮前（位置正确）
    await page.click('.submit-btn')
    await page.waitForSelector('.alert-item')
    const html = await page.evaluate(() => document.querySelector('.hole-scene')!.innerHTML)
    assert.ok(html.indexOf('alert-item') < html.indexOf('submit-btn'), 'Alert 在按钮前（槽位 2 插入——不误删兄弟）')
    assert.equal(await page.locator('.submit-btn').count(), 1, '切换后按钮仍保留')
    assert.equal(await page.locator('.alert-item').textContent(), '错误提示')
  } finally {
    await page.close()
  }
})

// ── 场景 2：组件复用（工厂不重跑——内部 let 状态保持） ──────────────────
test('component-reuse：父重渲染不重挂子组件——内部状态保持', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, 'component-reuse')

    // 子组件内部点击（count 1）——父重渲染（改标签）——count 不丢
    await page.click('.counter-btn')
    await page.waitForFunction(() => document.querySelector('.counter-btn')?.textContent === '计数 1')
    await page.click('.relabel-btn')
    await page.waitForFunction(() => document.querySelector('.relabel-btn')?.textContent?.startsWith('改标签 初始!'))
    assert.equal(await page.locator('.counter-btn').textContent(), '计数 1', '父重渲染后子组件状态保持（工厂不重跑）')
  } finally {
    await page.close()
  }
})

// ── 场景 3：keyed 身份跟随（重排状态不漂移） ───────────────────────────
test('keyed-reorder：重排后 key 身份跟随内容——状态不漂移', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, 'keyed-reorder')

    // 勾选「甲」——重排（丙甲乙）——「甲」仍保持已选（key 身份跟随）
    const items = () => page.evaluate(() =>
      Array.from(document.querySelectorAll('.keyed-item')).map((el) => ({
        name: el.querySelector('.item-name')!.textContent,
        picked: el.querySelector('.pick-btn')!.textContent,
      })))
    assert.deepEqual(await items(), [
      { name: '甲', picked: '未选' }, { name: '乙', picked: '未选' }, { name: '丙', picked: '未选' },
    ])

    await page.locator('.keyed-item').nth(0).locator('.pick-btn').click()
    await page.waitForFunction(() => document.querySelectorAll('.keyed-item')[0]?.querySelector('.pick-btn')?.textContent === '已选')

    await page.click('.shuffle-btn')
    await page.waitForFunction(() => document.querySelectorAll('.keyed-item')[0]?.querySelector('.item-name')?.textContent === '丙')
    assert.deepEqual(await items(), [
      { name: '丙', picked: '未选' }, { name: '甲', picked: '已选' }, { name: '乙', picked: '未选' },
    ], '重排后「甲」的已选状态跟随 key（不漂移到新位置）')
  } finally {
    await page.close()
  }
})

// ── 场景 4：portal 往返（弹层增删——#__wf_portal 不残留） ──────────────
test('portal-toggle：打开进 #__wf_portal——关闭完整移除', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, 'portal-toggle')

    assert.equal(await page.locator('.portal-content').count(), 0, '初始无弹层')
    await page.click('.portal-btn')
    await page.waitForSelector('.portal-content')
    assert.equal(await page.locator('.portal-content').count(), 1, '打开后弹层出现')
    const inPortal = await page.evaluate(() =>
      Boolean(document.querySelector('.portal-content')?.closest('#__wf_portal')))
    assert.equal(inPortal, true, '弹层在 #__wf_portal（portal 纪律）')

    await page.click('.portal-btn')
    await page.waitForFunction(() => !document.querySelector('.portal-content'))
    assert.equal(await page.locator('.portal-content').count(), 0, '关闭后弹层移除（不残留）')
  } finally {
    await page.close()
  }
})
