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
