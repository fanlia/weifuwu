/**
 * 场景 e2e 第四文件（场景 26-29——usePopup 参数矩阵）
 * 与 e2e/e2e-2/e2e-3 拆文件——node --test 多文件并发——总时长压进 R-01 预算。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startScenarioServer, openScenario, type ScenarioServer } from './e2e-shared.ts'

let server: ScenarioServer
let BASE = ''
let browser: Browser

test.before(async () => {
  server = await startScenarioServer()
  BASE = server.base
  browser = await chromium.launch()
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

// ── 场景 26：placement 矩阵（四方向 + center:false + gap + margin） ────
test('popup-placement：四方向坐标关系 + center:false 左对齐 + margin 夹紧', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'popup-placement')

    // 逐个打开（每个独立 popup）——断言坐标关系
    const check = async (name: string) => {
      await page.click(`.place-btn-${name}`)
      await page.waitForSelector(`.place-panel-${name}`)
      // 等待定位完成（rAF 异步——面板初始 0,0——定位后 left/top 非 0）
      await page.waitForFunction((n) => {
        const panel = document.querySelector(`.place-panel-${n}`) as HTMLElement | null
        if (!panel) return false
        return panel.style.left !== '' && panel.style.left !== '0px'
      }, name)
      const r = await page.evaluate((n) => {
        const btn = document.querySelector(`.place-btn-${n}`)!.getBoundingClientRect()
        const panel = document.querySelector(`.place-panel-${n}`)!.getBoundingClientRect()
        return { btn: { t: btn.top, b: btn.bottom, l: btn.left, r: btn.right }, panel: { t: panel.top, l: panel.left, w: panel.width, h: panel.height } }
      }, name)
      await page.keyboard.press('Escape') // 关闭（面板可能遮挡按钮——Escape 可靠）
      await page.waitForFunction((n) => !document.querySelector(`.place-panel-${n}`), name)
      return r
    }
    const bottom = await check('bottom')
    assert.ok(bottom.panel.t >= bottom.btn.b + 12 - 1, `bottom：面板顶 ≥ 按钮底 + gap(12)——实际 ${bottom.panel.t} vs ${bottom.btn.b}`)
    const top = await check('top')
    assert.ok(top.panel.t + top.panel.h <= top.btn.t - 12 + 1, `top：面板底 ≤ 按钮顶 - gap(12)`)
    const left = await check('left')
    assert.ok(left.panel.l + left.panel.w <= left.btn.l - 12 + 1, `left：面板右 ≤ 按钮左 - gap(12)`)
    const right = await check('right')
    assert.ok(right.panel.l >= right.btn.r + 12 - 1, `right：面板左 ≥ 按钮右 + gap(12)——实际 ${right.panel.l} vs ${right.btn.r}`)
    const leftalign = await check('leftalign')
    assert.ok(Math.abs(leftalign.panel.l - leftalign.btn.l) <= 1, `center:false 左对齐（面板左 == 按钮左）`)
    // margin 夹紧（按钮在页面左缘——面板 left ≥ margin(20)）
    assert.ok(leftalign.panel.l >= 20 - 1, `margin 夹紧（面板 left ≥ 20）——实际 ${leftalign.panel.l}`)
  } finally {
    await page.close()
  }
})

// ── 场景 27：closeOnOutside/closeOnEscape 开关 ─────────────────────────
test('popup-close-switch：显式 false 禁用外部点击/Escape 关闭', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'popup-close-switch')

    await page.click('.cs-trigger')
    await page.waitForSelector('.cs-panel')
    // 外部点击（远离面板）→ 不关闭（closeOnOutside: false）
    await page.mouse.click(400, 300)
    await page.waitForTimeout(300)
    assert.equal(await page.locator('.cs-panel').count(), 1, 'closeOnOutside:false——外部点击不关闭')
    // Escape → 不关闭（closeOnEscape: false）
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
    assert.equal(await page.locator('.cs-panel').count(), 1, 'closeOnEscape:false——Escape 不关闭')
    // 按钮切换关闭（组件自控）
    await page.click('.cs-trigger')
    await page.waitForFunction(() => !document.querySelector('.cs-panel'))
    assert.equal(await page.locator('.cs-panel').count(), 0, '组件自控关闭（开关按钮）')
  } finally {
    await page.close()
  }
})

// ── 场景 28：hover 触发（wrapProps——mouseenter/leave + 延迟） ─────────
test('popup-hover：mouseenter 打开 + mouseleave 关闭（openDelay/closeDelay）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'popup-hover')

    // mouseenter → openDelay(200ms) 后打开
    await page.hover('.ht-trigger')
    await page.waitForSelector('.ht-panel', { timeout: 2000 })
    assert.equal(await page.locator('.ht-panel').count(), 1, 'mouseenter → 打开（openDelay 后）')
    // mouseleave → closeDelay(300ms) 后关闭
    await page.mouse.move(600, 400)
    await page.waitForFunction(() => !document.querySelector('.ht-panel'), 'mouseleave → 关闭（closeDelay 后）', { timeout: 2000 })
    // disabled 后 hover 不再打开
    await page.click('.ht-disable')
    await page.hover('.ht-trigger')
    await page.waitForTimeout(500)
    assert.equal(await page.locator('.ht-panel').count(), 0, 'disabled → hover 不打开')
  } finally {
    await page.close()
  }
})

// ── 场景 29：受控 getter + positioning none ────────────────────────────
test('popup-controlled-none：isOpen getter 受控 + positioning none（自定义定位）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'popup-controlled-none')

    await page.click('.cn-trigger')
    await page.waitForSelector('.cn-panel')
    const style = await page.evaluate(() => (document.querySelector('.cn-panel') as HTMLElement)?.getAttribute('style') ?? '')
    assert.ok(style.includes('position: fixed'), 'positioning none——仍 fixed（自定义定位模式）')
    assert.ok(!style.includes('top:') && !style.includes('left:'), 'positioning none——无自动 top/left（组件自定义坐标）')
    // 关闭（受控 setOpen 驱动——面板 inset:0 覆盖视口——Escape 可靠）
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('.cn-panel'))
    assert.equal(await page.locator('.cn-panel').count(), 0, '受控 setOpen 关闭')
  } finally {
    await page.close()
  }
})
