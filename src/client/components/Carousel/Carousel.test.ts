/**
 * Carousel 组件契约测试——命令流级断言（零浏览器——node 直跑）
 *
 * 锁定（2026-12 定时器纪律专项）：
 * - 首帧：结构（viewport/track/arrows/dots）+ dots key 面
 * - autoplay：interval 微任务期创建（renderFn 窗口外——effect-guard 合法）
 * - autoplay 卸载：hold 通道清理零遗留
 * - autoplay 挂载后 prop 变化：启停跟随（旧 ref 管理不跟随——已根治）
 * - count=0 → null 输出（组件输出空洞——锚处理）+ 停止 auto
 *
 * 运行：node --env-file=.env --test src/client/components/Carousel/Carousel.test.ts
 */
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { Carousel } from './Carousel.ts'
import { mount, ops, createTable } from '../../../test/contract/component-harness.ts'
import { h } from '../../../client/vdom/index.ts'

// ── 定时器 spy ──────────────────────────────────────────────────────
let created: Array<{ kind: 'timeout' | 'interval'; id: unknown }> = []
let cleared: unknown[] = []
const origSetTimeout = globalThis.setTimeout
const origSetInterval = globalThis.setInterval
const origClearTimeout = globalThis.clearTimeout
const origClearInterval = globalThis.clearInterval

beforeEach(() => {
  ;(globalThis as any).window = globalThis
  created = []
  cleared = []
  globalThis.setTimeout = ((fn: any, ms?: number, ...a: any[]) => {
    const id = origSetTimeout(fn, ms, ...a)
    created.push({ kind: 'timeout', id })
    return id
  }) as typeof setTimeout
  globalThis.setInterval = ((fn: any, ms?: number, ...a: any[]) => {
    const id = origSetInterval(fn, ms, ...a)
    created.push({ kind: 'interval', id })
    return id
  }) as typeof setInterval
  globalThis.clearTimeout = ((id: any) => { cleared.push(id); return origClearTimeout(id) }) as typeof clearTimeout
  globalThis.clearInterval = ((id: any) => { cleared.push(id); return origClearInterval(id) }) as typeof clearInterval
})
afterEach(() => {
  for (const c of created) {
    if (c.kind === 'interval') origClearInterval(c.id as any)
    else origClearTimeout(c.id as any)
  }
  delete (globalThis as any).window
  globalThis.setTimeout = origSetTimeout
  globalThis.setInterval = origSetInterval
  globalThis.clearTimeout = origClearTimeout
  globalThis.clearInterval = origClearInterval
})

const slide = (i: number) => h('div', { class: 'slide' }, `s${i}`)
const flush = () => new Promise<void>((r) => origSetTimeout(() => r(), 0))

test('首帧：结构（viewport/track/arrows/dots）', async () => {
  const h = await mount(Carousel, { children: [slide(0), slide(1), slide(2)], autoplay: false })
  const ct = createTable(h.cmds)
  assert.ok(ops(h.cmds).includes('mount'), '组件挂载命令')
  const classes = [...ct.values()].map((n) => String(n.attrs.class ?? ''))
  assert.ok(classes.includes('wf-carousel-viewport'), 'viewport')
  assert.ok(classes.includes('wf-carousel-track'), 'track')
  assert.ok(classes.some((c) => c.includes('wf-carousel-arrow--prev')), 'prev 箭头')
  assert.ok(classes.some((c) => c.includes('wf-carousel-arrow--next')), 'next 箭头')
  assert.ok(classes.includes('wf-carousel-dots'), 'dots 容器')
})

test('autoplay：interval 微任务期创建 + 卸载 hold 清理零遗留', async () => {
  const h = await mount(Carousel, { children: [slide(0), slide(1)], autoplay: true, interval: 50 })
  await flush()
  const intervals = created.filter((c) => c.kind === 'interval').map((c) => c.id)
  assert.ok(intervals.length === 1, `interval 恰 1 个（实际: ${intervals.length}）`)
  h.unmount()
  for (const id of intervals) assert.ok(cleared.includes(id), `interval ${String(id)} 已 clear`)
})

test('非 autoplay：零 interval（默认关闭）', async () => {
  const h = await mount(Carousel, { children: [slide(0), slide(1)] })
  await flush()
  assert.ok(!created.some((c) => c.kind === 'interval'), '默认无 interval')
})

test('autoplay 挂载后 prop 变化：启停跟随（旧 ref 管理不跟随——根治回归）', async () => {
  const h = await mount(Carousel, { children: [slide(0), slide(1)] })
  await flush()
  assert.ok(!created.some((c) => c.kind === 'interval'), '初始无 interval')
  // false → true：启动
  await h.render({ children: [slide(0), slide(1)], autoplay: true })
  await flush()
  assert.ok(created.some((c) => c.kind === 'interval'), 'prop 切 autoplay → 启动')
  // true → false：停止
  await h.render({ children: [slide(0), slide(1)], autoplay: false })
  await flush()
  const ids = created.filter((c) => c.kind === 'interval').map((c) => c.id)
  for (const id of ids) assert.ok(cleared.includes(id), '切回手动 → 停止')
})

test('autoplay 间隔变化：interval 重启（旧值残留根治）', async () => {
  const h = await mount(Carousel, { children: [slide(0), slide(1)], autoplay: true, interval: 100 })
  await flush()
  const first = created.filter((c) => c.kind === 'interval').map((c) => c.id)
  assert.ok(first.length === 1, '首建 1 个')
  await h.render({ children: [slide(0), slide(1)], autoplay: true, interval: 500 })
  await flush()
  assert.ok(first.every((id) => cleared.includes(id)), '旧间隔 interval 已 clear')
  assert.ok(created.filter((c) => c.kind === 'interval').length >= 2, '新间隔 interval 已建')
})

test('count=0：null 输出（空洞锚）+ autoplay 停止', async () => {
  const h = await mount(Carousel, { children: [slide(0)], autoplay: true })
  await flush()
  const cmds = await h.render({ children: [], autoplay: true })
  assert.ok(cmds.some((c) => c.op === 'remove'), '空列表移除（null 输出）')
  await flush()
  const ids = created.filter((c) => c.kind === 'interval').map((c) => c.id)
  for (const id of ids) assert.ok(cleared.includes(id), '空列表 → auto 停止')
})

test('dots key 面：key=i（位置身份——dot 无状态）', async () => {
  const h = await mount(Carousel, { children: [slide(0), slide(1), slide(2)] })
  // dots 按钮精确类名匹配（R-03：子串匹配误伤容器类 wf-carousel-dots）
  const ct = createTable(h.cmds)
  const dots = [...ct.values()].filter((n) => {
    const cls = String(n.attrs.class ?? '').split(' ')
    return cls.includes('wf-carousel-dot')
  })
  assert.equal(dots.length, 3, '3 个 dot')
})
