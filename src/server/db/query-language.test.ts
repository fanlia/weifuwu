/**
 * Query Language — 结构化查询对象双后端测试
 *
 * 覆盖矩阵（业务事务性查询全覆盖）：
 *   SELECT（投影/DISTINCT/WHERE 全操作符/AND OR/JOIN/子查询 IN EXISTS/
 *           GROUP BY 聚合/ORDER BY/LIMIT OFFSET）
 *   INSERT（多行/RETURNING/ON CONFLICT）/ UPDATE / DELETE
 *   两端一致：同一 AST → 真库 SQL 编译 + 内存直执行
 *
 * W3c：文本面删净——fixture 全 AST（applySchema——协议层 = AST）
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryOrm } from '../db/memory-sql.ts'
import { createQueryBuilder } from '../db/query-builder.ts'
import { compileQuery, compileSelect, rawSql } from '../db/query.ts'
import { and, or, nowAgo } from '../db/ops.ts'
import { ProtocolError } from '../db/errors.ts'
import type { SelectQuery } from '../db/query.ts'
import { z } from '../../shared/zod.ts'

/** fixture 建表（AST 声明面——零 SQL 文本） */
function fx(mem: import('./memory-sql.ts').MemorySql, name: string, columns: Record<string, unknown>, extra: Record<string, unknown> = {}): void {
  mem.applySchema({ tables: [{ name, columns, ...extra }] })
}

describe('query language — compile (SQL 生成面)', () => {
  it('WHERE 全操作符编译为参数化 SQL', () => {
    const q: SelectQuery = {
      kind: 'select', table: 'users',
      where: { age: { gt: 18, lte: 65 }, role: { in: ['admin', 'user'] }, status: { isNull: true }, name: { like: '%a%' } },
    }
    const { sql, params } = compileSelect(q)
    assert.equal(sql, 'SELECT * FROM users WHERE age > $1 AND age <= $2 AND role IN ($3, $4) AND status IS NULL AND name LIKE $5')
    assert.deepEqual(params, [18, 65, 'admin', 'user', '%a%'])
  })

  it('OR 组 → 括号 OR', () => {
    const q: SelectQuery = { kind: 'select', table: 't', where: { or: [{ a: { eq: 1 } }, { b: { eq: 2 } }] } }
    const { sql, params } = compileSelect(q)
    assert.equal(sql, 'SELECT * FROM t WHERE (a = $1 OR b = $2)')
  })

  it('JOIN + ORDER BY + LIMIT', () => {
    const q: SelectQuery = {
      kind: 'select', table: 'orders o', alias: undefined,
      joins: [{ table: 'users u', type: 'inner', on: { 'u.id': { ne: 0 } } }],
      where: { 'o.status': { eq: 'paid' } },
      orderBy: [{ col: 'o.created_at', dir: 'desc' }],
      limit: 10, offset: 20,
    }
    const { sql } = compileSelect(q)
    assert.match(sql, /JOIN users u ON u\.id <> \$1/)
    assert.match(sql, /WHERE o\.status = \$2/)
    assert.match(sql, /ORDER BY o\.created_at DESC/)
    assert.match(sql, /LIMIT \$3 OFFSET \$4/)
  })

  it('EXISTS/IN 子查询', () => {
    const q: SelectQuery = {
      kind: 'select', table: 'c',
      sub: [
        { type: 'exists', query: { kind: 'select', table: 'm', cols: ['1'], where: { 'm.id': { eq: 1 } } } },
        { type: 'in', col: 'c.id', query: { kind: 'select', table: 'x', cols: ['x_id'] } },
      ],
    }
    const { sql, params } = compileSelect(q)
    assert.match(sql, /AND EXISTS \(SELECT 1 FROM m WHERE m\.id = \$1\)/)
    assert.match(sql, /AND c\.id IN \(SELECT x_id FROM x\)/)
  })

  it('GROUP BY + 聚合投影', () => {
    const q: SelectQuery = {
      kind: 'select', table: 'orders', groupBy: ['status'],
      aggregate: [{ fn: 'count', col: '*', as: 'count' }, { fn: 'sum', col: 'total', as: 'total' }],
    }
    const { sql } = compileSelect(q)
    assert.match(sql, /SELECT COUNT\(\*\) AS count, SUM\(total\) AS total FROM orders GROUP BY status/)
  })

  it('聚合-only 编译（无投影列——count 整表聚合面：SELECT , COUNT 修对）', () => {
    const q: SelectQuery = {
      kind: 'select', table: 'orders',
      aggregate: [{ fn: 'count', col: '*', as: 'total' }],
    }
    const { sql } = compileSelect(q)
    assert.equal(sql, 'SELECT COUNT(*) AS total FROM orders')
  })

  it('INSERT 多行 + RETURNING + ON CONFLICT', () => {
    const { sql, params } = compileQuery({
      kind: 'insert', table: 'users', rows: [{ email: 'a@b.c' }, { email: 'c@d.e' }],
      returning: ['id', 'email'], onConflict: { col: 'email', update: true },
    })
    assert.equal(sql, 'INSERT INTO users (email) VALUES ($1), ($2) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id, email')
  })

  it('UPDATE/DELETE 编译', () => {
    const up = compileQuery({ kind: 'update', table: 'users', sets: { name: 'x' }, where: { id: { eq: 1 } } })
    assert.equal(up.sql, 'UPDATE users SET name = $1 WHERE id = $2')
    const del = compileQuery({ kind: 'delete', table: 'users', where: { id: { eq: 1 } } })
    assert.equal(del.sql, 'DELETE FROM users WHERE id = $1')
  })
})

