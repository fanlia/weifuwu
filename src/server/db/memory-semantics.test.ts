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
import { MemorySql, createMemoryOrm } from './memory-sql.ts'
import * as ops from './ops.ts'
import { compileQuery } from './query.ts'
import { and } from './ops.ts'
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
    const { orm: sql, mem } = createMemoryOrm()
    await mem.unsafe('CREATE TABLE u (id int, email text UNIQUE)')
    await mem.unsafe('INSERT INTO u (id, email) VALUES ($1, $2)', [1, 'a@x.c'])
    await mem.unsafe('INSERT INTO u (id, email) VALUES ($1, $2)', [2, 'b@x.c'])
    await assert.rejects(
      () => mem.unsafe('UPDATE u SET email = $1 WHERE id = $2', ['a@x.c', 2]),
      (e: Error) => {
        assert.ok(e instanceof HttpError)
        assert.equal(e.status, 409)
        return true
      },
    )
    // 无冲突更新不受影响
    await mem.unsafe('UPDATE u SET email = $1 WHERE id = $2', ['c@x.c', 2])
    assert.deepEqual(await mem.unsafe('SELECT email FROM u WHERE id = 2'), [{ email: 'c@x.c' }])
  })

  it('UPDATE 唯一约束按更新后状态校验（自身同值更新不误报）', async () => {
    const { orm: sql, mem } = createMemoryOrm()
    await mem.unsafe('CREATE TABLE u (id int, slot text UNIQUE)')
    await mem.unsafe("INSERT INTO u (id, slot) VALUES (1, 'a')")
    await mem.unsafe("INSERT INTO u (id, slot) VALUES (2, 'b')")
    // 自身同值更新：排除自身行——不误报冲突
    await mem.unsafe("UPDATE u SET slot = 'a' WHERE id = 1")
    assert.deepEqual(await mem.unsafe('SELECT slot FROM u WHERE id = 1'), [{ slot: 'a' }])
    // 更新到他人值：冲突
    await assert.rejects(() => mem.unsafe("UPDATE u SET slot = 'b' WHERE id = 1"), /duplicate/)
  })

  it('LIKE 全锚定：前缀/后缀/单字符语义（修复前退化为 includes）', async () => {
    const { orm: sql, mem } = createMemoryOrm()
    await mem.unsafe('CREATE TABLE p (name text)')
    await mem.unsafe('INSERT INTO p (name) VALUES ($1)', ['xbx'])
    await mem.unsafe('INSERT INTO p (name) VALUES ($1)', ['bx'])
    assert.deepEqual(await mem.unsafe('SELECT name FROM p WHERE name LIKE $1', ['b%']), [{ name: 'bx' }]) // 前缀
    assert.deepEqual(await mem.unsafe('SELECT name FROM p WHERE name LIKE $1', ['x%']), [{ name: 'xbx' }])
    assert.deepEqual(await mem.unsafe('SELECT name FROM p WHERE name LIKE $1', ['%b%']), [{ name: 'xbx' }, { name: 'bx' }])
    assert.deepEqual(await mem.unsafe('SELECT name FROM p WHERE name LIKE $1', ['_bx']), [{ name: 'xbx' }]) // 单字符
    assert.deepEqual(await mem.unsafe('SELECT name FROM p WHERE name LIKE $1', ['x']), []) // 全等才匹配
  })

  it('ILIKE 大小写不敏感', async () => {
    const { orm: sql, mem } = createMemoryOrm()
    await mem.unsafe('CREATE TABLE p (name text)')
    await mem.unsafe('INSERT INTO p (name) VALUES ($1)', ['Hello'])
    assert.deepEqual(await mem.unsafe('SELECT name FROM p WHERE name ILIKE $1', ['he%']), [{ name: 'Hello' }])
    assert.deepEqual(await mem.unsafe('SELECT name FROM p WHERE name LIKE $1', ['he%']), [])
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

  it('nullable UNIQUE 列：多 NULL 行允许（对齐真库 PG——M9 direct_key 语义）；非 NULL 重复仍 409', () => {
    const mem = new MemorySql()
    mem.executeQuery({ kind: 'ddl', op: 'createTable', table: 'c', columns: [{ name: 'id', type: 'text', pk: true, unique: false, defaultNow: false, defaultUuid: false }, { name: 'type', type: 'text', pk: false, unique: false, defaultNow: false, defaultUuid: false }, { name: 'direct_key', type: 'text', pk: false, unique: true, defaultNow: false, defaultUuid: false }] })
    // group 行 direct_key = NULL——多行不冲突
    mem.executeQuery({ kind: 'insert', table: 'c', rows: [{ id: 'g1', type: 'group', direct_key: null }] })
    mem.executeQuery({ kind: 'insert', table: 'c', rows: [{ id: 'g2', type: 'group', direct_key: null }] })
    // direct 行非 NULL——重复 409
    mem.executeQuery({ kind: 'insert', table: 'c', rows: [{ id: 'd1', type: 'direct', direct_key: 'a:b' }] })
    assert.throws(
      () => mem.executeQuery({ kind: 'insert', table: 'c', rows: [{ id: 'd2', type: 'direct', direct_key: 'a:b' }] }),
      (e: any) => e.status === 409,
      '非 NULL 重复必须 409（唯一约束生效）',
    )
    // onConflict DO NOTHING：非 NULL 冲突跳过
    const r = mem.executeQuery({ kind: 'insert', table: 'c', rows: [{ id: 'd3', type: 'direct', direct_key: 'a:b' }], onConflict: {} })
    assert.equal(r.affectedRows, 0)
    // UPDATE 置 NULL：可更新到 NULL（不与既有 NULL 冲突）
    mem.executeQuery({ kind: 'update', table: 'c', sets: { direct_key: null }, where: { id: { eq: 'd1' } } })
  })

  it('onConflict DO UPDATE：冲突行非冲突列被更新·returning 读更新后行（D1）', () => {
    const mem = new MemorySql()
    mem.executeQuery({ kind: 'ddl', op: 'createTable', table: 'u', columns: [
      { name: 'id', type: 'text', pk: false, unique: false, defaultNow: false, defaultUuid: false },
      { name: 'key', type: 'text', pk: false, unique: true, defaultNow: false, defaultUuid: false },
      { name: 'val', type: 'text', pk: false, unique: false, defaultNow: false, defaultUuid: false },
    ] })
    mem.executeQuery({ kind: 'insert', table: 'u', rows: [{ id: 'r1', key: 'k', val: 'old' }] })
    // 冲突（key 唯一）→ DO UPDATE：非冲突列 ← 新行值（compile 同语义——含显式 id 列）·行数不变
    const r = mem.executeQuery({ kind: 'insert', table: 'u', rows: [{ id: 'r2', key: 'k', val: 'new' }], onConflict: { col: 'key', update: true }, returning: '*' })
    assert.equal(r.affectedRows, 1) // PG CommandComplete：更新行计入
    assert.deepEqual(r[0], { id: 'r2', key: 'k', val: 'new' }) // 冲突目标列密钥保留·其余列更新
    const all = mem.executeQuery({ kind: 'select', table: 'u' })
    assert.equal(all.length, 1) // 未插入新行
    assert.equal(all[0].val, 'new')
    assert.equal(all[0].key, 'k')
    // 有目标列 DO NOTHING：仍是跳过（不回归）
    const r2 = mem.executeQuery({ kind: 'insert', table: 'u', rows: [{ id: 'r3', key: 'k', val: 'x' }], onConflict: { col: 'key' } })
    assert.equal(r2.affectedRows, 0)
    assert.equal(mem.executeQuery({ kind: 'select', table: 'u' }).length, 1)
  })
})

