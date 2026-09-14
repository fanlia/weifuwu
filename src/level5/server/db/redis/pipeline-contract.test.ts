/**
 * Redis pipeline 契约测试（SERVER-PERF-PLAN S5——波次 2）
 *
 * 双实现等价纪律（contracts.ts——接口与实现分离）：
 *   RedisPool.pipeline()（真库——CS-04 docker redis）
 *   MemoryRedis.pipeline()（内存——测试/无 redis 环境）
 *
 * 语义：
 *   - 批量命令单次网络往返发送，结果按命令顺序返回
 *   - 错误命令对应位置为 Error 实例，其余命令不受影响（Redis 管道语义）
 *   - 与并发 command() 同连接交错安全（连接层 FIFO pending——按序匹配）
 */

import { describe, it, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { RedisPool } from './pool.ts'
import { MemoryRedis } from '../memory-redis.ts'

describe('redis pipeline contract (S5)', () => {
  // 唯一 key：跨运行 + 跨并行测试不碰撞（CS-04 真库纪律：真库是持久的）
  const ns = `pltest-${Date.now()}-${randomUUID().slice(0, 8)}:`
  const pool = new RedisPool({ keyPrefix: ns })
  const memory = new MemoryRedis()

  // pipeline 是连接级透传（无 keyPrefix）——测试 key 自带唯一命名空间
  const k = (name: string) => ns + name

  after(async () => {
    await pool.close()
    await memory.close()
  })

  for (const [label, client] of [
    ['RedisPool(真库)', pool],
    ['MemoryRedis(内存)', memory],
  ] as const) {
    describe(label, () => {
      it('exec 结果按命令顺序返回', async () => {
        const p = await client.pipeline()
        p.incr(k("seq")).incr(k("seq")).raw("GET", k("seq"))
        const results = await p.exec()
        assert.deepEqual(results.map(Number), [1, 2, 2], 'INCR,INCR,GET 按序返回')
      })

      it('错误按位返回——其余命令不受影响（管道语义）', async () => {
        const p = await client.pipeline()
        // WFNOSUCH：双端必然报错（Memory=resolveCommand 拒绝；真库=ERR unknown command）
        p.raw('SET', k('err-key'), 'v').raw('WFNOSUCH', 'x').raw('GET', k('err-key'))
        const results = await p.exec()
        assert.equal(results.length, 3)
        assert.ok(!(results[0] instanceof Error), 'SET 成功')
        assert.ok(results[1] instanceof Error, '错误按位返回')
        assert.ok(!(results[2] instanceof Error), '后续命令不受影响')
        assert.equal(String(results[2]), 'v')
      })

      it('与并发 command() 同连接交错安全（FIFO pending 按序匹配）', async () => {
        const [pipeRes, cmdRes] = await Promise.all([
          (async () => {
            const p = await client.pipeline()
            p.incr(k("race")).incr(k("race"))
            return p.exec()
          })(),
          client.command("INCR", k("race")),
        ])
        const values = [...pipeRes.map(Number), Number(cmdRes)].sort((a, b) => a - b)
        assert.deepEqual(values, [1, 2, 3], '三种途径的 INCR 各自原子且按序解析')
      })

      it('exec 后可复用（cmds 清空——再次链式调用是新批次）', async () => {
        const p = await client.pipeline()
        p.incr(k("reuse"))
        assert.equal(Number((await p.exec())[0]), 1)
        p.incr(k("reuse"))
        assert.equal(Number((await p.exec())[0]), 2)
      })

      it('空 pipeline exec 返回空数组', async () => {
        const p = await client.pipeline()
        assert.deepEqual(await p.exec(), [])
      })
    })
  }
})
