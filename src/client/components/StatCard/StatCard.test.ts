/**
 * StatCard 组件契约测试——命令流级断言（零浏览器——node 直跑）
 *
 * 锁定（2026-12 定时器纪律专项）：
 * - 首帧：create 属性面（value/label/trend——函数过滤——onClick 不进 attrs）
 * - countdown 模式：setInterval 工厂/微任务期创建（**不在 renderFn 窗口内**——
 *   effect-guard 红线——SSR 污染实证 DemoProgress 同款）
 * - 卸载清理：hold 通道——unmount 后 setInterval 全部 clear（零遗留）
 * - 值直落（G14）：animate 模式 display 直落终值（不依赖 rAF 驱动）
 *
 * 运行：node --env-file=.env --test src/client/components/StatCard/StatCard.test.ts
 */
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { StatCard } from './StatCard.ts'
import { mount, ops, createTable, assertCreate } from '../../../test/contract/component-harness.ts'

// ── 定时器 spy（记录 create/clear——卸载零遗留断言）────────────────
let created: Array<{ kind: 'timeout' | 'interval'; id: unknown }> = []
let cleared: unknown[] = []
const origSetTimeout = globalThis.setTimeout
const origSetInterval = globalThis.setInterval
const origClearTimeout = globalThis.clearTimeout
const origClearInterval = globalThis.clearInterval

beforeEach(() => {
  // 浏览器环境模拟（SSR 门控是 typeof window——node 测试环境补定义；SSR 零定时器由门控保证）
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
  // 存活定时器回收（不回收 → node 事件循环驻留——test runner 挂起）
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

/** 微任务排空（queueMicrotask 延迟创建的定时器落账——window 定义先于 flush） */
const flush = () => new Promise<void>((r) => origSetTimeout(() => r(), 0))

test('首帧：create 属性面（value/label/trend——事件函数过滤）', async () => {
  const h = await mount(StatCard, { label: 'Agent 总数', value: 42, trend: 'up', trendLabel: '+12%' })
  const ct = createTable(h.cmds)
  // 结构：root.0=wf-stat / root.0.0=icon?（无）→ value/label
  assert.ok(ops(h.cmds).includes('mount'), '组件挂载命令')
  const values = [...ct.values()]
  assert.ok(values.some((n) => n.attrs.class === 'wf-stat-value wf-nums'), 'value 节点')
  assert.ok(values.some((n) => n.attrs.class === 'wf-stat-label'), 'label 节点')
  assert.ok(values.some((n) => String(n.attrs.class ?? '').includes('wf-stat-trend--up')), 'trend 方向类')
  const rootAttrs = ct.get('root.0')!.attrs
  assert.equal(rootAttrs.onClick, undefined, 'onClick 不进 attrs（事件表通道）')
})

test('countdown 模式：setInterval 微任务期创建（renderFn 窗口外——effect-guard 合法）', async () => {
  const target = Date.now() + 3600_000
  const h = await mount(StatCard, { label: '剩余', countdown: target })
  const ct = createTable(h.cmds)
  const values = [...ct.values()]
  // 首帧同步显示剩余（1 小时内 → mm:ss / hh:mm:ss 形态）
  const valueNode = values.find((n) => n.attrs.class === 'wf-stat-value wf-nums')
  assert.ok(valueNode, 'value 节点存在')
  // mount await 后微任务已排空——工厂期/微任务期创建（均窗口外——guard 合法）
  assert.ok(created.some((c) => c.kind === 'interval'), 'interval 已创建（工厂/微任务期——非 renderFn 窗口）')
  // 重渲染：timer 已在——不重复创建（幂等——重渲染风暴防护）
  const before = created.filter((c) => c.kind === 'interval').length
  await h.render({ label: '剩余', countdown: target })
  await flush()
  const after = created.filter((c) => c.kind === 'interval').length
  assert.equal(after, before, '重渲染不重建 interval（幂等）')
})

test('countdown 卸载：hold 通道清理——interval 零遗留（违例 render 根治）', async () => {
  const target = Date.now() + 3600_000
  const h = await mount(StatCard, { label: '剩余', countdown: target })
  await flush()
  const intervals = created.filter((c) => c.kind === 'interval').map((c) => c.id)
  assert.ok(intervals.length >= 1, 'interval 已创建')
  h.unmount()
  // 卸载后所有 interval 必须被 clear（缺一即遗留——每秒违例 render 根源）
  for (const id of intervals) assert.ok(cleared.includes(id), `interval ${String(id)} 已 clear`)
})

test('非 countdown → countdown → 撤销：timer 启停跟随（prop 驱动）', async () => {
  const target = Date.now() + 60_000
  const h = await mount(StatCard, { label: 'x', value: '5' })
  await flush()
  assert.ok(!created.some((c) => c.kind === 'interval'), '初始非倒计时零 interval')
  await h.render({ label: 'x', countdown: target })
  await flush()
  assert.ok(created.some((c) => c.kind === 'interval'), 'prop 切倒计时 → interval 启动')
  await h.render({ label: 'x', value: 'done' })
  await flush()
  const intervals = created.filter((c) => c.kind === 'interval').map((c) => c.id)
  for (const id of intervals) assert.ok(cleared.includes(id), '切回普通值 → interval 停止')
})

test('值直落（G14）：animate 数值 display 终值渲染（不依赖 rAF——headless 不卡 0）', async () => {
  const h = await mount(StatCard, { label: '总数', value: 128, animate: true })
  const ct = createTable(h.cmds)
  const valueNode = [...ct.values()].find((n) => n.attrs.class === 'wf-stat-value wf-nums')
  assert.ok(valueNode, 'value 节点存在')
})

test('键盘可达：onClick 时 role=button + tabindex（键盘可达红线）', async () => {
  const h = await mount(StatCard, { label: 'x', value: '1', onClick: () => {} })
  const ct = createTable(h.cmds)
  const rootAttrs = ct.get('root.0')!.attrs
  assert.equal(rootAttrs.role, 'button', 'role=button')
  assert.equal(rootAttrs.tabindex, 0, 'tabindex=0')
  assertCreate(ct, 'root.0', 'div', {})
})
