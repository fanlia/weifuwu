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
 */
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { MemoryPostgresServer } from '../db/postgres-server.ts'
import { postgres } from './client.ts'

const pgServer = new MemoryPostgresServer()
await pgServer.start()
after(async () => { await pgServer.close() })
const DB_URL = pgServer.url

describe('postgres middleware idle_timeout（空闲收缩透传）', () => {
  it('idle_timeout > 0：空闲超时后连接回收（open 收缩）——再次查询自动重建', async () => {
    // 池 4 连接（init 全量建连）+ idle 50ms（测试快拍）——reaper interval = idle_timeout
    const db = postgres({ connection: DB_URL, max: 4, idle_timeout: 60 })
    await db.sql`SELECT 1` // 触发 init（4 连接全建）
    const middleware = db as unknown as { poolStats: () => { idle: number } }
    assert.equal(middleware.poolStats().idle, 4, 'init 后池应为满配（4 连接）')
    // 空闲 ≥ 2×reaper 间隔（reaper 每 60ms 扫一次，连接空闲需 ≥60ms 判回收）
    await new Promise((r) => setTimeout(r, 180))
    assert.ok(
      (middleware.poolStats().idle as number) < 4,
      `空闲超时后连接应被回收（实际 idle=${middleware.poolStats().idle}）——透传断链回归哨兵`,
    )
    // 下次需要时自动重建（收缩不影响可用性）
    const rows = await db.sql`SELECT 1 AS ok`
    assert.equal((rows[0] as { ok: number }).ok, 1, '收缩后查询应自动重建连接')
    await db.close()
  })

  it('默认不传 idle_timeout：不收缩（旧行为不变——峰值连接常驻）', async () => {
    const db = postgres({ connection: DB_URL, max: 3 })
    await db.sql`SELECT 1`
    const middleware = db as unknown as { poolStats: () => { idle: number } }
    await new Promise((r) => setTimeout(r, 180))
    assert.equal(middleware.poolStats().idle, 3, '默认行为应保持：空闲连接不回收（常驻池）')
    await db.close()
  })
})

describe('postgres middleware idle_timeout（init 全量建连也参与收缩）', () => {
  it('从未使用过的连接同样被回收（lastUsed=0 边界——init 后置起点）', async () => {
    // 池 4：只跑 1 次查询（其余 3 条从未使用）——收缩后应趋零（旧代码 lastUsed=0 跳过）
    const db = postgres({ connection: DB_URL, max: 4, idle_timeout: 60 })
    await db.sql`SELECT 1`
    const middleware = db as unknown as { poolStats: () => { idle: number } }
    await new Promise((r) => setTimeout(r, 250))
    assert.ok(
      (middleware.poolStats().idle as number) <= 1,
      `从未使用的连接也应被回收（实际 idle=${middleware.poolStats().idle}）——lastUsed=0 边界回归哨兵`,
    )
    await db.close()
  })
})

// ── sql.array()：PG 数组参数契约（分层——纯函数矩阵 memory 可跑；
// ANY($n::uuid[]) 真库链路在 apps/agent-platform/test/ui/bulk-approve.test.ts 走真 PG）──
// 根因（2027-10——agent-platform 批量审批实证）：连接层参数编码 object → JSON.stringify
// （jsonb 语义）——数组参数传 ANY($n::uuid[]) 生成 malformed array literal。类型不可知
// （jsonb 数组 vs PG 数组），正解 = 显式 sql.array() 标记，默认 JSON 行为零破坏。
describe('sql.array()——toPgArrayLiteral 编码矩阵（纯函数——memory 零依赖）', () => {
  it('uuid 集合 → 裸写 {a,b}', async () => {
    const db = postgres({ connection: DB_URL, max: 1 })
    const lit = db.sql.array(['00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'])
    assert.deepEqual(lit, { __pgArray: ['00000000-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-00000000000b'] })
    await db.close()
  })

  it('escape 矩阵：逗号/引号/反斜杠转义 + null → NULL（PG 数组文本格式单源）', async () => {
    const { toPgArrayLiteral } = await import('../db/postgres/connection.ts')
    // String.raw 断言（免多层转义地狱）：含 , " \\ 的元素 → 双引号包裹 + 内部 \\ " 各前置 \\
    assert.equal(toPgArrayLiteral(['普通', '含,逗号', '含"引号', String.raw`含\反斜杠`, null]),
      String.raw`{"普通","含,逗号","含\"引号","含\\反斜杠",NULL}`)
    assert.equal(toPgArrayLiteral([]), '{}', '空数组 → {}')
    assert.equal(toPgArrayLiteral([1, true]), '{1,true}', '数字/布尔裸写')
  })

  it('标记识别：tagged 链路把 __pgArray 作为参数透传（编码落点在连接层 encodeParams）', async () => {
    const db = postgres({ connection: DB_URL, max: 1 })
    // 不触发 parser 不认识的语法——只验证 tagged 构造（SELECT 1 带数组参数不崩：
    // 参数透传后编码在 encodeParams——PG literal 字符串不影响 SELECT 1）
    const rows = await db.sql`SELECT 1 WHERE ${db.sql.array(['a'])}::text IS NOT NULL`
    assert.equal(rows.length, 1)
    await db.close()
  })

  it('默认行为零破坏：数组插值保持 jsonb 语义（memory 往返）', async () => {
    const db = postgres({ connection: DB_URL, max: 1 })
    await db.sql`CREATE TABLE arr_json (id serial PRIMARY KEY, payload jsonb)`
    await db.sql`INSERT INTO arr_json (payload) VALUES (${['x', 'y']})`
    const [row] = await db.sql`SELECT payload FROM arr_json ORDER BY id DESC LIMIT 1`
    assert.deepEqual(row.payload, ['x', 'y'], 'jsonb 列数组插值应保持 JSON 语义（不受 sql.array 影响）')
    await db.sql`DROP TABLE arr_json`
    await db.close()
  })
})
