/**
 * weifuwu/workflow/store — KV 存储（去重/状态记账的基础——wfjs 侧 store.get/set 内建）
 *
 * 设计（用户拍板 2026-09）：不提供「once」之类的去重原语——竞态/失败重试
 * 等语义由用户在代码里用 store 显式表达（JS 心智：flag 模式/记账）——
 * "发过没有" = store 值，用户自己查。
 *
 * 接口与多实例一致性：读改写非原子——at-least-once 窗口内最多重复一次
 * （诚实裁剪——v1 不引锁；需要严格单次时消费方自行加幂等键）
 */
import type { Redis } from '../db/contracts.ts'

/** KV 存储（store 步骤后端；redis 适配 get/set 通用） */
export interface KVStore {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string) => Promise<void>
  del?: (key: string) => Promise<void>
}

/** Redis 适配（工厂使用）：command('GET'/'SET') 通用——MemoryRedis/生产 redis 同接口 */
export function redisStore(redis: Redis): KVStore {
  return {
    get: async (key) => {
      const v = await redis.command('GET', key)
      return v === null || v === undefined ? null : String(v)
    },
    set: async (key, value) => { await redis.command('SET', key, value) },
    del: async (key) => { await redis.command('DEL', key) },
  }
}
