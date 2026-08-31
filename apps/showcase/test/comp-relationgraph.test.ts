/**
 * showcase 组件测试——RelationGraph（/components/relationgraph）——完整能力
 * 每组件一个测试文件（单独运行）：node --env-file=.env --test apps/showcase/test/comp-relationgraph.test.ts
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser } from 'playwright'
import { startShowcaseServer, openShowcase, type ScenarioServer } from './showcase-shared.ts'

const COMP_PATH = '/components/relationgraph'

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
  await page.waitForTimeout(300)
}

test('能力：图谱渲染（节点 label + 边 + 图例）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const canvas = page.locator('svg.wf-rg-canvas')
    assert.ok(await canvas.count() > 0, '图谱画布')
    // 节点渲染（8 个人物）
    await page.waitForFunction(() => {
      const t = document.body.textContent ?? ''
      return t.includes('贾宝玉') && t.includes('林黛玉') && t.includes('薛宝钗') && t.includes('晴雯')
    }, '节点 label', { timeout: 4000 })
    // 子标签
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('潇湘妃子'), '子标签', { timeout: 4000 })
    // 图例（kind + 关系类型）
    await page.waitForFunction(() => {
      const t = document.body.textContent ?? ''
      return t.includes('主角') && t.includes('爱情') && t.includes('主仆')
    }, '图例', { timeout: 4000 })
    // 边的数量（9 条）
    const edges = await canvas.locator('line.wf-rg-edge').count()
    assert.equal(edges, 9, `边数量（实际 ${edges}）`)
  } finally { await page.close() }
})

test('能力：节点点击选中（受控——selectedId 高亮 + 提示文本）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    // 点击黛玉节点（g 元素）
    await page.locator('g.wf-rg-node', { hasText: '林黛玉' }).click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('已选中：黛玉'), '选中提示', { timeout: 4000 })
    // 选中态 class
    const selected = await page.locator('g.wf-rg-node--selected', { hasText: '林黛玉' }).count()
    assert.equal(selected, 1, `选中节点高亮（实际 ${selected}）`)
    // 切换选中（点击宝钗——旧选中取消）
    await page.locator('g.wf-rg-node', { hasText: '薛宝钗' }).click()
    await page.waitForFunction(() => (document.body.textContent ?? '').includes('已选中：宝钗'), '切换选中', { timeout: 4000 })
    const oldSelected = await page.locator('g.wf-rg-node--selected', { hasText: '林黛玉' }).count()
    assert.equal(oldSelected, 0, '旧选中取消')
  } finally { await page.close() }
})

test('能力：布局确定性（同数据同渲染——节点坐标稳定）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    const getPos = () => page.evaluate(() => {
      const g = document.querySelector('g.wf-rg-node')
      return g?.getAttribute('transform') ?? ''
    })
    const p1 = await getPos()
    // 触发一次重渲染（点击——render）
    await page.locator('g.wf-rg-node', { hasText: '贾母' }).click()
    await page.waitForTimeout(300)
    const p2 = await getPos()
    assert.equal(p1, p2, `布局确定性（${p1} vs ${p2}）`)
  } finally { await page.close() }
})

test('FP-追加 节点点击反馈（onNodeClick/onSelect——文本变化）', async () => {
  const page = await browser.newPage()
  try {
    await open(page)
    await page.waitForSelector('main svg')
    const t0 = await page.evaluate(() => document.querySelector('main')?.textContent ?? '')
    await page.locator('main svg circle, main svg g').first().click({ force: true })
    await page.waitForFunction((t) => (document.querySelector('main')?.textContent ?? '') !== t, t0, { timeout: 3000 })
  } finally { await page.close() }
})
