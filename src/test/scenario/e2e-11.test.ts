/**
 * 组件深度场景 5——表单校验 + 特殊交互（Form/JsonSchemaForm/SortableList/Resizable）
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

test('deep-form：空提交校验失败 onError + 填值提交成功 onSubmit', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-form')
    // 空提交 → 校验失败（required name）
    await page.click('.form-submit')
    await page.waitForFunction(() => (document.querySelector('.deep-form-err')?.textContent ?? '') === '请输入用户名', 'required 校验错误显示', { timeout: 2500 })
    assert.ok(((await page.locator('.deep-form-log').textContent()) ?? '').includes('err:请输入用户名'), 'onError 回调')
    // 填写后提交 → 成功（age 校验：填写 20 满足 min 18）
    await page.fill('.form-name-input', '张三')
    await page.fill('.form-age-input', '20')
    await page.click('.form-submit')
    await page.waitForFunction(() => (document.querySelector('.deep-form-log')?.textContent ?? '').includes('ok:张三'), '提交成功 → onSubmit(张三)')
  } finally {
    await page.close()
  }
})

test('deep-jsonform：schema 渲染 → 编辑 onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-jsonform')
    // schema 字段渲染（标题/数量）
    const labels = await page.evaluate(() => document.querySelector('.deep-jsonform-scene')?.textContent ?? '')
    assert.ok(labels.includes('标题') && labels.includes('数量'), 'schema 字段渲染')
    // 输入标题 → onChange
    await page.locator('.deep-jsonform-scene input').first().click()
    await page.keyboard.type('测试标题')
    await page.waitForFunction(() => (document.querySelector('.deep-jsonform-log')?.textContent ?? '').includes('v:测试标题'), '编辑 → onChange', { timeout: 2500 })
  } finally {
    await page.close()
  }
})

test('deep-sortable：拖拽重排 → onReorder（顺序变化）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-sortable')
    // 初始顺序 甲,乙
    const before = await page.evaluate(() => Array.from(document.querySelectorAll('.sortable-item')).map((el) => el.getAttribute('data-id')))
    assert.deepEqual(before, ['a', 'b'], '初始顺序')
    // HTML5 拖拽（乙 → 甲前）——dragstart/dragover/drop
    await page.evaluate(() => {
      const dt = new DataTransfer()
      const items = Array.from(document.querySelectorAll('.wf-sortable-item'))
      items[1].dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true }))
      items[0].dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true }))
      items[0].dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true }))
      items[1].dispatchEvent(new DragEvent('dragend', { dataTransfer: dt, bubbles: true })) // onDragEnd 触发重排
    })
    await page.waitForFunction(() => (document.querySelector('.deep-sortable-log')?.textContent ?? '').includes('v:乙,甲'), '重排 → onReorder(乙,甲)', { timeout: 2500 })
  } finally {
    await page.close()
  }
})

test('deep-resizable：拖拽分隔条 → onResize（尺寸变化）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-resizable')
    // 初始第一面板 200px
    const before = await page.evaluate(() => {
      const split = document.querySelector('.deep-resizable-scene [class*="resizable"], .deep-resizable-scene [class*="split"]')
      return split?.getBoundingClientRect().width ?? 0
    })
    // 拖拽分隔条（pointer 序列）
    const handle = page.locator('.deep-resizable-scene [class*="handle"], .deep-resizable-scene [class*="divider"], .deep-resizable-scene [class*="resizer"]').first()
    const box = await handle.boundingBox()
    assert.ok(box, '分隔条存在')
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + 50, box.y + box.height / 2, { steps: 5 })
    await page.mouse.up()
    await page.waitForFunction(() => ((document.querySelector('.deep-resizable-log')?.textContent?.length ?? 0) > 0), '拖拽 → onResize', { timeout: 2500 })
  } finally {
    await page.close()
  }
})
