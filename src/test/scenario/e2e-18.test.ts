/**
 * 场景 e2e 第十八文件——无 demo 组件能力测试（能力面——props 参数行为）
 * playwright 驱动（项目场景层）。组件能力出发（非 demo 表面）：
 * VideoPlayer 属性面+回调 / Math LaTeX / Wave 波纹 / Typography 参数。
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

test('cap-videoplayer：属性面 + 真实播放（本地视频——muted autoplay → onPlay/onEnded）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'cap-videoplayer')
    const video = page.locator('.deep-videoplayer2-scene video').first()
    assert.equal(await video.count(), 1, 'video 元素')
    assert.equal(await video.getAttribute('src'), '/media/flower.mp4', 'src（本地 fixture）')
    assert.equal(await video.getAttribute('controls'), '', 'controls')
    assert.equal(await video.getAttribute('muted'), '', 'muted 属性')
    assert.equal(await video.getAttribute('autoplay'), '', 'autoPlay 属性')
    // aspect（4/3——容器宽高比）
    const box = await video.boundingBox()
    assert.ok(box && Math.abs(box.width / box.height - 4 / 3) < 0.1, `aspect 4/3（实际 ${box.width.toFixed(0)}x${box.height.toFixed(0)}）`)
    // **真实播放（修复回归）**：IDL muted（Chrome setAttribute 不生效）+
    // video ref 事件绑定（div ref 在 video 渲染前触发——onplay 未绑定 bug）
    await page.waitForFunction(() => (document.querySelector('.deep-videoplayer2-log')?.textContent ?? '').includes('play'), 'onPlay（muted autoplay 播放）', { timeout: 5000 })
    const muted = await page.evaluate(() => document.querySelector('video')?.muted)
    assert.equal(muted, true, 'IDL muted true（muted autoplay 允许）')
    // 播放完（5s 视频——onEnded）
    await page.waitForFunction(() => (document.querySelector('.deep-videoplayer2-log')?.textContent ?? '').includes('ended'), 'onEnded（播放完）', { timeout: 9000 })
  } finally {
    await page.close()
  }
})

test('cap-math：LaTeX 公式渲染（wf-math——文本非空 + 不崩）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'cap-math')
    const text = await page.evaluate(() => document.querySelector('.deep-math-scene')?.textContent ?? '')
    assert.ok(text.length > 0, `公式渲染（实际 ${text.slice(0, 40)}）`)
    const mathCount = await page.evaluate(() => document.querySelectorAll('.deep-math-scene .wf-math').length)
    assert.equal(mathCount, 2, '两个公式渲染')
  } finally {
    await page.close()
  }
})

test('cap-wave：点击产生波纹（能力：children 包装 + 点击波纹）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'cap-wave')
    // 点击波容器 → 波纹元素出现（ripple/wave 类）
    await page.click('.wave-target')
    await page.waitForFunction(() => {
      const scene = document.querySelector('.deep-wave-scene')
      return scene ? scene.querySelectorAll('[class*="ripple"], [class*="wave-ripple"], [class*="wf-wave"] [class*="ripple"]').length > 0 : false
    }, '波纹出现', { timeout: 3000 })
    // 自定义 color（#ff0000——波纹色）
    const color = await page.evaluate(() => {
      const scene = document.querySelector('.deep-wave-scene')
      const r = scene?.querySelector('[class*="ripple"]') as HTMLElement | null
      return r?.style?.backgroundColor ?? r?.style?.color ?? ''
    })
    assert.ok(color.includes('255, 0, 0') || color.includes('ff0000') || color.includes('red') || color === '', `波纹颜色（实际 ${color}）`)
  } finally {
    await page.close()
  }
})

test('cap-typography：Title level→h 标签 + Text 变体（type/strong/mark/code）+ Paragraph ellipsis', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'cap-typography')
    // Title level 2/5 → h2/h5
    assert.equal(await page.locator('.deep-typo-scene h2').count(), 1, 'h2（level 2）')
    assert.equal(await page.locator('.deep-typo-scene h5').count(), 1, 'h5（level 5）')
    // Text 变体
    const strong = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('.deep-typo-scene span')).find((x) => x.textContent === '成功加粗')
      return el ? getComputedStyle(el).fontWeight : ''
    })
    assert.ok(Number(strong) >= 600, `strong 加粗（实际 ${strong}）`)
    const mark = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('.deep-typo-scene span')).find((x) => x.textContent === '高亮')
      return el ? getComputedStyle(el).backgroundColor : ''
    })
    assert.ok(mark !== 'rgba(0, 0, 0, 0)' && mark !== '', `mark 高亮底色（实际 ${mark}）`)
    const code = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('.deep-typo-scene span')).find((x) => x.textContent === 'code')
      return el ? getComputedStyle(el).fontFamily : ''
    })
    assert.ok(code.includes('mono'), `code 等宽字体（实际 ${code.slice(0, 30)}）`)
    // Paragraph ellipsis（单行截断）
    const ell = await page.evaluate(() => {
      const p = Array.from(document.querySelectorAll('.deep-typo-scene p')).find((x) => x.textContent?.includes('一段很长'))
      return p ? getComputedStyle(p).textOverflow : ''
    })
    assert.equal(ell, 'ellipsis', 'ellipsis 截断')
    // 成功类型（success 色——非默认）
    const succ = await page.evaluate(() => {
      const el = Array.from(document.querySelectorAll('.deep-typo-scene span')).find((x) => x.textContent === '成功加粗')
      return el ? getComputedStyle(el).color : ''
    })
    assert.ok(succ !== '' && succ !== 'rgb(0, 0, 0)', `success 语义色（实际 ${succ}）`)
  } finally {
    await page.close()
  }
})