describe('query language — memory 执行面', () => {
  const { orm: sql, mem } = createMemoryOrm()
  before(async () => {
    fx(mem, 'users', {
      id: z.string().meta({ pk: true, default: 'random' }),
      email: z.string().meta({ unique: true }),
      name: z.string(), age: z.number().int(), role: z.string(), status: z.string(), score: z.number(),
    }, { columnTypes: { id: 'UUID', age: 'INT', score: 'NUMERIC' } })
    await sql.query.insert('users').rows([
      { email: 'a@b.c', name: 'alice', age: 30, role: 'admin', status: 'active', score: 90 },
      { email: 'c@d.e', name: 'bob', age: 25, role: 'user', status: 'active', score: 70 },
      { email: 'f@g.h', name: 'carol', age: 40, role: 'user', status: 'inactive', score: 85 },
    ]).run()
  })

  it('INSERT + RETURNING *', async () => {
    const rows = await sql.query.insert('t1').values({ a: 1 }).returning('*').run()
    assert.equal(rows.length, 1)
    assert.equal(rows[0].a, 1)
  })

  it('SELECT WHERE 全操作符（内存判定）', async () => {
    const adults = await sql.query.from('users').where({ age: { gt: 26 } }).run()
    assert.equal(adults.length, 2)

    const inRoles = await sql.query.from('users').where({ role: { in: ['admin'] } }).run()
    assert.equal(inRoles.length, 1)
    assert.equal(inRoles[0].email, 'a@b.c')

    const isNull = await sql.query.from('users').where({ score: { isNull: true } }).run()
    assert.equal(isNull.length, 0)
  })

  it('投影 + ORDER BY + LIMIT/OFFSET', async () => {
    const top = await sql.query.from('users').select('email', 'score').orderBy('score', 'desc').limit(2).run()
    assert.deepEqual(top.map((r) => r.email), ['a@b.c', 'f@g.h'])
    assert.ok(!('age' in top[0]), '投影只含指定列')
  })

  it('DISTINCT + 聚合 COUNT/SUM/AVG', async () => {
    const roles = await sql.query.from('users').distinct().select('role').run()
    assert.equal(roles.length, 2)

    const agg = await sql.query.from('users').count('*', 'count').sum('score', 'total').run()
    assert.equal(agg[0].count, 3)
    assert.equal(agg[0].total, 245)
  })

  it('GROUP BY + HAVING', async () => {
    const byRole = await sql.query.from('users').groupBy('role').count('*', 'n').having({ n: { gt: 1 } }).run()
    assert.equal(byRole.length, 1)
    assert.equal(byRole[0].role, 'user')
    assert.equal(byRole[0].n, 2)
  })

  it('JOIN（内存内连接）', async () => {
    await sql.query.insert('orders').rows([
      { id: 'o1', user_id: 'a@b.c', total: 100 },
      { id: 'o2', user_id: 'c@d.e', total: 50 },
    ]).run()
    const rows = await sql.query.from('orders o')
      .join('users u', { 'u.email': { col: 'o.user_id' } })
      .where({ 'u.age': { gt: 26 } })
      .select('o.id', 'u.name')
      .run()
    assert.equal(rows.length, 1)
    assert.equal(rows[0].name, 'alice')
    assert.equal(rows[0].id, 'o1')
  })

  it('IN/EXISTS 子查询（内存执行）', async () => {
    const inQ = await sql.query.from('users').in('email', { kind: 'select', table: 'orders', cols: ['user_id'] } as SelectQuery).run()
    assert.equal(inQ.length, 2)

    // EXISTS（无关联条件）= 子查询非空则恒真——orders 有数据 → 全部行
    const existsQ = await sql.query.from('users').exists({ kind: 'select', table: 'orders', cols: ['1'], where: { user_id: { eq: 'a@b.c' } } } as SelectQuery).run()
    assert.equal(existsQ.length, 3, 'EXISTS 恒真（子查询非空）')
    const existsNone = await sql.query.from('users').exists({ kind: 'select', table: 'orders', cols: ['1'], where: { user_id: { eq: 'no-such' } } } as SelectQuery).run()
    assert.equal(existsNone.length, 0, 'EXISTS 恒假（子查询空）')
  })

  it('UPDATE + RETURNING', async () => {
    const rows = await sql.query.update('users').set({ score: 95 }).where({ email: { eq: 'a@b.c' } }).returning('score').run()
    assert.equal(rows[0].score, 95)
  })

  it('DELETE + RETURNING + affectedRows', async () => {
    // 状态机（W3）：DELETE 未注册表 = 42P01（对齐真库——不再静默建空表）——先建表（insert 直建 observed）
    await sql.query.insert('t2').values({ a: 2 }).run()
    const res = await sql.query.delete('t2').where({ a: { eq: 2 } }).returning('a').run()
    assert.equal(res.length, 1)
    assert.equal(res[0].a, 2)
  })

  it('唯一约束 23505 → HttpError 409（query 路径同字符串路径）', async () => {
    await assert.rejects(
      () => sql.query.insert('users').values({ email: 'a@b.c' }).run(),
      (e: Error) => (e as { status?: number }).status === 409,
    )
  })

  it('关联 EXISTS 子查询（外层列引用——messager direct 会话查重模式）', async () => {
    // 模拟会话/成员：c1 含 alice+bob（2 成员），c2 含 alice+dave
    await sql.query.insert('convs').rows([
      { id: 'c1', type: 'direct' }, { id: 'c2', type: 'direct' },
    ]).run()
    await sql.query.insert('mems').rows([
      { conversation_id: 'c1', user_id: 'alice' }, { conversation_id: 'c1', user_id: 'bob' },
      { conversation_id: 'c2', user_id: 'alice' }, { conversation_id: 'c2', user_id: 'dave' },
    ]).run()
    // alice+bob 的共同 direct 会话：c1（两成员）
    const found = await sql.query.from('convs c')
      .where({ 'c.type': { eq: 'direct' } })
      .exists({ kind: 'select', table: 'mems', alias: 'm', cols: ['1'], where: { 'm.conversation_id': { col: 'c.id' }, 'm.user_id': { eq: 'alice' } } } as SelectQuery)
      .exists({ kind: 'select', table: 'mems', alias: 'm', cols: ['1'], where: { 'm.conversation_id': { col: 'c.id' }, 'm.user_id': { eq: 'bob' } } } as SelectQuery)
      .in('c.id', { kind: 'select', table: 'mems', alias: 'm', cols: ['conversation_id'], groupBy: ['conversation_id'], having: { 'count(*)': 2 } } as SelectQuery)
      .run()
    assert.equal(found.length, 1)
    assert.equal(found[0].id, 'c1', '仅共同会话且恰 2 成员')
  })

  it('结构化时间窗（nowAgo——7 天窗口）坏语法防护不再需要 raw 面', async () => {
    // W3a：whereRaw 已删——窗口条件全算子（nowAgo——DATE_TRUNC/NOW 表达式算子化）
    await sql.query.insert('users').rows([
      { email: 'recent', name: 'r', age: 20, role: 'user', status: 'active', score: 1, created_at: new Date().toISOString() },
      { email: 'old', name: 'o', age: 20, role: 'user', status: 'active', score: 1, created_at: new Date(Date.now() - 10 * 86400 * 1000).toISOString() },
    ]).run()
    const rows = await sql.query.from('users').where({ created_at: { gt: nowAgo(7, 'day') } }).run()
    assert.ok(rows.some((r) => r.email === 'recent'), '7 天窗口内行命中')
    assert.ok(!rows.some((r) => r.email === 'old'), '窗口外行排除')
  })

  it('查询面与内存执行一致（同表同条件）', async () => {
    const viaQuery = await sql.query.from('users').where({ age: { gt: 26 } }).select('email').run()
    assert.deepEqual(viaQuery.map((r) => r.email).sort(), ['a@b.c', 'f@g.h'])
  })
})

