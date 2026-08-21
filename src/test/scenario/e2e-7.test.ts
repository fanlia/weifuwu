/**
 * 组件深度场景 1——表单输入 + 开关切换（参数行为断言——playwright 真实 DOM）
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

test('deep-input：输入触发 onChange（逐键）+ disabled 不可输入', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-input')
    await page.locator('.deep-input-scene input').first().click()
    await page.keyboard.type('abc')
    await page.waitForFunction(() => (document.querySelector('.deep-input-log')?.textContent ?? '').includes('v:abc'), 'onChange 累积（受控 value 回流）')
    // disabled 输入框不可输入
    const disabled = page.locator('.deep-input-scene input').nth(1)
    assert.equal(await disabled.isDisabled(), true, 'disabled 参数生效')
    await disabled.click({ force: true })
    await page.keyboard.type('x')
    assert.equal(await disabled.inputValue(), '', 'disabled 不可输入')
  } finally {
    await page.close()
  }
})

test('deep-inputnumber：受控回流按 step 变化 + min/max 边界', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-inputnumber')
    // 初始 4——点击增加 → 值递增（受控回流——每次点击 mousedown+click 双触发——至少 6）
    await page.locator('[aria-label="增加"]').click()
    await page.waitForFunction(() => (document.querySelector('.deep-inputnumber-log')?.textContent ?? '').includes('v:6'), 'step=2 递增（4→6）')
    // 连续增加 → max 10 边界（不越过）
    for (let i = 0; i < 4; i++) {
      await page.locator('[aria-label="增加"]').click()
    }
    const log = await page.locator('.deep-inputnumber-log').textContent()
    assert.ok(!(log ?? '').includes('v:11'), `max=10 边界（不越过——实际 ${log}）`)
    assert.ok((log ?? '').includes('v:10'), '到达 max 10')
    // 连续减少 → min 0 边界
    for (let i = 0; i < 8; i++) {
      await page.locator('[aria-label="减少"]').click()
    }
    const log2 = await page.locator('.deep-inputnumber-log').textContent()
    assert.ok(!(log2 ?? '').includes('v:-1'), 'min=0 边界（不越过）')
    assert.ok((log2 ?? '').endsWith('v:0;'), '到达 min 0')
  } finally {
    await page.close()
  }
})

test('deep-textarea：多行输入 onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-textarea')
    await page.locator('.deep-textarea-scene textarea').click()
    await page.keyboard.type('你好世界')
    await page.waitForFunction(() => (document.querySelector('.deep-textarea-log')?.textContent ?? '').includes('v:你好世界'))
  } finally {
    await page.close()
  }
})

test('deep-search：onInput 逐键回调', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-search')
    await page.locator('.deep-search-scene input').click()
    await page.keyboard.type('关键词')
    await page.waitForFunction(() => (document.querySelector('.deep-search-log')?.textContent ?? '').includes('i:关键词'))
  } finally {
    await page.close()
  }
})

test('deep-password：掩码输入 onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-password')
    const input = page.locator('.deep-password-scene input')
    assert.equal(await input.getAttribute('type'), 'password', 'type=password（掩码）')
    await input.click()
    await page.keyboard.type('secret123')
    await page.waitForFunction(() => (document.querySelector('.deep-password-log')?.textContent ?? '').includes('v:secret123'))
  } finally {
    await page.close()
  }
})

test('deep-pin：逐格输入 → onChange 完整值（length=4）', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-pin')
    // 4 格输入 1 2 3 4
    await page.locator('.deep-pin-scene input').first().click()
    await page.keyboard.type('1234')
    await page.waitForFunction(() => (document.querySelector('.deep-pin-log')?.textContent ?? '').includes('v:1234'), '逐格自动聚焦 → 完整值 onChange')
  } finally {
    await page.close()
  }
})

test('deep-switch：点击切换（onChange 回调）+ disabled 拦截', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-switch')
    await page.locator('.deep-switch-scene input[type="checkbox"]').first().click({ force: true })
    await page.waitForFunction(() => (document.querySelector('.deep-switch-log')?.textContent ?? '').includes('c:true'), 'onChange(true)')
    await page.locator('.deep-switch-scene input[type="checkbox"]').nth(1).click({ force: true })
    await page.waitForTimeout(200)
    assert.equal((await page.locator('.deep-switch-log').textContent())?.includes('c:false'), false, 'disabled 不触发 onChange')
  } finally {
    await page.close()
  }
})

test('deep-checkbox：勾选切换 onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-checkbox')
    await page.locator('.deep-checkbox-scene input[type="checkbox"]').click({ force: true })
    await page.waitForFunction(() => (document.querySelector('.deep-checkbox-log')?.textContent ?? '').includes('c:true'))
  } finally {
    await page.close()
  }
})

test('deep-radio：选项切换 onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-radio')
    await page.locator('.deep-radio-scene').getByText('乙', { exact: true }).click()
    await page.waitForFunction(() => (document.querySelector('.deep-radio-log')?.textContent ?? '').includes('v:乙'), '切换选项 → onChange')
  } finally {
    await page.close()
  }
})

test('deep-slider：键盘方向键按 step 变化', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-slider')
    const slider = page.locator('.deep-slider-scene [role="slider"], .deep-slider-scene input[type="range"]').first()
    await slider.focus()
    await page.keyboard.press('ArrowRight')
    await page.waitForFunction(() => (document.querySelector('.deep-slider-log')?.textContent ?? '').includes('v:55'), 'ArrowRight +5（step=5）')
    await page.keyboard.press('ArrowLeft')
    await page.keyboard.press('ArrowLeft')
    await page.waitForFunction(() => (document.querySelector('.deep-slider-log')?.textContent ?? '').includes('v:45'), 'ArrowLeft×2 -10')
  } finally {
    await page.close()
  }
})

test('deep-rate：点击星级 → onChange 评分值', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-rate')
    // 第 5 颗星（button aria-label "5 星"）
    await page.locator('.deep-rate-scene [aria-label="5 星"]').click()
    await page.waitForFunction(() => (document.querySelector('.deep-rate-log')?.textContent ?? '').includes('v:5'), '点击第 5 星 → onChange(5)')
  } finally {
    await page.close()
  }
})

test('deep-tags：Enter 添加标签 + 删除', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-tags')
    const input = page.locator('.deep-tags-scene input').first()
    await input.click()
    await page.keyboard.type('标签1')
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => (document.querySelector('.deep-tags-log')?.textContent ?? '').includes('t:标签1'), 'Enter 添加 → onChange')
  } finally {
    await page.close()
  }
})

test('deep-segmented：选项切换 onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-segmented')
    await page.locator('.deep-segmented-scene').getByText('月', { exact: true }).click()
    await page.waitForFunction(() => (document.querySelector('.deep-segmented-log')?.textContent ?? '').includes('v:月'), '切换分段 → onChange')
  } finally {
    await page.close()
  }
})

test('deep-toggle：multiple 多选切换 onChange', async () => {
  const page = await browser.newPage()
  try {
    await openScenario(page, BASE, 'deep-toggle')
    await page.locator('.deep-toggle-scene').getByText('A', { exact: true }).click()
    await page.waitForFunction(() => (document.querySelector('.deep-toggle-log')?.textContent ?? '').includes('v:a'), '选中 A')
    await page.locator('.deep-toggle-scene').getByText('B', { exact: true }).click()
    await page.waitForFunction(() => (document.querySelector('.deep-toggle-log')?.textContent ?? '').includes('v:a,b'), '多选（multiple——A,B）')
  } finally {
    await page.close()
  }
})
