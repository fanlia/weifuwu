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

// ── 场景 30：presence 退场状态机 ───────────────────────────────────────
test('popup-presence：关闭后 exit 阶段仍渲染（无动画立即 closed——不残留）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'popup-presence')

    await page.click('.ps-trigger')
    await page.waitForSelector('.ps-panel')
    assert.equal(await page.locator('.ps-panel').count(), 1, '打开渲染')
    await page.keyboard.press('Escape')
    // 无动画环境：exit → 立即 closed（不挂死）——面板移除
    await page.waitForFunction(() => !document.querySelector('.ps-panel'), '无动画环境退场立即 closed（不残留）', { timeout: 2000 })
    assert.equal(await page.locator('.ps-panel').count(), 0, '关闭后面板移除（presence 状态机走完）')
  } finally {
    await page.close()
  }
})

// ── 场景 31：mask 遮罩 ─────────────────────────────────────────────────
test('popup-mask：遮罩渲染（--wf-overlay + 点击遮罩关闭——内容居中）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'popup-mask')

    await page.click('.mk-trigger')
    await page.waitForSelector('.wf-popup-mask')
    assert.equal(await page.locator('.mk-content').count(), 1, '内容渲染（遮罩内）')
    const maskStyle = await page.evaluate(() => (document.querySelector('.wf-popup-mask') as HTMLElement)?.getAttribute('style') ?? '')
    assert.ok(maskStyle.includes('position: fixed') && maskStyle.includes('inset: 0'), '全屏遮罩（fixed + inset 0）')
    // 内容居中（flex）
    const center = await page.evaluate(() => {
      const mask = document.querySelector('.wf-popup-mask')!.getBoundingClientRect()
      const content = document.querySelector('.mk-content')!.getBoundingClientRect()
      return { cx: Math.abs(content.left + content.width / 2 - (mask.left + mask.width / 2)), cy: Math.abs(content.top + content.height / 2 - (mask.top + mask.height / 2)) }
    })
    assert.ok(center.cx < 5 && center.cy < 5, `maskCentered 居中（cx:${center.cx.toFixed(1)} cy:${center.cy.toFixed(1)}）`)
    // 点击遮罩关闭（maskClosable——e.target === currentTarget）
    await page.mouse.click(5, 5)
    await page.waitForFunction(() => !document.querySelector('.wf-popup-mask'), '点击遮罩关闭', { timeout: 2000 })
  } finally {
    await page.close()
  }
})

// ── 场景 32：trapFocus + lockScroll ────────────────────────────────────
test('popup-trap：焦点陷阱（打开聚焦 + Tab 循环）+ 滚动锁（body overflow）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'popup-trap')

    await page.click('.tr-trigger')
    await page.waitForSelector('.tr-panel')
    // lockScroll：body overflow hidden
    assert.equal(await page.evaluate(() => document.body.style.overflow), 'hidden', '滚动锁（body overflow hidden）')
    // trapFocus：打开聚焦面板内首个可聚焦
    await page.waitForFunction(() => document.activeElement?.classList.contains('tr-focus-1'), '打开聚焦首个可聚焦', { timeout: 2000 })
    // Tab 循环（最后一个 Tab → 回到第一个）
    await page.keyboard.press('Tab')
    await page.waitForFunction(() => document.activeElement?.classList.contains('tr-focus-2'), 'Tab 到第二')
    await page.keyboard.press('Tab')
    await page.waitForFunction(() => document.activeElement?.classList.contains('tr-focus-1'), 'Tab 循环回第一（焦点陷阱）')
    // 关闭 → 滚动锁恢复 + 焦点归还
    await page.keyboard.press('Escape')
    await page.waitForFunction(() => !document.querySelector('.tr-panel'))
    assert.equal(await page.evaluate(() => document.body.style.overflow), '', '关闭后滚动锁恢复')
  } finally {
    await page.close()
  }
})