describe('query language — where 合并与 eq（DB-FIX-PLAN W2 防线）', () => {
  let sql: ReturnType<typeof createMemoryOrm>['orm']
  let mem: Parameters<typeof fx>[0]

  before(async () => {
    const shared = createMemoryOrm()
    sql = shared.orm
    mem = shared.mem as never
    fx(mem, 'ages', { age: z.number().int() })
    for (const a of [10, 20, 25, 30, 40]) await sql.query.insert('ages').values({ age: a }).run()
  })

  it('builder 链式 where 同列对象级合并——AND 语义不覆盖（修复前 [10,20,30]）', async () => {
    const rows = await sql.query.from('ages').where({ age: { gt: 15 } }).where({ age: { lt: 35 } }).run()
    assert.deepEqual(rows.map((r) => r.age), [20, 25, 30])
  })

  it('builder scalar × ops 合并 → eq（内存执行双端认识 eq）', async () => {
    const rows = await sql.query.from('ages').where({ age: { eq: 25 } }).where({ age: { lt: 30 } }).run()
    assert.deepEqual(rows.map((r) => r.age), [25])
  })

  it('同列双条件 → and 包装（恒假语义显式——不静默丢条件）', async () => {
    const rows = await sql.query.from('ages').where({ age: { eq: 25 } }).where({ age: { eq: 30 } }).run()
    assert.deepEqual(rows, [], '25 AND 30 恒假——应空集')
  })

  it('AST 手建 → compileSelect：eq 编译进 SQL（真库路径不丢条件）', () => {
    const ast: SelectQuery = {
      kind: 'select', table: 'ages',
      where: { or: [{ age: { gt: 15 } }, { age: { eq: 25 } }] },
    }
    const { sql: sqlText, params } = compileSelect(ast)
    assert.match(sqlText, /age > \$1/)
    assert.match(sqlText, /age = \$2/)
    assert.deepEqual(params, [15, 25])
  })

  it('compileSelect：and 组编译（or 组冲突包装）', () => {
    const q: SelectQuery = {
      kind: 'select', table: 't',
      where: { or: [{ a: { eq: 1 } }, { b: { eq: 2 } }], and: [{ or: [{ c: { eq: 3 } }, { d: { eq: 4 } }] }] },
    }
    const { sql: sqlText } = compileSelect(q)
    assert.match(sqlText, /\(a = \$1 OR b = \$2\)/)
    assert.match(sqlText, /\(c = \$3 OR d = \$4\)/)
  })

  it('builder or 组冲突 → and 包装（(A OR B) AND (C OR D) 不平铺——内存执行）', async () => {
    fx(mem, 'flags', { a: z.number().int(), b: z.number().int(), c: z.number().int(), d: z.number().int() })
    await sql.query.insert('flags').values({ a: 1, b: 0, c: 1, d: 0 }).run() // A 命中 C 不中——AND 后应空
    await sql.query.insert('flags').values({ a: 1, b: 0, c: 0, d: 0 }).run() // A 命中 C/D 均不中——空
    await sql.query.insert('flags').values({ a: 0, b: 0, c: 1, d: 0 }).run() // A/B 不中——空
    const rows = await sql.query.from('flags')
      .where({ or: [{ a: { eq: 1 } }, { b: { eq: 1 } }] })
      .where({ or: [{ c: { eq: 1 } }, { d: { eq: 1 } }] })
      .run()
    assert.equal(rows.length, 1, '(a=1 OR b=1) AND (c=1 OR d=1)——仅第一行')
    assert.equal(rows[0].a, 1)
  })

  it('多次 where 追加不再覆盖（双条件并存——AND 合并）', async () => {
    // W3a：whereRaw 删除后同语义契约保留——where() 链式 AND 合并（spy 捕获 AST）
    let captured: SelectQuery | null = null
    const qb = createQueryBuilder((q) => {
      captured = q as SelectQuery
      return Promise.resolve([])
    })
    await qb.from('evts')
      .where({ created_at: { gt: '2025-01-01' as never } })
      .where({ deleted_at: { isNull: true } })
      .run()
    const compiled = compileSelect(captured!)
    assert.match(compiled.sql, /created_at > /)
    assert.match(compiled.sql, /deleted_at IS NULL/)
  })
})

