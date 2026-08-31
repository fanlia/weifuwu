/**
 * showcase 组件测试——AiChat（/components/aichat）——全功能点固化
 * 清单：design/COMPONENT-VERIFICATION-CHECKLIST.md「AiChat」组（playwright 实测后固化）
 * 修复回归：
 * - useChat 协议解析完整性（wf:step/tool_call/progress/result/approval_request/
 *   usage/done 全事件消费——此前只映射 token——核心层）
 * - approve 消息对象同一性（map 替换 → 流式写闭包旧引用 → 审批后回复丢失——核心层）
 * - wire-fake 语义触发（含「天气」→ agent 流程——body.mode 死分支修复）
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-aichat.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/aichat'

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

async function open(page: import('playwright').Page): Promise<void> {
  const errors = await openShowcase(page, BASE, COMP_PATH)
  assert.deepEqual(errors.filter((e) => !e.includes('Failed to load resource')), [], `零错误（实际: ${errors[0] ?? '无'}）`)
  await page.waitForSelector('main .wf-aichat')
}

test('FP1/FP3/FP4 渲染基线：空态 + maxHeight + labels 覆盖', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const chat1 = page.locator('main .wf-aichat').nth(0)
    const chat2 = page.locator('main .wf-aichat').nth(1)
    assert.equal(await chat1.count(), 1, '基础实例')
    assert.equal(await chat2.count(), 1, 'agent 实例')
    assert.ok((await chat1.locator('.wf-aichat-empty').textContent())?.includes('输入消息开始对话'), '空态文案（labels.empty 默认）')
    assert.equal(await chat1.locator('.wf-aichat-list').evaluate((el) => el.style.maxHeight), '300px', 'maxHeight 数据面')
    assert.equal(await chat2.locator('textarea, input').first().getAttribute('placeholder'), '试试输入：北京天气', 'labels.placeholder 覆盖')
    assert.ok(await chat2.locator('button', { hasText: '发 送' }).count(), 'labels.send 覆盖')
  } finally { await page.close() }
})

test('FP2/FP11 基础流式对话：user 气泡 → 流式累积 → usage 行', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const chat1 = page.locator('main .wf-aichat').nth(0)
    const input = chat1.locator('textarea, input').first()
    await input.fill('你好')
    await input.press('Enter')
    await page.waitForFunction(() => (document.querySelectorAll('main .wf-aichat')[0]?.textContent ?? '').includes('（demo 流式回复）你刚才说：你好'), null, { timeout: 8000 })
    assert.ok(true, '流式回复累积')
    const usage = await chat1.locator('.wf-aichat-usage').textContent()
    assert.ok((usage ?? '').includes('tokens'), `usage 行：${usage}`)
  } finally { await page.close() }
})

test('FP10/FP6/FP7 agent 链路：step 状态 + 工具卡 + renderToolArgs + 审批卡', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const chat2 = page.locator('main .wf-aichat').nth(1)
    const input = chat2.locator('textarea, input').first()
    await input.fill('北京天气')
    await input.press('Enter')
    // step 状态（thinking/runningTool——wire-fake agent 流）
    await page.waitForFunction(() => {
      const t = document.querySelectorAll('main .wf-aichat')[1]?.textContent ?? ''
      return t.includes('思考中') || t.includes('执行工具')
    }, null, { timeout: 5000 })
    // 工具卡（ToolCallCard）+ renderToolArgs 自定义参数节点
    await page.waitForFunction(() => {
      const c2 = document.querySelectorAll('main .wf-aichat')[1]
      return c2?.querySelector('.wf-aichat-tools') !== null && c2.querySelector('[data-ai-args]') !== null
    }, null, { timeout: 8000 })
    const argsText = await chat2.locator('[data-ai-args]').first().textContent()
    assert.ok((argsText ?? '').includes('query_weather') || (argsText ?? '').includes('city'), `自定义参数渲染：${argsText}`)
    // 审批卡（wf:approval_request → 消息级 approval）
    await page.waitForFunction(() => document.querySelectorAll('main .wf-aichat')[1]?.querySelector('.wf-aichat-approval'), null, { timeout: 8000 })
    assert.equal(await chat2.locator('.wf-aichat-approval').count(), 1, '审批卡出现')
  } finally { await page.close() }
})

test('FP7b/FP5/FP2b 修改参数回流 + 自定义气泡 + 审批后回复（同一性回归）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const chat2 = page.locator('main .wf-aichat').nth(1)
    const input = chat2.locator('textarea, input').first()
    await input.fill('北京天气')
    await input.press('Enter')
    // 等审批卡 → 点「修改参数」→ JsonSchemaForm 预填 city
    await page.waitForFunction(() => document.querySelectorAll('main .wf-aichat')[1]?.querySelector('.wf-aichat-approval'), null, { timeout: 8000 })
    await chat2.locator('button', { hasText: '修改参数' }).first().click()
    const cityInput = chat2.locator('.wf-aichat-approval input').first()
    await cityInput.waitFor({ timeout: 3000 })
    assert.equal(await cityInput.inputValue(), '北京', 'approveSchema 预填 request.args')
    // 改值提交 → approve('modified', …)
    await cityInput.fill('上海')
    await chat2.locator('.wf-aichat-approval button', { hasText: '以修改后参数批准' }).first().click()
    // **同一性回归锚**：审批后到达的流式 token 必须渲染（此前写进游离对象——UI 卡死）
    await page.waitForFunction(() => (document.querySelectorAll('main .wf-aichat')[1]?.textContent ?? '').includes('25°C'), null, { timeout: 15000 })
    // renderMessage 自定义气泡（assistant content → data-ai-rendered）
    assert.ok(await chat2.locator('[data-ai-rendered]').count(), '自定义气泡节点')
  } finally { await page.close() }
})
