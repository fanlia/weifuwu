/**
 * Query Language — 结构化查询对象双后端测试
 *
 * 覆盖矩阵（业务事务性查询全覆盖 + raw 逃生）：
 *   SELECT（投影/DISTINCT/WHERE 全操作符/AND OR/JOIN/子查询 IN EXISTS/
 *           GROUP BY 聚合/ORDER BY/LIMIT OFFSET）
 *   INSERT（多行/RETURNING/ON CONFLICT）/ UPDATE / DELETE
 *   raw 逃生（真库透传——编译断言；内存裁剪 ProtocolError）
 *   两端一致：同一 AST → 真库 SQL 编译 + 内存直执行
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createMemorySql } from '../db/memory-sql.ts'
import { createQueryBuilder } from '../db/query-builder.ts'
import { compileQuery, compileSelect } from '../db/query.ts'
import { parseSqlToAst } from '../db/sql-parser.ts'
import { ProtocolError } from '../db/errors.ts'
import type { SelectQuery } from '../db/query.ts'

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
    const q: SelectQuery = { kind: 'select', table: 't', where: { or: [{ a: 1 }, { b: 2 }] } }
    const { sql, params } = compileSelect(q)
    assert.equal(sql, 'SELECT * FROM t WHERE (a = $1 OR b = $2)')
  })

  it('JOIN + ORDER BY + LIMIT', () => {
    const q: SelectQuery = {
      kind: 'select', table: 'orders o', alias: undefined,
      joins: [{ table: 'users u', type: 'inner', on: { 'u.id': { ne: 0 } } }],
      where: { 'o.status': 'paid' },
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
        { type: 'exists', query: { kind: 'select', table: 'm', cols: ['1'], where: { 'm.id': 1 } } },
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
    assert.match(sql, /SELECT \*, COUNT\(\*\) AS count, SUM\(total\) AS total FROM orders GROUP BY status/)
  })

  it('INSERT 多行 + RETURNING + ON CONFLICT', () => {
    const { sql, params } = compileQuery({
      kind: 'insert', table: 'users', rows: [{ email: 'a@b.c' }, { email: 'c@d.e' }],
      returning: ['id', 'email'], onConflict: { col: 'email', update: true },
    })
    assert.equal(sql, 'INSERT INTO users (email) VALUES ($1), ($2) ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email RETURNING id, email')
  })

  it('UPDATE/DELETE 编译', () => {
    const up = compileQuery({ kind: 'update', table: 'users', sets: { name: 'x' }, where: { id: 1 } })
    assert.equal(up.sql, 'UPDATE users SET name = $1 WHERE id = $2')
    const del = compileQuery({ kind: 'delete', table: 'users', where: { id: 1 } })
    assert.equal(del.sql, 'DELETE FROM users WHERE id = $1')
  })

  it('raw 逃生编译（参数编号重排）', () => {
    const q: SelectQuery = {
      kind: 'select', table: 't',
      where: { id: 1, createdAt: { __raw: "created_at > NOW() - interval '7 days'", params: [] } },
    }
    const { sql, params } = compileSelect(q)
    assert.match(sql, /id = \$1/)
    assert.match(sql, /created_at > NOW\(\) - interval '7 days'/)
    assert.deepEqual(params, [1])
  })
})

describe('query language — memory 执行面', () => {
  const sql = createMemorySql()
  before(async () => {
    await sql.unsafe(`CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email TEXT NOT NULL UNIQUE, name TEXT, age INT, role TEXT, status TEXT, score NUMERIC
    )`)
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
    const existsQ = await sql.query.from('users').exists({ kind: 'select', table: 'orders', cols: ['1'], where: { user_id: 'a@b.c' } } as SelectQuery).run()
    assert.equal(existsQ.length, 3, 'EXISTS 恒真（子查询非空）')
    const existsNone = await sql.query.from('users').exists({ kind: 'select', table: 'orders', cols: ['1'], where: { user_id: 'no-such' } } as SelectQuery).run()
    assert.equal(existsNone.length, 0, 'EXISTS 恒假（子查询空）')
  })

  it('UPDATE + RETURNING', async () => {
    const rows = await sql.query.update('users').set({ score: 95 }).where({ email: 'a@b.c' }).returning('score').run()
    assert.equal(rows[0].score, 95)
  })

  it('DELETE + RETURNING + affectedRows', async () => {
    const rows = await sql.query.delete('t2').where({ a: 1 }).run()
    assert.equal(rows.length, 0)
    await sql.query.insert('t2').values({ a: 2 }).run()
    const res = await sql.query.delete('t2').returning('a').run()
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
      .where({ 'c.type': 'direct' })
      .exists({ kind: 'select', table: 'mems', alias: 'm', cols: ['1'], where: { 'm.conversation_id': { col: 'c.id' }, 'm.user_id': 'alice' } } as SelectQuery)
      .exists({ kind: 'select', table: 'mems', alias: 'm', cols: ['1'], where: { 'm.conversation_id': { col: 'c.id' }, 'm.user_id': 'bob' } } as SelectQuery)
      .in('c.id', { kind: 'select', table: 'mems', alias: 'm', cols: ['conversation_id'], groupBy: ['conversation_id'], having: { 'count(*)': 2 } } as SelectQuery)
      .run()
    assert.equal(found.length, 1)
    assert.equal(found[0].id, 'c1', '仅共同会话且恰 2 成员')
  })

  it('raw 逃生：内存裁剪 ProtocolError（诚实）', async () => {
    await assert.rejects(
      () => sql.query.from('users').whereRaw("created_at > NOW() - interval '7 days'").run(),
      ProtocolError,
    )
  })

  it('与标签模板路径语义一致（同表同条件）', async () => {
    const viaQuery = await sql.query.from('users').where({ age: { gt: 26 } }).select('email').run()
    const viaTag = await sql`SELECT email FROM users WHERE age > ${26}`
    assert.deepEqual(viaQuery.map((r) => r.email).sort(), viaTag.map((r) => r.email).sort())
  })
})

import { before } from 'node:test'

describe('query language — where 合并与 eq（DB-FIX-PLAN W2 防线）', () => {
  let sql: ReturnType<typeof createMemorySql>

  before(async () => {
    sql = createMemorySql()
    await sql.unsafe('CREATE TABLE ages (age int)')
    for (const a of [10, 20, 25, 30, 40]) await sql.unsafe('INSERT INTO ages (age) VALUES ($1)', [a])
  })

  it('builder 链式 where 同列对象级合并——AND 语义不覆盖（修复前 [10,20,30]）', async () => {
    const rows = await sql.query.from('ages').where({ age: { gt: 15 } }).where({ age: { lt: 35 } }).run()
    assert.deepEqual(rows.map((r) => r.age), [20, 25, 30])
  })

  it('builder scalar × ops 合并 → eq（内存执行双端认识 eq）', async () => {
    const rows = await sql.query.from('ages').where({ age: 25 }).where({ age: { lt: 30 } }).run()
    assert.deepEqual(rows.map((r) => r.age), [25])
  })

  it('SQL 字符串路径：同列 > 与 = 共存（修复前 eq 静默丢弃返回 25/30）', async () => {
    const rows = await sql.unsafe('SELECT age FROM ages WHERE age > 15 AND age = 25')
    assert.deepEqual(rows, [{ age: 25 }])
  })

  it('SQL 字符串路径：同列 = 在前 > 在后（修复前 eq 被覆盖丢失）', async () => {
    const rows = await sql.unsafe('SELECT age FROM ages WHERE age = 25 AND age > 15')
    assert.deepEqual(rows, [{ age: 25 }])
  })

  it('同列双 scalar → and 包装（恒假语义显式——不静默丢条件）', async () => {
    const rows = await sql.unsafe('SELECT age FROM ages WHERE age = 25 AND age = 30')
    assert.deepEqual(rows, [], '25 AND 30 恒假——应空集')
  })

  it('parser 产出 AST → compileSelect：eq 编译进 SQL（真库路径不丢条件）', () => {
    const ast = parseSqlToAst('SELECT age FROM ages WHERE age > 15 AND age = 25') as SelectQuery
    const { sql: sqlText, params } = compileSelect(ast)
    assert.match(sqlText, /age = \$1/)
    assert.match(sqlText, /age > \$2/)
    assert.deepEqual(params, [25, 15])
  })

  it('compileSelect：and 组编译（or 组冲突包装）', () => {
    const q: SelectQuery = {
      kind: 'select', table: 't',
      where: { or: [{ a: 1 }, { b: 2 }], and: [{ or: [{ c: 3 }, { d: 4 }] }] },
    }
    const { sql: sqlText } = compileSelect(q)
    assert.match(sqlText, /\(a = \$1 OR b = \$2\)/)
    assert.match(sqlText, /\(c = \$3 OR d = \$4\)/)
  })

  it('builder or 组冲突 → and 包装（(A OR B) AND (C OR D) 不平铺——内存执行）', async () => {
    await sql.unsafe('CREATE TABLE flags (a int, b int, c int, d int)')
    await sql.unsafe('INSERT INTO flags (a, b, c, d) VALUES (1, 0, 1, 0)') // A 命中 C 不中——AND 后应空
    await sql.unsafe('INSERT INTO flags (a, b, c, d) VALUES (1, 0, 0, 0)') // A 命中 C/D 均不中——空
    await sql.unsafe('INSERT INTO flags (a, b, c, d) VALUES (0, 0, 1, 0)') // A/B 不中——空
    const rows = await sql.query.from('flags')
      .where({ or: [{ a: 1 }, { b: 1 }] })
      .where({ or: [{ c: 1 }, { d: 1 }] })
      .run()
    assert.equal(rows.length, 1, '(a=1 OR b=1) AND (c=1 OR d=1)——仅第一行')
    assert.equal(rows[0].a, 1)
  })

  it('whereRaw 冲突不再覆盖（双 raw 条件并存——AND）', async () => {
    // 内存端 raw WHERE 诚实裁剪——用 spy executor 捕获 AST 后断言编译产物
    let captured: SelectQuery | null = null
    const qb = createQueryBuilder({} as never, (q) => {
      captured = q as SelectQuery
      return Promise.resolve([])
    })
    await qb.from('evts')
      .whereRaw("created_at > '2025-01-01'")
      .whereRaw('deleted_at IS NULL')
      .run()
    const compiled = compileSelect(captured!)
    assert.match(compiled.sql, /created_at > /)
    assert.match(compiled.sql, /deleted_at IS NULL/)
  })
})