// ── E3 类型/样板收敛契约（and/or 空对象过滤·set 收 RawSql）────────

describe('query language — E3 条件安全组合与 RawSql 面', () => {
  it('and(a, {}) 等价 a（空条件被滤——`q ? {...} : {}` 样板零 as never）', async () => {
    const { orm: sql, mem } = createMemoryOrm()
    fx(mem, 'c1', { id: z.number().int(), tag: z.string() })
    await sql.query.insert('c1').values({ id: 1, tag: 'x' }).run()
    await sql.query.insert('c1').values({ id: 2, tag: 'y' }).run()
    const expr = and({}, { tag: { eq: 'x' } })
    const rows = await sql.query.from('c1').where(expr).run()
    assert.deepEqual(rows.map((r) => r.id), [1], '空对象被滤——仅 tag=x')
  })

  it('and()/or() 全空 → {}（恒真——不炸不覆盖）', () => {
    assert.deepEqual(and({}, {}), {})
    assert.deepEqual(or({}, {}), {})
  })

  it('set 值接受 RawSql（类型面——编译通过即真）', () => {
    // 编译期断言：RawSql 直接赋值（无需 as never）
    const s2 = createMemoryOrm().orm
    const b = s2.query.update('c1').set({ tag: rawSql("'x'") })
    assert.ok(b, 'set RawSql 类型面可编译')
  })
})