describe('MemorySql — E2 函数/raw where（DATE_TRUNC·whereRaw 真值）', () => {
  it('DATE_TRUNC(month, NOW()) 月份窗口——月初边届两个月样本', async () => {
    const { orm: sql, mem } = createMemoryOrm()
    await mem.unsafe('CREATE TABLE w (id int, created_at text)')
    const now = new Date()
    // 月初首日 00:00:00。000 毫秒（UTC）
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    await mem.unsafe('INSERT INTO w (id, created_at) VALUES ($1, $2)', [1, now.toISOString()])
    await mem.unsafe('INSERT INTO w (id, created_at) VALUES ($1, $2)', [2, new Date(monthStart.getTime() - 1).toISOString()]) // 上月末最后一毫秒——窗口外
    await mem.unsafe('INSERT INTO w (id, created_at) VALUES ($1, $2)', [3, new Date(monthStart.getTime() + 1000).toISOString()]) // 月初 1 秒——窗口内
    const rows = await sql.query.from('w').whereRaw("created_at >= DATE_TRUNC('month', NOW())").run()
    assert.deepEqual(rows.map((r) => r.id), [1, 3], '窗口边界：月初首日 0 点整（含）起——上月末排除')
  })

  it('whereRaw 参数化 + 与结构化 where 合并（quota 形状：$1 + 日期窗口）', async () => {
    const { orm: sql, mem } = createMemoryOrm()
    await mem.unsafe('CREATE TABLE t2 (id text, app_id text, used int)')
    await mem.unsafe('INSERT INTO t2 (id, app_id, used) VALUES ($1, $2, $3)', ['a', 'app1', 100])
    await mem.unsafe('INSERT INTO t2 (id, app_id, used) VALUES ($1, $2, $3)', ['b', 'app2', 200])
    const [row] = await sql.query.from('t2')
      .sum('used', 'total')
      .where({ app_id: { eq: 'app1' } })
      .whereRaw('id = $1', ['a'])
      .run()
    assert.equal(row.total, 100, 'raw where 参数化 + 结构化合并（AND 语义）')
  })

  it('坏 raw where 仍抛 ProtocolError（不静默降级）', async () => {
    const { orm: sql, mem } = createMemoryOrm()
    await mem.unsafe('CREATE TABLE t3 (id int)')
    await assert.rejects(
      () => sql.query.from('t3').whereRaw('bad syntax ((').run(),
      (e: unknown) => e instanceof ProtocolError,
      '解析失败必须抛（诚实裁剪）',
    )
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

describe('算子收口（E 系列）— merge 表达式 + vectorScore', () => {
  it('mergeAppend/mergeInc/mergeNow：upsert 冲突行表达式更新（真库 compile 语义对齐）', async () => {
    const { orm, mem } = createMemoryOrm()
    await mem.unsafe('CREATE TABLE rs (message_id text UNIQUE, steps jsonb, hits int, status text, updated_at timestamptz)')
    // 首次插入
    await orm.query.insert('rs').values({ message_id: 'm1', steps: [{ tool: 'a' }], hits: 0, status: 'running' }).run()
    // 冲突 upsert：steps 追加 / hits 自增 / status 覆盖 / updated_at now
    await orm.query.insert('rs').values({ message_id: 'm1', steps: [{ tool: 'b' }], hits: 0, status: 'running' })
      .onConflict('message_id', true, {
        steps: ops.mergeAppend([{ tool: 'b' }]),
        hits: ops.mergeInc(1),
        status: 'running',
        updated_at: ops.mergeNow(),
      }).run()
    const rows = await orm.query.from('rs').select('steps', 'hits', 'status', 'updated_at').run()
    assert.equal(rows.length, 1)
    assert.deepEqual(rows[0].steps, [{ tool: 'a' }, { tool: 'b' }])
    assert.equal(rows[0].hits, 1)
    assert.notEqual(rows[0].updated_at, null)
  })

  it('mergeInc/mergeNow：UPDATE 表达式（hits = hits+1 语义）', async () => {
    const { orm, mem } = createMemoryOrm()
    await mem.unsafe('CREATE TABLE ac (app_id text, question text, hits int)')
    await orm.query.insert('ac').values({ app_id: 'a1', question: 'q1', hits: 3 }).run()
    await orm.query.update('ac').set({ hits: ops.mergeInc(1), updated_at: ops.mergeNow() })
      .where({ app_id: { eq: 'a1' }, question: { eq: 'q1' } }).run()
    const [r] = await orm.query.from('ac').run()
    assert.equal((r as any).hits, 4)
    assert.notEqual((r as any).updated_at, undefined)
  })

  it('vectorScore：相似度投影 + 余弦降序（pgvector <=> 等价面）', async () => {
    const { orm, mem } = createMemoryOrm()
    await mem.unsafe('CREATE TABLE kb (id text, agent_id text, content text, embedding jsonb)')
    await orm.query.insert('kb').values({ id: 'x', agent_id: 'a1', content: 'near', embedding: [1, 0] })
      .values({ id: 'y', agent_id: 'a1', content: 'far', embedding: [0, 1] })
      .values({ id: 'z', agent_id: 'a2', content: 'other', embedding: [1, 0] }).run()
    const rows = await orm.query.from('kb').select('id', 'content')
      .vectorScore('embedding', [1, 0], 'similarity')
      .where({ agent_id: { eq: 'a1' } })
      .run()
    assert.equal(rows.length, 2)
    assert.equal(rows[0].id, 'x') // 最相似在前
    assert.equal(rows[1].id, 'y')
    assert.ok(Number((rows[0] as any).similarity) > Number((rows[1] as any).similarity))
    // 投影键 = as 名
    assert.ok('similarity' in rows[0])
  })
})

describe('raw 取消（2027-xx）— 细算子 now/nowInterval/colRef 的 memory 语义', () => {
  it('ops.now()：SET 时间戳（compile → NOW()；memory → ISO）', async () => {
    const { orm, mem } = createMemoryOrm()
    await mem.unsafe('CREATE TABLE t (id text, updated_at timestamptz)')
    await orm.query.insert('t').values({ id: 'a', updated_at: ops.now() }).run()
    const [r] = await orm.query.from('t').run()
    assert.ok(String((r as any).updated_at).length > 0)
    // 编译面：SET updated_at = NOW()
    const sql = compileQuery({ kind: 'update', table: 't', sets: { updated_at: ops.now() }, where: { id: { eq: 'a' } } })
    assert.ok(sql.sql.includes('updated_at = NOW()'), sql.sql)
  })

  it('ops.nowInterval/nowAgo：NOW() ± INTERVAL（SET 与 WHERE 两用）', async () => {
    const { orm, mem } = createMemoryOrm()
    await mem.unsafe('CREATE TABLE a (id text, app_id text, trial_ends_at timestamptz, created_at timestamptz)')
    await orm.query.insert('a').values({ id: 'a1', app_id: 'app1', trial_ends_at: ops.nowInterval(14, 'day'), created_at: ops.nowAgo(7, 'day') }).run()
    const now = Date.now()
    const [r] = await orm.query.from('a').run()
    assert.ok(Number(new Date(String((r as any).trial_ends_at))) > now + 13 * 86400_000, '未来 14 天')
    assert.ok(Number(new Date(String((r as any).created_at))) < now - 6 * 86400_000, '过去 7 天')
    // WHERE 时间窗：created_at >= NOW() - INTERVAL '10 days'（older 行命中）
    const rows = await orm.query.from('a').where({ created_at: { gte: ops.nowAgo(10, 'day') } }).run()
    assert.equal(rows.length, 1)
  })

  it('ops.colRef()：SET col = other_col（messages.content = ai_draft 语义）', async () => {
    const { orm, mem } = createMemoryOrm()
    await mem.unsafe('CREATE TABLE m (id text, content text, ai_draft text)')
    await orm.query.insert('m').values({ id: 'x', content: 'old', ai_draft: 'draft-v2' }).run()
    await orm.query.update('m').set({ content: ops.colRef('ai_draft') }).where({ id: { eq: 'x' } }).run()
    const [r] = await orm.query.from('m').run()
    assert.equal((r as any).content, 'draft-v2')
    // 编译面：SET content = ai_draft（裸列引用——无参数）
    const sql = compileQuery({ kind: 'update', table: 'm', sets: { content: ops.colRef('ai_draft') }, where: { id: { eq: 'x' } } })
    assert.ok(sql.sql.includes('content = ai_draft'), sql.sql)
    assert.equal(sql.params.length, 1) // 仅 where 参数
  })
})

describe('W1 未知列校验（两端一致——不再静默）', () => {
  it('memory：未知列 where → ProtocolError 带合法列清单', async () => {
    const { orm, mem } = createMemoryOrm()
    await mem.unsafe('CREATE TABLE t1 (id text, name text)')
    await orm.query.insert('t1').values({ id: 'a', name: 'x' }).run()
    await assert.rejects(
      () => orm.query.from('t1').where({ no_such: { eq: 1 } }).run(),
      /未知列 'no_such'——t1 合法列：id, name/,
    )
    // 合法列不误伤（别名/裸列/算子 col/表达式投影）
    const ok = await orm.query.from('t1 t')
      .where(and({ 't.id': { eq: 'a' } }, { name: { ilike: '%x%' } }))
      .select("id AS xid", 'name').run()
    assert.equal(ok.length, 1)
    // and/or 组合（合法列不误伤）
  })

  it('memory：未知列 select/orderBy/groupBy → 报错', async () => {
    const { orm, mem } = createMemoryOrm()
    await mem.unsafe('CREATE TABLE t2 (id text, name text)')
    await orm.query.insert('t2').values({ id: 'a', name: 'x' }).run()
    await assert.rejects(() => orm.query.from('t2').select('no_such').run(), /未知列 'no_such'/)
    await assert.rejects(() => orm.query.from('t2').orderBy('no_such').run(), /未知列 'no_such'/)
    await assert.rejects(() => orm.query.from('t2').groupBy('no_such').run(), /未知列 'no_such'/)
  })

  it('join 列集双侧合法（on 键 + col 值、join 表投影）', async () => {
    const { orm, mem } = createMemoryOrm()
    await mem.unsafe('CREATE TABLE a (id text, user_id text)')
    await mem.unsafe('CREATE TABLE u (id text, name text)')
    await orm.query.insert('a').values({ id: 'a1', user_id: 'u1' }).run()
    await orm.query.insert('u').values({ id: 'u1', name: '张' }).run()
    const rows = await orm.query.from('a')
      .join('u', { 'u.id': { col: 'a.user_id' } })
      .select('a.id', 'u.name').run()
    assert.equal(rows.length, 1)
    assert.equal((rows[0] as any).name, '张') // join 投影输出裸键（stripTable——平台惯例）
    // join 错误列 → 报错
    await assert.rejects(() => orm.query.from('a')
      .join('u', { 'u.no_such': { col: 'a.user_id' } }).run(), /未知列 'u.no_such'/)
  })

  it('whereRaw 不误伤（__raw 键豁免）', async () => {
    const { orm, mem } = createMemoryOrm()
    await mem.unsafe('CREATE TABLE t3 (id text)')
    await orm.query.insert('t3').values({ id: 'a' }).run()
    const rows = await orm.query.from('t3 t').where({
      __raw: { __raw: "t.id = 'a'", params: [] },
    } as never).select('*').run()
    assert.equal(rows.length, 1)
  })
})
