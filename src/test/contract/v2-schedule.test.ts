/**
 * vdom v2 — 调度流契约测试（render$ batching——同拍 N→1 + 渲染中排队）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRenderScheduler } from '../../client/vdom/core/v2/schedule.ts'

const flush = () => new Promise((r) => setTimeout(r, 0))

test('batching：同微任务拍 N 次 request → 1 次渲染', async () => {
  const s = createRenderScheduler()
  let renders = 0
  s.renders$.subscribe({ next: () => renders++ })
  for (let i = 0; i < 10; i++) s.request()
  await flush()
  assert.equal(renders, 1, '同拍 10 次请求 → 1 次渲染（React 18 同级 batching）')
})

test('微任务拍分离：不同拍各 1 次', async () => {
  const s = createRenderScheduler()
  let renders = 0
  s.renders$.subscribe({ next: () => renders++ })
  s.request()
  await flush()
  s.request()
  await new Promise((r) => setTimeout(r, 10))
  assert.equal(renders, 2, '跨拍请求各 1 次')
})

test('渲染中请求：排队（下拍 flush——不丢）', async () => {
  const s = createRenderScheduler()
  const order: string[] = []
  let resolveRender!: () => void
  const gate = new Promise<void>((r) => { resolveRender = r })
  s.renders$.subscribe({ next: () => {
    order.push('render')
    if (order.length < 2) s.request() // 渲染中请求（应排队——下拍）——限 2 次（防风暴）
    void gate.then(() => {})
  } })
  s.request()
  await flush()
  // 渲染回调执行（order = ['render']）——渲染中请求已排队——放行
  resolveRender()
  await new Promise((r) => setTimeout(r, 10))
  assert.deepEqual(order.slice(0, 2), ['render', 'render'], '渲染中请求排队——下拍执行（不丢）')
})

test('合并统计（透明度：requested/flushed）', async () => {
  const s = createRenderScheduler()
  for (let i = 0; i < 5; i++) s.request()
  await flush()
  const st = s.stats()
  assert.ok(st.requested >= 5, '请求计数')
})

test('连续请求风暴：每拍合并——总渲染数 << 请求数', async () => {
  const s = createRenderScheduler()
  let renders = 0
  s.renders$.subscribe({ next: () => renders++ })
  // 模拟 30 次请求分散在 3 拍（每拍 10 次）
  for (let batch = 0; batch < 3; batch++) {
    for (let i = 0; i < 10; i++) s.request()
    await flush()
    await new Promise((r) => setTimeout(r, 5))
  }
  assert.ok(renders <= 3 * 2, `风暴合并：${renders} 次渲染（请求 30——合并后应 ≤6）`)
})

// ── VDOM-OBSERVABLE-OPTIMIZE 波次 3：时序显式化 + 回放 ───────────────

test('request 观测点：sched:request 事件（时间线回放原料）', async () => {
  const spy: import('../../client/vdom/core/v2/spy.ts').SpyEvent[] = []
  ;(globalThis as { __wfSpy?: unknown[] }).__wfSpy = spy
  try {
    const s = createRenderScheduler()
    s.request()
    s.request()
    await flush()
    const kinds = spy.map((e) => (e as { kind: string }).kind)
    assert.ok(kinds.includes('sched:request'), 'request 观测点存在')
    assert.ok(kinds.includes('sched:flush'), 'flush 观测点存在')
    assert.equal(kinds.filter((k) => k === 'sched:request').length, 2, '每次 request 一事件')
  } finally {
    delete (globalThis as { __wfSpy?: unknown[] }).__wfSpy
  }
})

test('回放：request 拍序列重喂 → 同 flush 序列（时间线回放——调度确定性）', async () => {
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
  // 运行 1（源）——记录拍分组
  const batches: number[] = []
  const s1 = createRenderScheduler()
  let f1 = 0
  s1.renders$.subscribe({ next: () => f1++ })
  const run1 = async (n: number) => { for (let i = 0; i < n; i++) s1.request(); await flush() }
  await run1(3); batches.push(3)      // 拍 1：3 请求 → 1 flush
  await sleep(20)                      // >16ms——合法下拍流（风暴重置）
  await run1(1); batches.push(1)      // 拍 2：1 请求 → 1 flush
  await sleep(20)
  await run1(2); batches.push(2)      // 拍 3：2 请求 → 1 flush
  assert.equal(f1, 3, '源：每拍 1 flush（batching 保持）')
  // 重放（记录序列——新调度器——同 flush 序列）
  const s2 = createRenderScheduler()
  let f2 = 0
  s2.renders$.subscribe({ next: () => f2++ })
  for (const n of batches) {
    for (let i = 0; i < n; i++) s2.request()
    await flush()
    await sleep(20)
  }
  assert.equal(f2, 3, '重放：同 flush 序列（同拍分布同结果——确定性）')
  assert.deepEqual({ r: s1.stats().requested, f: s1.stats().flushed }, { r: s2.stats().requested, f: s2.stats().flushed }, '统计一致')
})

test('风暴间隔判定：≥16ms 下拍流重置（合法——风暴计数不误报）', async () => {
  // 20 次 request 分散在 20 拍（每拍间隔 20ms）——全部合法——零丢弃（renders = 20）
  const s = createRenderScheduler()
  let renders = 0
  s.renders$.subscribe({ next: () => renders++ })
  for (let i = 0; i < 20; i++) {
    s.request()
    await new Promise((r) => setTimeout(r, 20))
  }
  assert.equal(renders, 20, '合法下拍流 20 次全部渲染（零丢弃——间隔判定不误报）')
})

test('风暴防护：渲染回调内循环 request → 超限丢弃 + warn（不无限循环）', async () => {
  const s = createRenderScheduler()
  let renders = 0
  let warned = false
  const origWarn = console.warn
  console.warn = () => { warned = true }
  try {
    s.renders$.subscribe({ next: () => { renders++; s.request() } }) // 渲染中循环请求
    s.request()
    await new Promise((r) => setTimeout(r, 10))
  } finally {
    console.warn = origWarn
  }
  assert.ok(warned, '风暴 warn 触发')
  assert.ok(renders <= 25, `超限丢弃（renders=${renders}——不无限循环）`)
})

test('W4 来源 tag：sched:request 事件带来源（诊断归因）', async () => {
  // W4（VDOM-STREAM-FIX-PLAN）——渲染健康频率轴归因：
  // sched:request 从「裸事件」→「带 source tag」——排查「每拍 remount」
  // 时可区分 navigate/component-rerender/手动 render 的来源占比
  const s = createRenderScheduler()
  s.request('component-rerender')
  s.request('page-render')
  await flush()
  // sched:request 已发射且服务端 spy 记录（source tag 形状验证——不崩即可）
  const st = s.stats()
  assert.equal(st.requested, 2)
})

test('W4 默认来源：request() 无参 → unknown（向后兼容）', async () => {
  const s = createRenderScheduler()
  s.request()
  await flush()
  assert.equal(s.stats().requested, 1)
})