// ── 波次 3：position 无 anchor（光标定位——ContextMenu 类——2027-09 矩阵） ──
test('popup-position-cursor：position 无 anchor——面板坐标 = 触发点（±5px——语义断言）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'popup-position-cursor')
    const trigger = page.locator('.pop-pos-trigger')
    const box = await trigger.boundingBox()
    const cx = box.x + box.width / 2
    const cy = box.y + box.height / 2
    await trigger.click()
    await page.waitForSelector('.pop-pos-panel')
    await page.waitForFunction(() => {
      const p = document.querySelector('.pop-pos-panel') as HTMLElement | null
      if (!p) return false
      const st = getComputedStyle(p)
      return st.top !== '' && st.top !== '0px'
    }, '定位完成')
    const r = await page.locator('.pop-pos-panel').boundingBox()
    // 期望 = click 坐标 + 10（场景 onClick 记录 e.clientX/clientY + 10——非 0,0 左上角）
    assert.ok(Math.abs(r.x - (cx + 10)) <= 5, `面板 x 跟随光标（期望 ${Math.round(cx + 10)}，实际 ${r.x}）`)
    assert.ok(Math.abs(r.y - (cy + 10)) <= 5, `面板 y 跟随光标（期望 ${Math.round(cy + 10)}，实际 ${r.y}）`)
  } finally {
    await page.close()
  }
})

// ── 波次 3：mask + position（DatePicker 类——mask 全屏 + 内容定位跟随） ──
test('popup-mask-position：mask+position——内容在坐标处 + mask 全屏（inset:0）+ width 跟随', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'popup-mask-position')
    const input = page.locator('.pop-maskpos-trigger')
    const iw = await input.evaluate((el) => el.getBoundingClientRect().width)
    await input.click()
    await page.waitForSelector('.pop-maskpos-panel')
    await page.waitForFunction(() => {
      const p = document.querySelector('.pop-maskpos-panel') as HTMLElement | null
      if (!p) return false
      const inner = p.closest('.wf-popup-mask-inner') as HTMLElement | null
      return inner ? inner.style.top !== '' && inner.style.top !== '0px' : false
    }, '定位完成')
    const ir = await input.evaluate((el) => el.getBoundingClientRect().toJSON())
    const panel = await page.locator('.pop-maskpos-panel').boundingBox()
    // 内容定位跟随（input 下方 + 4）
    assert.ok(Math.abs(panel.x - ir.left) <= 5, `面板 x 跟随 input（期望 ${Math.round(ir.left)}，实际 ${panel.x}）`)
    assert.ok(Math.abs(panel.y - (ir.bottom + 4)) <= 5, `面板 y = bottom+4（期望 ${Math.round(ir.bottom + 4)}，实际 ${panel.y}）`)
    // width 跟随 trigger
    const pw = await page.locator('.pop-maskpos-panel').evaluate((el) => el.getBoundingClientRect().width)
    assert.ok(Math.abs(pw - iw) <= 5, `面板宽跟随 input（${iw} → ${Math.round(pw)}）`)
    // mask 全屏（inset:0——遮罩覆盖视口）
    const mask = await page.evaluate(() => {
      const m = document.querySelector('.wf-popup-mask')
      if (!m) return null
      const r = m.getBoundingClientRect()
      return { x: r.x, y: r.y, w: r.width, h: r.height, vw: window.innerWidth, vh: window.innerHeight }
    })
    assert.ok(mask && mask.x <= 1 && mask.y <= 1 && mask.w >= mask.vw - 2 && mask.h >= mask.vh - 2, `mask 全屏遮罩（${JSON.stringify(mask)}）`)
    // 点外部关闭（maskClosable）
    await page.mouse.click(20, 400)
    await page.waitForFunction(() => !document.querySelector('.pop-maskpos-panel'), '外部点击关闭')
  } finally {
    await page.close()
  }
})
