/**
 * postgres 中间件：idle_timeout 透传契约（memory server——零外部依赖）
 *
 * 根因（2027-10——agent-platform watch 重启连接击穿实证）：PgPool 已实现
 * 空闲收缩（idleTimeoutMs → reaper），但中间件 client.ts 未透传 opts.idle_timeout
 * ——类型声明了、实现消费不了（类型谎言）——应用配置静默丢弃，峰值连接永不
 * 收缩（实测单实例 idle 49）→ dev --watch 重启叠加期 49+50 > pg max_connections
 * → 新实例启动失败 too many clients already。
 *
 * 锁定契约：
 * - idle_timeout > 0：空闲超时后池容量收缩（open 递减），再次查询自动重建
 * - 默认（不传）：不收缩——旧行为不变（峰值连接常驻）
 *
 * 运行：RUN_DOCKER_TESTS=1（W3b：wire 内存服务器消亡后需真库——DATABASE_URL）
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from './client.ts'

// W3b：wire 内存服务器消亡——idle_timeout 契约改真库 gate（RUN_DOCKER_TESTS=1）
const DB_URL = process.env.TEST_PG_URL ?? process.env.DATABASE_URL ?? ''
const SKIP = process.env.RUN_DOCKER_TESTS !== '1'
if (SKIP) console.log('[client-test] 跳过（RUN_DOCKER_TESTS 未设——wire 服务器消亡后需真库 gate）')

describe('postgres middleware idle_timeout（空闲收缩透传）', { skip: SKIP }, () => {
  it('idle_timeout > 0：空闲超时后连接回收（open 收缩）——再次查询自动重建', async () => {
    // 池 4 连接（init 全量建连）+ idle 50ms（测试快拍）——reaper interval = idle_timeout
    const db = postgres({ connection: DB_URL, max: 4, idle_timeout: 60 })
    await db.runMigration('probe-s1', 'SELECT 1') // 触发一次查询（池懒建连——1 连接）
    const middleware = db as unknown as { poolStats: () => { idle: number } }
    assert.equal(middleware.poolStats().idle, 1, '懒建连：1 次查询 = 1 连接')
    // 空闲 ≥ 2×reaper 间隔（reaper 每 60ms 扫一次，连接空闲需 ≥60ms 判回收）
    await new Promise((r) => setTimeout(r, 180))
    assert.ok(
      (middleware.poolStats().idle as number) < 4,
      `空闲超时后连接应被回收（实际 idle=${middleware.poolStats().idle}）——透传断链回归哨兵`,
    )
    // 下次需要时自动重建（收缩不影响可用性）
    await db.runMigration('probe-s2', 'SELECT 1 AS ok')
    assert.equal(middleware.poolStats().idle, 1, '收缩后查询应自动重建连接')
    await db.close()
  })

  it('默认不传 idle_timeout：不收缩（旧行为不变——峰值连接常驻）', async () => {
    const db = postgres({ connection: DB_URL, max: 3 })
    await db.runMigration('probe-s3', 'SELECT 1')
    const middleware = db as unknown as { poolStats: () => { idle: number } }
    await new Promise((r) => setTimeout(r, 180))
    assert.ok(middleware.poolStats().idle >= 1, '默认行为应保持：空闲连接不回收（常驻池）')
    await db.close()
  })
})

describe('postgres middleware idle_timeout（init 全量建连也参与收缩）', { skip: SKIP }, () => {
  it('从未使用过的连接同样被回收（lastUsed=0 边界——init 后置起点）', async () => {
    // 池 4：只跑 1 次查询（其余 3 条从未使用）——收缩后应趋零（旧代码 lastUsed=0 跳过）
    const db = postgres({ connection: DB_URL, max: 4, idle_timeout: 60 })
    await db.runMigration('probe-s4', 'SELECT 1')
    const middleware = db as unknown as { poolStats: () => { idle: number } }
    await new Promise((r) => setTimeout(r, 250))
    assert.equal(
      middleware.poolStats().idle,
      0,
      `空闲超时后连接回收（实际 idle=${middleware.poolStats().idle}）——lastUsed=0 边界回归哨兵`,
    )
    await db.close()
  })
})
