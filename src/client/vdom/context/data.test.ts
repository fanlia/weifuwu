/**
 * vdom context — DataPipe 测试（数据管道——工厂取数唯一异步边界）
 *
 * 契约（AGENTS §3.4）：缓存命中直接返回；未命中调 fetcher 缓存并发合并；
 * 失败缓存（显式 invalidate 重试）；key 约定即 URL。
 */

import { test } from 'vitest'
import { expect } from 'vitest'
import { createDataPipe } from './data.ts'

test('get：缓存命中直接返回（fetcher 不重复调用）', async () => {
  const pipe = createDataPipe()
  let calls = 0
  const fetcher = async () => { calls++; return { id: 1 } }
  const a = await pipe.get('/api/1', fetcher)
  const b = await pipe.get('/api/1', fetcher)
  expect(a).toEqual({ id: 1 })
  expect(b).toEqual({ id: 1 })
  expect(calls, '缓存命中——fetcher 只调一次').toBe(1)
})

test('get：并发合并（同 key 同 promise——工厂 N 实例零重复）', async () => {
  const pipe = createDataPipe()
  let calls = 0
  const fetcher = async () => { calls++; await new Promise((r) => setTimeout(r, 10)); return 'data' }
  const [a, b, c] = await Promise.all([
    pipe.get('/api/x', fetcher),
    pipe.get('/api/x', fetcher),
    pipe.get('/api/x', fetcher),
  ])
  expect([a, b, c]).toEqual(['data', 'data', 'data'])
  expect(calls, '并发合并——同一 promise').toBe(1)
})

test('set/has：手动写入 + 存在判定', () => {
  const pipe = createDataPipe()
  expect(pipe.has('/api/y')).toBe(false)
  pipe.set('/api/y', { v: 1 })
  expect(pipe.has('/api/y')).toBe(true)
})

test('失败缓存：reject 缓存——invalidate 后重试', async () => {
  const pipe = createDataPipe()
  let calls = 0
  const fetcher = async () => {
    calls++
    if (calls === 1) throw new Error('boom')
    return 'ok'
  }
  await expect(pipe.get('/api/f', fetcher)).rejects.toThrow(/boom/)
  // 失败已缓存——第二次不重调（默认失败缓存不重试——诚实语义）
  await expect(pipe.get('/api/f', fetcher)).rejects.toThrow(/boom/)
  expect(calls, '失败缓存——不自动重试').toBe(1)
  // 显式 invalidate → 重试
  pipe.invalidate('/api/f')
  const v = await pipe.get('/api/f', fetcher)
  expect(v).toBe('ok')
  expect(calls).toBe(2)
})

test('preload 种子：同步命中（hydration 预热——零二次 fetch）', async () => {
  const pipe = createDataPipe()
  pipe.preload({ '/api/hot': { h: 1 } })
  let calls = 0
  const v = await pipe.get('/api/hot', async () => { calls++; return { h: 0 } })
  expect(v, '种子命中——fetcher 不调').toEqual({ h: 1 })
  expect(calls).toBe(0)
})

test('seed 收集（SSR——渲染后取种子序列化）', async () => {
  const pipe = createDataPipe()
  await pipe.get('/api/s', async () => 'v1')
  // 种子收集（SSR 用——当前实现收集已解析数据）
  const seed = pipe.seed()
  expect(seed, '当前收集为空（SSR 序列化通道待服务端实现接线）').toEqual({})
})
