/**
 * weifuwu/workflow/edge — 「发一次」去重状态机（纯函数核心 + 存储适配）
 *
 * 语义（写死进测试）：
 *   - 条件由假变真（上升沿）→ fire（放行）
 *   - 真持续期间 → 静默（不重复触发——"发一次预警"）
 *   - 变假 → 解除武装（重新武装，下次上升沿再 fire）
 *   - 首次运行（无状态）按"假"处理：held=true → fire
 *
 * 多实例一致性：读改写非原子——at-least-once 重投窗口内**最多重复 fire 一次**
 * （诚实裁剪——v1 不引锁；需要严格单次时消费方自行加幂等键）
 */
import type { Redis } from '../db/contracts.ts'

export interface EdgeStore {
  get: (key: string) => Promise<string | null>
  set: (key: string, value: string) => Promise<void>
}

/** 决策纯函数：给定上次状态 + 当前条件 → { fired, next } */
export function evaluateEdge(last: string | null, held: boolean): { fired: boolean; next: string } {
  if (held) {
    if (last === '1') return { fired: false, next: '1' } // 真持续——静默
    return { fired: true, next: '1' } // 首次/假→真上升沿——fire
  }
  return { fired: false, next: '0' } // 变假——解除武装
}

/** Redis 适配（工厂使用）：command('GET'/'SET') 通用——MemoryRedis/生产 redis 同接口 */
export function redisEdgeStore(redis: Redis): EdgeStore {
  return {
    get: async (key) => {
      const v = await redis.command('GET', key)
      return v === null || v === undefined ? null : String(v)
    },
    set: async (key, value) => { await redis.command('SET', key, value) },
  }
}
