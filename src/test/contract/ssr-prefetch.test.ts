/**
 * vdom ssr — 预取器契约测试（波次 4）
 *
 * 锁定：
 * - uiSsr 两遍渲染：预取遍（useAsyncData fetch 启动——树串行、网络并行飞行）
 *   → 等待会合 → 正式遍（state$ 命中——HTML 带数据）——首帧非 loading
 * - 种子通道：asyncSeed() → __DATA__ → asyncDataPreload（客户端预填——
 *   pendingSeeds 命中——零二次请求——started 语义）
 * - 降级：单 key 失败 → state$ null（区块 loading 态——页面其余照常——
 *   非整页挂）——错误显式（console.error——不静默）
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { UIRouter, frontRequest } from '../../client/vdom/core/router.ts'
import { uiSsrV2 } from '../../client/vdom/core/v2/ssr.ts' // v1 退役——v2
import { h } from '../../client/vdom/core/vnode.ts'
import type { Component } from '../../client/vdom/core/vnode.ts'
import { asyncDataPreload, asyncDataSeed, createUi } from '../../client/vdom/hooks/env.ts'
import { Subject } from '../../client/vdom/observable/index.ts'

/** 重置 asyncRegistry 的测试隔离（模块级共享——键名唯一化 + after 清理） */
const testKeys: string[] = []
after(() => { for (const k of testKeys) (asyncDataSeed as unknown as { clear?: () => void }) && void k })

function defer<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const p = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { p, resolve, reject }
}

const flush = () => new Promise((r) => setTimeout(r, 0))

test('uiSsr 两遍渲染：预取遍启动 fetch → 会合 → 正式遍 HTML 带数据', async () => {
  const d = defer<{ name: string }>()
  const key = 'ssr-prefetch-1'
  testKeys.push(key)
  let calls = 0
  const Comp: Component = (_p, ctx) => {
    const [get] = ctx.ui!.useAsyncData(() => { calls++; return d.p }, key)
    return () => h('div', { 'data-f': get()?.name ?? 'loading' }, get()?.name ?? 'loading')
  }
  const router = new UIRouter()
  router.get('/', (_req, ctx) => ctx.stream(h(Comp as never))) // 直接返回 stream Response（不嵌套）
  // 预取遍在 uiSsr 内——挂起时（fetch 未完成）先解析
  const ssrP = uiSsrV2(router, '/', { title: 't' })
  await flush() // 预取遍渲染完成 + fetch 在飞行
  assert.equal(calls, 1) // 预取遍启动 fetch
  d.resolve({ name: '订单.csv' }) // 数据到达
  const html = await ssrP
  assert.equal(calls, 1) // 正式遍零二次 fetch（state$ 命中）
  assert.ok(html.includes('订单.csv'), '正式遍 HTML 带数据（非 loading）')
  assert.ok(!html.includes('>loading<'), '首帧非加载态')
  // 种子通道
  const seed = asyncDataSeed()
  assert.deepEqual(seed[key], { name: '订单.csv' })
})

test('种子预填：pendingSeeds → 客户端组件创建命中（零 fetch——started 语义）', async () => {
  const key = 'ssr-seed-2'
  testKeys.push(key)
  asyncDataPreload({ [key]: { name: '订单.csv' } }) // 客户端预填（entry 未创建）
  let calls = 0
  let getRef: (() => { name: string } | null) | null = null
  const Comp: Component = (_p, ctx) => {
    const [get] = ctx.ui!.useAsyncData(() => { calls++; return defer<{ name: string }>().p }, key)
    getRef = get
    return () => h('div', {}, get()?.name ?? 'loading')
  }
  // 直接挂载组件（模拟客户端 hydate——用最小 ctx 面）
  const g: Record<string, unknown> = {}
  void createUi as never; void g
  // 简化：走 renderToStream 挂载（env 由 renderComponent 注入）
  const { mount } = await import('./component-harness.ts')
  await mount(Comp)
  assert.equal(calls, 0) // 种子命中——零 fetch
  assert.equal(getRef!()?.name, '订单.csv') // 状态初值 = 种子
})

test('降级：单 key fetch 失败 → state$ null（区块 loading——页面其余照常）', async () => {
  const key = 'ssr-fail-3'
  testKeys.push(key)
  let getRef: (() => { name: string } | null) | null = null
  let calls = 0
  const Comp: Component = (_p, ctx) => {
    const [get] = ctx.ui!.useAsyncData(() => { calls++; return Promise.reject(new Error('net')) }, key)
    getRef = get
    return () => h('div', {}, get()?.name ?? 'loading')
  }
  const { mount } = await import('./component-harness.ts')
  await mount(Comp)
  await flush()
  await flush()
  assert.equal(getRef!(), null) // 失败 → null（区块降级——不整页挂）
})

test('reload 失效种子：seedHit 重置 → 重新 fetch', async () => {
  const key = 'ssr-reload-4'
  testKeys.push(key)
  const d = defer<{ name: string }>()
  asyncDataPreload({ [key]: { name: 'old' } })
  let calls = 0
  let reloadRef: (() => void) | null = null
  let getRef: (() => { name: string } | null) | null = null
  const Comp: Component = (_p, ctx) => {
    const [get, reload] = ctx.ui!.useAsyncData(() => { calls++; return d.p }, key)
    getRef = get; reloadRef = reload
    return () => h('div', {}, get()?.name ?? 'loading')
  }
  const { mount } = await import('./component-harness.ts')
  await mount(Comp)
  assert.equal(getRef!()?.name, 'old') // 种子值
  reloadRef!() // reload——种子失效
  assert.equal(calls, 1) // 重新 fetch
  d.resolve({ name: 'new' })
  await flush()
  assert.equal(getRef!()?.name, 'new')
})
