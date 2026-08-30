/**
 * 内存引擎语义对齐契约测试（DB-FIX-PLAN W3 防线——真库语义反向校准）
 *
 * 锁定（每项 = 修复前实测复现 → 修复后翻转）：
 * - sadd 返回新增数（已存在成员不计——真库 SADD）
 * - publish 返回匹配接收数（非订阅者总数）
 * - incr/incrby 非整数显式报错（真库 -ERR——不静默置 1）
 * - setnx 原子性（并发恰一个成功——分布式锁语义）
 * - 快照还原复活事务内 DROP 的表（rows + 元数据）
 * - UPDATE 唯一约束校验（真库 23505 → 409）
 * - LIKE/ILIKE 全锚定（% 前缀/后缀/包含语义区分；_ 单字符）
 * - INSERT affectedRows = 实际插入数（onConflict 跳过行不计）
 * - XGROUP CREATE '$' 起始游标（只投新）
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { MemoryRedis } from './memory-redis.ts'
import { MemorySql, createMemorySql } from './memory-sql.ts'
import { ProtocolError } from './errors.ts'
import { HttpError } from '../types.ts'

describe('MemoryRedis — set 语义（真库对齐）', () => {
  it('sadd 返回新增数：已存在成员不计（修复前返回 3）', async () => {
    const r = new MemoryRedis()
    assert.equal(await r.sadd('k', 'a', 'b'), 2)
    assert.equal(await r.sadd('k', 'a', 'b', 'c'), 1)
    assert.equal(await r.sadd('k', 'a'), 0)
    assert.deepEqual(await r.smembers('k'), ['a', 'b', 'c'])
  })

  it('publish 返回匹配接收数：无匹配频道 → 0（修复前返回订阅者总数 1）', async () => {
    const r = new MemoryRedis()
    const sub = r.createSubscriber()
    await sub.connect()
    const received: string[] = []
    await sub.subscribe('chan-a', (_ch, msg) => received.push(msg))
    assert.equal(await r.publish('chan-b', 'x'), 0) // 无匹配
    assert.equal(await r.publish('chan-a', 'y'), 1) // 命中
    assert.deepEqual(received, ['y'])
    await sub.close()
  })

  it('incr/incrby 非整数值显式报错（修复前静默置 1/NaN 传播）', async () => {
    const r = new MemoryRedis()
    await r.set('k', 'abc')
    await assert.rejects(() => r.incr('k'), (e: Error) => {
      assert.ok(e instanceof ProtocolError)
      assert.match(e.message, /not an integer/)
      return true
    })
    await assert.rejects(() => r.incrby('k', 1), /not an integer/)
    // 合法路径不受影响
    assert.equal(await r.incr('fresh'), 1)
    assert.equal(await r.incr('fresh'), 2)
    assert.equal(await r.incrby('fresh', 10), 12)
  })

  it('setnx 原子性：并发恰一个成功（修复前 await 间隙双成功）', async () => {
    const r = new MemoryRedis()
    const results = await Promise.all(Array.from({ length: 10 }, () => r.setnx('lock', 'x')))
    assert.equal(results.filter((n) => n === 1).length, 1, `并发 setnx 应恰一个成功，实际 ${results}`)
    assert.equal(await r.get('lock'), 'x')
  })

  it('setnx 过期 key 视为不存在（惰性过期）', async () => {
    const r = new MemoryRedis()
    await r.set('k', 'old', 0.05) // 0.05s TTL
    await new Promise((res) => setTimeout(res, 80))
    assert.equal(await r.setnx('k', 'new'), 1)
    assert.equal(await r.get('k'), 'new')
  })
})

describe('MemorySql — 快照/约束/投影（真库对齐）', () => {
  it('快照还原复活事务内 DROP 的表（修复前表与数据永久丢失）', async () => {
    const mem = new MemorySql()
    await mem.unsafe('CREATE TABLE t (id int)')
    await mem.unsafe('INSERT INTO t (id) VALUES ($1)', [1])
    const snap = mem.snapshot()
    await mem.unsafe('DROP TABLE t')
    assert.equal(mem.hasTable('t'), false)
    mem.restore(snap)
    // 复活：表存在 + 数据完整
    assert.equal(mem.hasTable('t'), true)
    assert.deepEqual(await mem.unsafe('SELECT id FROM t'), [{ id: 1 }])
  })

  it('快照还原清空事务内新建的表', async () => {
    const mem = new MemorySql()
    const snap = mem.snapshot()
    await mem.unsafe('CREATE TABLE tmp (id int)')
    assert.equal(mem.hasTable('tmp'), true)
    mem.restore(snap)
    assert.equal(mem.hasTable('tmp'), false)
  })

  it('UPDATE 撞 UNIQUE → 409（修复前静默重复）', async () => {
    const sql = createMemorySql()
    await sql.unsafe('CREATE TABLE u (id int, email text UNIQUE)')
    await sql.unsafe('INSERT INTO u (id, email) VALUES ($1, $2)', [1, 'a@x.c'])
    await sql.unsafe('INSERT INTO u (id, email) VALUES ($1, $2)', [2, 'b@x.c'])
    await assert.rejects(
      () => sql.unsafe('UPDATE u SET email = $1 WHERE id = $2', ['a@x.c', 2]),
      (e: Error) => {
        assert.ok(e instanceof HttpError)
        assert.equal(e.status, 409)
        return true
      },
    )
    // 无冲突更新不受影响
    await sql.unsafe('UPDATE u SET email = $1 WHERE id = $2', ['c@x.c', 2])
    assert.deepEqual(await sql.unsafe('SELECT email FROM u WHERE id = 2'), [{ email: 'c@x.c' }])
  })

  it('UPDATE 唯一约束按更新后状态校验（自身同值更新不误报）', async () => {
    const sql = createMemorySql()
    await sql.unsafe('CREATE TABLE u (id int, slot text UNIQUE)')
    await sql.unsafe("INSERT INTO u (id, slot) VALUES (1, 'a')")
    await sql.unsafe("INSERT INTO u (id, slot) VALUES (2, 'b')")
    // 自身同值更新：排除自身行——不误报冲突
    await sql.unsafe("UPDATE u SET slot = 'a' WHERE id = 1")
    assert.deepEqual(await sql.unsafe('SELECT slot FROM u WHERE id = 1'), [{ slot: 'a' }])
    // 更新到他人值：冲突
    await assert.rejects(() => sql.unsafe("UPDATE u SET slot = 'b' WHERE id = 1"), /duplicate/)
  })

  it('LIKE 全锚定：前缀/后缀/单字符语义（修复前退化为 includes）', async () => {
    const sql = createMemorySql()
    await sql.unsafe('CREATE TABLE p (name text)')
    await sql.unsafe('INSERT INTO p (name) VALUES ($1)', ['xbx'])
    await sql.unsafe('INSERT INTO p (name) VALUES ($1)', ['bx'])
    assert.deepEqual(await sql.unsafe('SELECT name FROM p WHERE name LIKE $1', ['b%']), [{ name: 'bx' }]) // 前缀
    assert.deepEqual(await sql.unsafe('SELECT name FROM p WHERE name LIKE $1', ['x%']), [{ name: 'xbx' }])
    assert.deepEqual(await sql.unsafe('SELECT name FROM p WHERE name LIKE $1', ['%b%']), [{ name: 'xbx' }, { name: 'bx' }])
    assert.deepEqual(await sql.unsafe('SELECT name FROM p WHERE name LIKE $1', ['_bx']), [{ name: 'xbx' }]) // 单字符
    assert.deepEqual(await sql.unsafe('SELECT name FROM p WHERE name LIKE $1', ['x']), []) // 全等才匹配
  })

  it('ILIKE 大小写不敏感', async () => {
    const sql = createMemorySql()
    await sql.unsafe('CREATE TABLE p (name text)')
    await sql.unsafe('INSERT INTO p (name) VALUES ($1)', ['Hello'])
    assert.deepEqual(await sql.unsafe('SELECT name FROM p WHERE name ILIKE $1', ['he%']), [{ name: 'Hello' }])
    assert.deepEqual(await sql.unsafe('SELECT name FROM p WHERE name LIKE $1', ['he%']), [])
  })

  it('INSERT affectedRows = 实际插入数（onConflict 跳过行不计）', () => {
    const mem = new MemorySql()
    mem.executeQuery({ kind: 'ddl', op: 'createTable', table: 'i', columns: [{ name: 'email', type: 'text', pk: false, unique: true, defaultNow: false, defaultUuid: false }] })
    mem.executeQuery({ kind: 'insert', table: 'i', rows: [{ email: 'a@x.c' }] })
    const r = mem.executeQuery({
      kind: 'insert', table: 'i',
      rows: [{ email: 'a@x.c' }, { email: 'b@x.c' }], // 第一行冲突跳过
      onConflict: {},
    })
    assert.equal(r.affectedRows, 1)
  })
})

describe('MemoryRedis — stream 消费组（真库对齐）', () => {
  it("XGROUP CREATE '$' 起始游标：只投新 entry（修复前恒 0 从首条投递）", async () => {
    const r = new MemoryRedis()
    await r.command('XADD', 's', '*', 'f', 'v1')
    await r.command('XADD', 's', '*', 'f', 'v2')
    await r.command('XGROUP', 'CREATE', 's', 'g', '$')
    // 历史不投递
    assert.equal(await r.command('XREADGROUP', 'GROUP', 'g', 'c', 'STREAMS', 's', '>'), null)
    // 新 entry 投递
    await r.command('XADD', 's', '*', 'f', 'v3')
    const batch = await r.command('XREADGROUP', 'GROUP', 'g', 'c', 'STREAMS', 's', '>')
    assert.ok(Array.isArray(batch))
    const entries = (batch as unknown[][])[0][1] as unknown[][]
    assert.equal(entries.length, 1)
    assert.deepEqual(entries[0][1], ['f', 'v3'])
  })

  it("XGROUP CREATE '0' 从首条投递（原语义保持）", async () => {
    const r = new MemoryRedis()
    await r.command('XADD', 's', '*', 'f', 'v1')
    await r.command('XGROUP', 'CREATE', 's', 'g', '0')
    const batch = await r.command('XREADGROUP', 'GROUP', 'g', 'c', 'STREAMS', 's', '>')
    assert.ok(Array.isArray(batch))
    assert.equal(((batch as unknown[][])[0][1] as unknown[]).length, 1)
  })
})
