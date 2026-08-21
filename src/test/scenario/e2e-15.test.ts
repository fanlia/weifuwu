/**
 * 场景 e2e 第十五文件（重组件后半——AiChat/FileUpload/Editor/SheetGrid/SlideCanvas/媒体/认证）
 * e2e-13 拆分——文件级超时（媒体/流式测试重——并发 CPU 压力）。
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

// ── 场景 7：AiChat（流式对话——真实 NDJSON fixture） ───────────────────
test('deep-aichat：输入发送 → 流式回复累积显示', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-aichat')
    // 输入 + 发送
    const input = page.locator('.deep-aichat-scene textarea, .deep-aichat-scene input').first()
    await input.click()
    await page.keyboard.type('你好')
    await page.keyboard.press('Enter')
    // 流式回复（NDJSON 分块——你→你好→你好！）
    await page.waitForFunction(() => (document.querySelector('.deep-aichat-scene')?.textContent ?? '').includes('你好！'), '流式回复累积（assistant 你好！）', { timeout: 6000 })
  } finally {
    await page.close()
  }
})

// ── 场景 8：FileUpload（文件选择 → onChange） ──────────────────────────
test('deep-fileupload：选择文件 → onChange（文件名列表）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-fileupload')
    // 上传文件（playwright setInputFiles）
    await page.locator('.deep-fileupload-scene input[type="file"]').setInputFiles({
      name: '测试.txt', mimeType: 'text/plain', buffer: Buffer.from('内容'),
    })
    await page.waitForFunction(() => (document.querySelector('.deep-fileupload-log')?.textContent ?? '').includes('v:测试.txt'), '选择文件 → onChange(测试.txt)', { timeout: 2500 })
  } finally {
    await page.close()
  }
})

// ── 场景 9：Editor（编辑 → onChange） ──────────────────────────────────
test('deep-editor：输入编辑 → onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-editor')
    const area = page.locator('.deep-editor-scene [contenteditable], .deep-editor-scene textarea, .deep-editor-scene input').first()
    await area.click()
    await page.keyboard.type('编辑内容')
    await page.waitForFunction(() => (document.querySelector('.deep-editor-log')?.textContent ?? '').length > 0, '编辑 → onChange', { timeout: 2500 })
  } finally {
    await page.close()
  }
})

// ── 场景 10/11：SheetGrid/SlideCanvas（数据上下文渲染） ────────────────
test('deep-sheetgrid：工作簿数据渲染（单元格内容）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-sheetgrid')
    const text = await page.evaluate(() => document.querySelector('.deep-sheetgrid-scene')?.textContent ?? '')
    assert.ok(text.includes('值1') && text.includes('值2'), `单元格内容渲染（实际 ${text.slice(0, 80)}）`)
  } finally {
    await page.close()
  }
})

test('deep-slidecanvas：幻灯片形状渲染（文本）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-slidecanvas')
    const text = await page.evaluate(() => document.querySelector('.deep-slidecanvas-scene')?.textContent ?? '')
    assert.ok(text.includes('标题'), `形状文本渲染（实际 ${text.slice(0, 80)}）`)
  } finally {
    await page.close()
  }
})

// ── 场景 12-14：ImageCropper/VideoPlayer/AuthPage ──────────────────────
test('deep-imagecropper：图片加载 → 裁剪框渲染', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-imagecropper')
    // 图片加载 + 裁剪框（canvas/img + 裁剪 UI）
    await page.waitForFunction(() => {
      const scene = document.querySelector('.deep-imagecropper-scene')
      return (scene?.querySelector('canvas') !== null) || (scene?.querySelector('img') !== null)
    }, '图片/画布渲染', { timeout: 4000 })
  } finally {
    await page.close()
  }
})

test('deep-videoplayer：视频元素渲染（controls）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-videoplayer')
    const video = page.locator('.deep-videoplayer-scene video').first()
    assert.equal(await video.count(), 1, 'video 元素渲染')
    assert.equal(await video.getAttribute('src'), 'https://example.com/video.mp4', 'src 属性')
    assert.equal(await video.getAttribute('controls'), '', 'controls 属性（boolean）')
  } finally {
    await page.close()
  }
})

test('deep-authpage：登录表单填写 → 提交 onSubmit', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-authpage')
    await page.fill('.auth-username', 'admin')
    await page.fill('.auth-password', 'secret')
    // 提交按钮
    await page.locator('.deep-authpage-scene button[type="submit"], .deep-authpage-scene button').first().click()
    await page.waitForFunction(() => (document.querySelector('.deep-authpage-log')?.textContent ?? '').includes('v:admin'), '提交 → onSubmit(admin)', { timeout: 2500 })
  } finally {
    await page.close()
  }
})
