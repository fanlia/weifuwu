/**
 * 场景 e2e——layout 层叠语义（LAYOUT-PLAN W0 现状基线 → **W2 根治后语义**）
 *
 * 为什么在场景层：层叠/继承/媒体查询是**浏览器计算值**语义——静态清单契约
 * （layout-inventory.test.ts）读 CSS 文本读不出「谁胜」。本文件用 `getComputedStyle`
 * 把 plan/layout-优化.md 的探针读数钉成可回归断言。
 *
 * W0 记录的是**缺陷现状**（gap 污染 20px / 工具类被吞 24px / 零值档缺失 / btn 隐藏失效）；
 * W2 根治后断言翻转为**应有语义**（旧读数见 git 历史 `23f0b08f` 与计划实录）：
 *   ① `@property{inherits:false}`（`_props.css`）——钩子只作用本元素，内层原语回落
 *      **自己的**默认（stack 12 / grid 16 / cluster 8 / container 16——不同回退值不被吃掉）
 *   ② `LAYER_ORDER` utilities 提到 components 之后——工具类 = 显式覆盖意图，恒胜组件样式
 *   ③ 补 `wf-padding-none`（取消面）——`wf-radius-none` 同期**判负**（零消费证据）
 *   ④ display 族（block/flex/hidden）基类 `:where()` 零优先级 + `@media` 变体正常优先级
 *      → 变体恒胜基类（跨文件亦然）——**零 !important**（旧 `wf-hidden\@lg` 的 hack 删除），
 *      并修复两个活体 bug：`.wf-btn + .wf-hidden` 恒可见、`.wf-btn + wf-hidden wf-flex@sm`
 *      恒可见（agent-platform Chat.tsx「部门详情」按钮——窄屏该隐未隐）
 *   ⑤ 冲突对 = 登记面（胜者+胜因见 layout-inventory L8）
 *   ⑥ dev 服务面 CSS == 装配单源输出（W1）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser, type Page } from 'playwright'
import { resolve } from 'node:path'
import { startScenarioServer, openScenario, type ScenarioServer } from './e2e-shared.ts'
import { bundleComponents } from '../../client/layout/bundle.ts'

let server: ScenarioServer
let BASE = ''
let browser: Browser
let page: Page

test.before(async () => {
  server = await startScenarioServer()
  BASE = server.base
  browser = await chromium.launch()
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await openScenario(page, BASE, 'layout-semantics')
  await page.waitForSelector('.layout-semantics')
})

test.after(async () => {
  await browser?.close()
  server?.stop()
})

/** 读单个元素的计算样式（页面内 getComputedStyle——真实层叠结果） */
function computed(sel: string, prop: string): Promise<string> {
  return page.evaluate(([s, p]) => {
    const el = document.querySelector(s) as HTMLElement | null
    if (!el) throw new Error(`场景缺元素: ${s}`)
    return getComputedStyle(el)[p as any] as string
  }, [sel, prop] as const)
}

test('① 变量钩子元素级（@property inherits:false——污染归零 · 各原语回退值保留）', async () => {
  assert.equal(await computed('.ls-gap-outer', 'gap'), '20px', '本元素设钩子 → 生效')
  assert.equal(
    await computed('.ls-gap-inner', 'gap'),
    '12px',
    '内层 .wf-stack 不被外层钩子污染（回落自身默认 --wf-gap-md=12px；W0 基线为 20px）',
  )
  assert.equal(
    await computed('.ls-grid-inner', 'gap'),
    '16px',
    '内层 .wf-grid 回落**自己的**默认（--wf-gap-lg=16px）——syntax:"*" 无 initial-value 才保得住每原语不同回退',
  )
  assert.equal(await computed('.ls-grid-outer', 'gap'), '20px', 'grid 本元素钩子生效')
})

test('② 工具类覆盖组件样式（utilities 层在 components 之后——显式覆盖意图胜）', async () => {
  assert.equal(await computed('.ls-override-down', 'padding'), '4px', 'wf-padding-xs 胜 wf-card--pad-lg（W0 基线 24px）')
  assert.equal(await computed('.ls-override-up', 'padding'), '24px', 'wf-padding-lg 胜 wf-card--pad-sm（W0 基线 8px）')
  assert.equal(await computed('.ls-override-btn', 'padding'), '24px', 'wf-padding-lg 胜 wf-btn 自身 padding（W0 基线 10px 16px）')
  assert.equal(await computed('.ls-util-alone', 'padding'), '4px', '对照组：工具类单独生效不变')
})

