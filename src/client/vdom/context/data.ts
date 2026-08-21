/**
 * vdom context — DataPipe 实现（数据管道——组件工厂取数的唯一异步边界）
 *
 * 契约（设计规则 §3.4——ctx.data）：
 * - **缓存 + 并发合并**：同 key 并发 get → 同一 promise（重复执行零成本——
 *   组件工厂 N 实例同 key 取数合并）
 * - **key 约定即 URL**（`/api/posts/1`）——天然唯一——key 必须含数据维度
 *   （route params、userId）
 * - **三场景**（SSR 真 fetch / hydration 种子同步命中 / SPA 未命中触发
 *   fetcher——**无 hydration 决策后**：preload/seed 保留为 SSR 种子通道——
 *   客户端接管时同步命中避免二次 fetch）
 * - **失败缓存**：reject 的 promise 缓存——显式 invalidate(key) 重试
 *   （默认失败不重试——诚实语义）
 * - 未命中且无 fetcher → 默认 fetch(key)（key = URL——JSON 解析）
 */

import type { DataPipe } from './UIContext.ts'

export function createDataPipe(): DataPipe {
  const cache = new Map<string, Promise<unknown>>()
  /** 种子数据（hydration 预热 / SSR 收集——key → 值） */
  let seedData: Record<string, unknown> = {}

  return {
    get<T = unknown>(key: string, fetcher?: () => Promise<T>): Promise<T> {
      const existing = cache.get(key)
      if (existing) return existing as Promise<T>
      // 未命中——并发合并（同 key 共享同一 promise）
      const p = (async () => {
        // 种子优先（hydration 预热——同步命中——零二次 fetch）
        if (key in seedData) return seedData[key] as T
        if (fetcher) return fetcher()
        // 默认 fetch（key = URL——SPA 场景）
        const res = await fetch(key)
        if (!res.ok) throw new Error(`[vdom] ctx.data 请求失败 ${res.status}: ${key}`)
        return res.json() as T
      })()
      // 失败缓存（显式 invalidate 重试——默认失败缓存不重试）
      cache.set(key, p)
      return p
    },

    set<T = unknown>(key: string, value: T): void {
      cache.set(key, Promise.resolve(value))
    },

    has(key: string): boolean {
      return cache.has(key)
    },

    preload(seed: Record<string, unknown>): void {
      seedData = { ...seedData, ...seed }
    },

    invalidate(key: string): void {
      cache.delete(key)
    },

    seed(): Record<string, unknown> {
      return seedData
    },
  }
}
