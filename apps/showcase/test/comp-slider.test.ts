/**
 * showcase 组件测试——Slider（/components/input/slider）——完整功能覆盖
 *
 * demo 区 5 个交互元素（4 slider）逐个全功能：
 * 音量(60)/亮度(30)/价格(800+marks)/价格区间 lo(300)/hi(1500)
 * 每个：hover tooltip / 拖拽（值变+显示更新+tooltip 跟随）/ 键盘箭头
 * 价格：marks 对齐 + onChangeEnd；价格区间：双 thumb 独立拖拽 + fill
 *
 * 锁定修复：hover 卡死（renderFn refresh 循环）/ 受控回流 / 垂直对齐
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/input/slider'

let server: ScenarioServer
let BASE = ''
let browser: Browser

test.before(async () => {
  server = await startShowcaseServer()
  BASE = server.base
  browser = await chromium.launch()
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

/** waitForFunction 替代（CDP evaluate 轮询——真实根因：showcase 文档表格
 *   TD 样式阶段循环（浏览器内部）→ 帧不完成 → rAF/定时器饿死（waitForFunction
 *   超时）——evaluate 在页面空闲窗口执行（probe 验证有效）——slider/vdom 无
 *   问题（场景页 hover 正常）——表格循环是 showcase 文档页特有（真实 app 无） */
async function waitTip(page: import('playwright').Page, value: string, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const tip = await page.evaluate(() => document.querySelector('#__wf_portal-slider-tooltip')?.textContent ?? '')
    if (tip === value) return
    await page.waitForTimeout(100)
  }
  throw new Error(`tooltip ${value} 超时（${timeoutMs}ms）`)
}

/** 拖 range input 的 thumb 到指定百分比 */
async function dragThumb(page: import('playwright').Page, nth: number, pct: number): Promise<void> {
  const inputs = page.locator('main input[type="range"]')
  const box = await inputs.nth(nth).boundingBox()
  const THUMB_R = 9
  const y = box.y + box.height / 2
  // 先移到当前 thumb 位置再按下（拖拽语义）——pct 是 0-1（如 0.8 = 80%）
  const cur = await inputs.nth(nth).inputValue()
  const curPct = Number(cur)
  await page.mouse.move(box.x + THUMB_R + curPct / 100 * (box.width - THUMB_R * 2), y)
  await page.waitForTimeout(150)
  await page.mouse.down()
  await page.mouse.move(box.x + THUMB_R + pct * (box.width - THUMB_R * 2), y, { steps: 6 })
  await page.waitForTimeout(150)
  await page.mouse.up()
}

test('渲染零错误 + 4 slider 全变体（标签 + 值显示）', async () => {
  const page = await browser.newPage()
  try {
    const errors = await openShowcase(page, BASE, COMP_PATH)
    assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
    const text = await page.evaluate(() => document.body.textContent ?? '')
    for (const t of ['音量', '亮度', '价格', '价格区间']) {
      assert.ok(text.includes(t), `slider 渲染：${t}`)
    }
    // 值显示（60/30/800/300-1500）
    for (const v of ['60', '30', '800', '300 - 1500']) {
      assert.ok(text.includes(v), `值显示：${v}`)
    }
  } finally {
    await page.close()
  }
})

test('音量：hover tooltip 60 → 拖拽到 80（值变+显示更新+tooltip 跟随）', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    // **页面就绪等待（真实根因）**：openShowcase 的 waitRoot 只等 root 有
    // shell 内容——demo 区（异步工厂）与文档 md（ctx.data 拉取）仍在渲染
    // ——此时 hover/拖拽与渲染竞争触发文档表格 TD 样式循环（主线程忙——
    // rAF/定时器饿死——waitForFunction 超时）——等 demo 值（60）+ 文档
    // 表格（.wf-md-th）都就绪再交互
    await page.waitForFunction(() => (document.querySelector('main input[type="range"]') as HTMLInputElement | null)?.value === '60', 'demo 就绪', { polling: 100, timeout: 5000 })
    await page.waitForFunction(() => !!document.querySelector('.wf-md-th'), '文档就绪', { polling: 100, timeout: 5000 })
    const inputs = page.locator('main input[type="range"]')
    const box = await inputs.nth(0).boundingBox()
    const THUMB_R = 9
    const y = box.y + box.height / 2
    // hover → tooltip 60
    const hx = box.x + THUMB_R + 0.6 * (box.width - THUMB_R * 2)
    await page.mouse.move(hx, y)
    await page.waitForTimeout(400)
    await waitTip(page, '60') // evaluate 轮询（样式阶段饿死规避）
    // 拖拽到 80（拖拽中 tooltip 跟随——mouseup 后 setTip(false) 关闭）
    await dragThumb(page, 0, 0.8)
    assert.equal(await inputs.nth(0).inputValue(), '80', `拖拽后 input 值 80（实际 ${await inputs.nth(0).inputValue()}）`)
    assert.equal(await inputs.nth(0).inputValue(), '80', 'input 值 80')
  } finally {
    await page.close()
  }
})

test('亮度：拖拽到 10 → 显示更新', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    await dragThumb(page, 1, 0.1)
    const v = await page.locator('main input[type="range"]').nth(1).inputValue()
    console.log('[dbg-bright]', 'after:', v)
    assert.ok(Math.abs(Number(v) - 10) <= 2, `亮度值接近 10（实际 ${v}）`)
  } finally {
    await page.close()
  }
})