test('③ 零值档位（取消面——padding 补齐 · radius 同期判负）', async () => {
  assert.equal(await computed('.ls-zero', 'padding'), '0px', 'wf-padding-none 取消组件内边距（W0 基线：类未定义 → 24px）')
  // radius 取消档判负（零消费证据——L2 消费证据制）：缺口登记于 layout-inventory L5d
  // KNOWN_GAPS，推翻条件 = 出现取消组件圆角的消费侧实例（届时补类 + 本断言）
})

test('④ display 族断点变体（变体恒胜基类 · 组件 display 不再压制 · 零 !important）', async () => {
  // 1280（≥1024）：hidden@lg 变体胜 flex/block 基类
  assert.equal(await computed('.ls-bp', 'display'), 'none', 'wf-flex + wf-hidden@lg @1280 → none（无 !important）')
  assert.equal(await computed('.ls-bp-block', 'display'), 'none', 'wf-block + wf-hidden@lg @1280 → none（跨文件变体胜基类）')
  // 活体 bug 修复：Button 自身 display:inline-flex（components 层）不再压过 wf-hidden
  assert.equal(await computed('.ls-bp-btn', 'display'), 'flex', 'btn + wf-hidden + wf-flex@sm @1280 → flex（≥640 显）')

  await page.setViewportSize({ width: 800, height: 900 })
  assert.equal(await computed('.ls-bp', 'display'), 'flex', '@800（<1024）：wf-flex 基类生效——宽隐窄显成立')
  assert.equal(await computed('.ls-bp-block', 'display'), 'block', '@800：wf-block 基类生效')
  assert.equal(await computed('.ls-bp-btn', 'display'), 'flex', '@800（≥640）：flex@sm 变体胜 hidden 基类')

  await page.setViewportSize({ width: 390, height: 900 })
  assert.equal(await computed('.ls-bp-btn', 'display'), 'none', '@390（<640）：wf-hidden 基类生效——窄隐宽显成立（W0 前恒 inline-flex）')
  assert.equal(await computed('.ls-bp', 'display'), 'flex', '@390：wf-flex 保持')
  await page.setViewportSize({ width: 1280, height: 900 })
})

test('⑤ 冲突对 wf-row × wf-stack（登记面：胜者+胜因见 inventory L8）', async () => {
  assert.equal(await computed('.ls-conflict', 'display'), 'flex', '两原语都设 display:flex（同值——非冲突）')
  assert.equal(
    await computed('.ls-conflict', 'flexDirection'),
    'column',
    '只有 wf-stack 设 direction → column（组合语义由登记面显式化，消费侧冗余共用已清理）',
  )
  assert.equal(await computed('.ls-conflict', 'flexWrap'), 'wrap', 'wf-row 的 wrap 保留（互补属性——非冲突）')
})

test('⑥ 服务面 == 装配单源（/components.css 字节全等 bundleComponents + 缓存头）', async () => {
  // W1：旧内联实现把全部 layout 文件塞 @layer layout（utilities 掉层）——本断言
  // 证明服务面已回到单源（再引入内联装配 → 字节不等 → 红）。
  const rootDir = resolve(import.meta.dirname, '..', '..', '..')
  const res = await fetch(`${BASE}/components.css`)
  const served = await res.text()
  const { css } = await bundleComponents(
    resolve(rootDir, 'src/client/layout'),
    resolve(rootDir, 'src/client/components'),
  )
  assert.equal(served, css, 'dev 服务面 CSS 必须 == 装配单源输出（层序语义与 dist 一致）')
  // 缓存面（旧：`new Response(css)` 零缓存头 → 每次全量重传）
  assert.ok(res.headers.get('etag'), 'ETag 必须存在')
  assert.equal(res.headers.get('cache-control'), 'no-cache', '可存但每次复验')
  const r304 = await fetch(`${BASE}/components.css`, { headers: { 'if-none-match': res.headers.get('etag')! } })
  assert.equal(r304.status, 304, 'If-None-Match 命中 → 304 空体')
})
