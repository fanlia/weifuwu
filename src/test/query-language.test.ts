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
import { compileQuery, compileSelect } from '../db/query.ts'
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