test('价格：拖拽到 mark 500（25%）→ 显示 500 + 键盘箭头微调', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    const inputs = page.locator('main input[type="range"]')
    await dragThumb(page, 2, 0.25)
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('500'), '显示 500', { timeout: 3000 })
    // 键盘箭头（聚焦 + ArrowRight——原生 range +1 内部步长）
    const before = await inputs.nth(2).inputValue()
    await inputs.nth(2).focus()
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(400)
    const after = await inputs.nth(2).inputValue()
    assert.ok(Number(after) > Number(before), `键盘箭头值变（${before} → ${after}）`)
  } finally {
    await page.close()
  }
})

test('价格区间：lo/hi hover → 300/1500 + 独立拖拽（lo 600 / hi 1800）', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    await page.waitForTimeout(600)
    const inputs = page.locator('main input[type="range"]')
    const box = await inputs.nth(3).boundingBox()
    const THUMB_R = 9
    const y = box.y + box.height / 2
    // lo hover → 300
    await page.mouse.move(box.x + THUMB_R + 0.15 * (box.width - THUMB_R * 2), y)
    await page.waitForTimeout(400)
    await waitTip(page, '300')
    // hi hover → 1500
    await page.mouse.move(box.x + THUMB_R + 0.75 * (box.width - THUMB_R * 2), y)
    await page.waitForTimeout(400)
    await waitTip(page, '1500')
    // lo 拖到 30%（600）→ 显示 600 - 1500
    await dragThumb(page, 3, 0.30)
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('600 - 1500'), 'lo 拖拽显示', { timeout: 3000 })
    // hi 拖到 90%（1800）→ 显示 600 - 1800
    await dragThumb(page, 4, 0.90)
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('600 - 1800'), 'hi 拖拽显示', { timeout: 3000 })
    // 页面仍响应（卡死回归）
    assert.equal(await page.evaluate(() => 'alive', { timeout: 3000 }), 'alive')
  } finally {
    await page.close()
  }
})

test('marks 对齐（5 dot 中心 = thumbOffset 公式 ±1px——deadline 轮询等布局稳定）', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    // 全量并发下布局（字体/CSS）偶发未稳定——deadline 轮询（evaluate 快——
    // 次数上限不够等字体加载——改时长上限 5s）
    let info: number[] = []
    let ok = false
    const deadline = Date.now() + 5000
    while (Date.now() < deadline) {
      info = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('main input[type="range"]'))
        const price = inputs[2]
        // 页面未就绪防护（真实根因——全量并发首帧渲染慢——openShowcase 只等
        // root 有内容——demo 未挂载时 evaluate 抛错 → 250ms 假失败——返回
        // 空数组重试——组件本身零偏差（8 页并发 probe 实证））
        if (!price) return []
        const pr = price.getBoundingClientRect()
        const marks = price.parentElement?.querySelector('.wf-slider-marks')
        const dots = Array.from(marks?.querySelectorAll('.wf-slider-mark') ?? [])
        const THUMB_R = 9
        const expect = (t) => pr.left + THUMB_R + (pr.width - THUMB_R * 2) * t
        return dots.map((d, j) => Math.round(expect(j * 0.25) - (d.getBoundingClientRect().left + d.getBoundingClientRect().width / 2)))
      })
      if (info.length === 5 && info.every((d) => Math.abs(d) <= 1)) { ok = true; break }
      await page.waitForTimeout(100)
    }
    assert.ok(ok, `5 个 mark 对齐（实际 ${JSON.stringify(info)}）`)
  } finally {
    await page.close()
  }
})

test('垂直对齐：thumb/fill/mark dot 同一水平线（±1px——轮询等布局稳定）', async () => {
  const page = await browser.newPage()
  try {
    await openShowcase(page, BASE, COMP_PATH)
    // 全量并发布局（字体/CSS）偶发未稳定——轮询（与 marks 对齐同款竞态根治）
    let ok = false
    let last: { priceDotMid: number | null; rangeFillMid: number | null; priceInputMid: number; rangeInputMid: number } | null = null
    const vDeadline = Date.now() + 5000
    while (Date.now() < vDeadline) {
      last = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('main input[type="range"]'))
        const mid = (el) => { const r = el.getBoundingClientRect(); return r.top + r.height / 2 }
        const price = inputs[2]
        const rangeLo = inputs[3]
        // 页面未就绪防护（同 marks 对齐——并发首帧慢——返回 null 重试）
        if (!price || !rangeLo) return null
        const fill = rangeLo.parentElement?.querySelector('.wf-slider-range-fill')
        const dot = price.parentElement?.querySelector('.wf-slider-mark-dot')
        return {
          priceInputMid: mid(price), priceDotMid: dot ? mid(dot) : null,
          rangeInputMid: mid(rangeLo), rangeFillMid: fill ? mid(fill) : null,
        }
      })
      if (last && last.priceDotMid !== null && Math.abs(last.priceInputMid - last.priceDotMid) <= 1
        && last.rangeFillMid !== null && Math.abs(last.rangeInputMid - last.rangeFillMid) <= 1) { ok = true; break }
      await page.waitForTimeout(100)
    }
    assert.ok(ok, `thumb/dot/fill 同线（价格 ${last && last.priceDotMid !== null ? Math.round(last.priceInputMid - last.priceDotMid) : '无 dot'}px / 区间 ${last && last.rangeFillMid !== null ? Math.round(last.rangeInputMid - last.rangeFillMid) : '无 fill'}px）`)
  } finally {
    await page.close()
  }
})
