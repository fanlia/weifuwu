/**
 * 场景 e2e——layout 层叠语义（LAYOUT-PLAN W0：**现状基线固化**）
 *
 * 为什么在场景层：层叠/继承/媒体查询是**浏览器计算值**语义——静态清单契约
 * （layout-inventory.test.ts）读 CSS 文本读不出「谁胜」。本文件用
 * `getComputedStyle` 把 plan/layout-优化.md 的探针读数钉成可回归断言。
 *
 * **断言的是当前行为（含已登记缺陷/缺口）**——不是「应有行为」：
 *   ① `--wf-gap` 继承污染（内层被外层内联钩子污染）      → W2 `@property{inherits:false}` 根治后翻转
 *   ② utilities 层被 components 层压制（工具类覆盖失效）  → W2 层序修正后翻转
 *   ③ 零值档位缺口（`wf-padding-none` 未定义）            → W2 补齐后翻转
 *   ④ 断点变体 `wf-hidden@lg` 靠 `!important` 变通生效    → W2 删 !important 后**仍须 none**
 *   ⑤ 冲突对 `wf-row wf-stack` 静默取 column              → W2 定案（禁共用/合成类）后翻转
 *
 * 根因登记（源码原文）：`_hidden.css:4-7`「@layer 顺序下 utilities 永远输给
 * components……源顺序洗牌无法修复（层叠顺序优先于源顺序）——!important 是唯一出路」。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chromium, type Browser, type Page } from 'playwright'
import { startScenarioServer, openScenario, type ScenarioServer } from './e2e-shared.ts'

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

test('① --wf-gap 继承污染（基线：内层被外层内联钩子污染 = 20px）', async () => {
  // 外层显式设钩子 → 20px（预期）
  assert.equal(await computed('.ls-gap-outer', 'gap'), '20px', '外层内联 --wf-gap:20px 生效')
  // 内层未设钩子——应回落原语默认 var(--wf-gap-md)=12px，实际继承外层 20px
  assert.equal(
    await computed('.ls-gap-inner', 'gap'),
    '20px',
    '基线缺陷：自定义属性默认继承 → 内层 .wf-stack 被污染（W2 @property inherits:false 后应为 12px）',
  )
})

test('② utilities 被 components 层压制（基线：工具类覆盖组件样式失效）', async () => {
  // 双向实证：组件 pad-lg(24) 吞掉工具 padding-xs(4)；组件 pad-sm(8) 吞掉工具 padding-lg(24)
  assert.equal(await computed('.ls-override-down', 'padding'), '24px', '基线：wf-padding-xs(4px) 被 wf-card--pad-lg 压制')
  assert.equal(await computed('.ls-override-up', 'padding'), '8px', '基线：wf-padding-lg(24px) 被 wf-card--pad-sm 压制')
  assert.equal(await computed('.ls-override-btn', 'padding'), '10px 16px', '基线：wf-padding-lg 被 wf-btn 压制')
  // 对照组：工具类单独使用完全正常 → 证明失效根因是层序而非类缺失
  assert.equal(await computed('.ls-util-alone', 'padding'), '4px', '对照组：wf-padding-xs 单独生效（根因=层序）')
})

test('③ 零值档位缺口（基线：wf-padding-none 未定义 → 组件内边距无法用工具类取消）', async () => {
  assert.equal(
    await computed('.ls-zero', 'padding'),
    '24px',
    '基线缺口：wf-margin-none/wf-gap-none 已定义而 wf-padding-none 未定义（W2 补齐后应为 0px）',
  )
})

test('④ 断点变体 wf-hidden@lg（基线：@1280 = none · 窄屏 = flex）', async () => {
  assert.equal(await computed('.ls-bp', 'display'), 'none', '1280 视口：wf-hidden@lg 生效（当前靠 !important 变通）')
  await page.setViewportSize({ width: 800, height: 900 })
  assert.equal(await computed('.ls-bp', 'display'), 'flex', '800 视口（<1024）：wf-flex 生效——窄显宽隐组合成立')
  await page.setViewportSize({ width: 1280, height: 900 })
})

test('⑤ 冲突对 wf-row × wf-stack（基线：同属性不同值——静默取 column）', async () => {
  assert.equal(await computed('.ls-conflict', 'display'), 'flex', '两原语都设 display:flex（同值——非冲突）')
  assert.equal(
    await computed('.ls-conflict', 'flexDirection'),
    'column',
    '基线：wf-row 不设 direction（默认 row）而 wf-stack 设 column → 组合语义静默（W2 定案：禁共用/合成类）',
  )
  assert.equal(await computed('.ls-conflict', 'flexWrap'), 'wrap', 'wf-row 的 wrap 保留（互补属性——非冲突）')
})
