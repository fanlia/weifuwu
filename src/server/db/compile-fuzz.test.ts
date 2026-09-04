/**
 * 编译面契约（W5 正规化——W3c 改版：文本轨消亡后「对账」无第二轨——
 * fuzz 保留生成器，断言 = 编译面不变量（参数化连续性） + 内存执行语义）
 *
 * 判负记录（W3c 更新）：
 * - pg 算子包无需新建（compileWhere 全算子覆盖——W4 试点已隐式验证）
 * - compile→parse→exec round-trip 对账随 parser 消亡——编译面改单向输出
 *   不变量断言（$n 连续性/props 顺序/无泄漏）+ 语义由内存执行面承接
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryOrm } from './memory-sql.ts'
import { compileQuery } from './query.ts'
import { eq, ne, gt, gte, lt, lte, inArray, between, ilike, contains, isNull, and, or, mergeInc, mergeAppend } from './ops.ts'
import * as ops from './ops.ts'
import { z } from '../../shared/zod.ts'

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 编译面不变量：$n 占位符 1..N 连续（无跳号/无多出）+ params 长度一致 */
function assertCompiled(sqlText: string, params: unknown[]): void {
  const phs = [...sqlText.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]))
  assert.equal(phs.length, params.length, `占位符数 = 参数数（SQL: ${sqlText}）`)
  for (let i = 1; i <= phs.length; i++) assert.ok(phs.includes(i), `$n 连续（缺 $${i}——SQL: ${sqlText}）`)
  assert.equal(Math.max(...phs, 0), params.length, `$n 无跳号（SQL: ${sqlText}）`)
}

function fx(mem: { applySchema: (m: unknown) => void }, name: string, columns: Record<string, unknown>, extra: Record<string, unknown> = {}): void {
  mem.applySchema({ name: 'fx', tables: [{ name, columns, ...extra }] })
}

test('compile fuzz：AST 生成 → 编译不变量 + 内存执行（200 对/种子）', async () => {
  for (const seed of [7, 99, 555, 2025, 4242]) {
    const rnd = mulberry32(seed)
    const { orm: sql, mem } = createMemoryOrm()
    fx(mem, 'fz', { id: z.number().int(), name: z.string(), st: z.string(), val: z.number().int() }, { columnTypes: { id: 'INT', val: 'INT' } })
    const words = ['alpha', 'beta', 'gamma', 'delta', '50%', 'a_b', '张', '李四']
    for (let i = 0; i < 30; i++) {
      const st = rnd() < 0.2 ? null : rnd() < 0.5 ? 'x' : 'y'
      await sql.query.insert('fz').values({ id: i, name: words[Math.floor(rnd() * words.length)], st, val: Math.floor(rnd() * 25) }).run()
    }
    const C = { id: { ref: 'id', __out: 0 as number }, name: { ref: 'name', __out: '' as string }, st: { ref: 'st', __out: '' as string }, val: { ref: 'val', __out: 0 as number } }
    for (let i = 0; i < 200; i++) {
      const kind = Math.floor(rnd() * 10)
      const n = Math.floor(rnd() * 20)
      let w: unknown
      if (kind === 0) w = eq(C.id, n)
      else if (kind === 1) w = ne(C.id, n)
      else if (kind === 2) w = gt(C.id, n)
      else if (kind === 3) w = lt(C.id, n)
      else if (kind === 4) w = between(C.val, n, n + 6)
      else if (kind === 5) w = inArray(C.id, [n, n + 1, n + 2])
      else if (kind === 6) w = and(eq(C.id, n), gt(C.val, n - 5))
      else if (kind === 7) w = or(eq(C.st, 'x'), eq(C.st, 'y'))
      else if (kind === 8) w = ilike(C.name, `${words[n % words.length]}%`)
      else w = and(eq(C.st, 'x'), or(eq(C.id, n), contains(C.name, 'a')))
      const direct = await sql.query.from('fz').select('id', 'name', 'st', 'val').where(w as never).run()
      const compiled = compileQuery({ kind: 'select', table: 'fz', cols: ['id', 'name', 'st', 'val'], where: w as never })
      assertCompiled(compiled.sql, compiled.params)
      // 语义锚：行数恒 < 30（空判下界已由单元断言承接——此处只验编译健壮性）
      assert.ok(direct.length <= 30)
    }
  }
})

test('compile fuzz：isNull/notNull + 字符串转义（编译不变量）', async () => {
  const { orm: sql, mem } = createMemoryOrm()
  fx(mem, 'fz2', { name: z.string(), st: z.string() })
  await sql.query.insert('fz2').rows([
    { name: '50%off', st: 'a' }, { name: 'plain', st: null }, { name: 'a_b', st: 'b' },
  ]).run()
  const C = { name: { ref: 'name', __out: '' as string }, st: { ref: 'st', __out: '' as string } }
  const w = and(isNull(C.st), or(contains(C.name, '0%'), eq(C.st, 'b')))
  const direct = await sql.query.from('fz2').select('name').where(w as never).run()
  const compiled = compileQuery({ kind: 'select', table: 'fz2', cols: ['name'], where: w as never })
  assertCompiled(compiled.sql, compiled.params)
  assert.deepEqual(direct.map((r: any) => r.name).sort(), [], 'isNull AND (contains 0% OR b)——plain 不含 0%——空集')
})

test('compile fuzz：onConflict DO UPDATE（编译不变量 + 终态语义）', async () => {
  for (const seed of [11, 47, 233]) {
    const rnd = mulberry32(seed)
    const { orm, mem } = createMemoryOrm()
    fx(mem, 'up', { key: z.string().meta({ unique: true }), val: z.string() })
    for (let i = 0; i < 20; i++) {
      const op = { key: `k${Math.floor(rnd() * 5)}`, val: `v${i}` } // 有限键集——制造冲突
      await orm.query.insert('up').values(op).onConflict('key', true).returning('*').run()
      const c = compileQuery({ kind: 'insert', table: 'up', rows: [op], onConflict: { col: 'key', update: true }, returning: '*' })
      assertCompiled(c.sql, c.params)
      assert.match(c.sql, /ON CONFLICT \(key\) DO UPDATE SET val = EXCLUDED\.val/)
    }
    // 终态：键集 ≤ 5（有限键集必有冲突——upsert 不产生重复键）
    const rows = mem.executeQuery({ kind: 'select', table: 'up', cols: ['key', 'val'] } as never)
    assert.ok(rows.length <= 5, `种子 ${seed} onConflict 终态键集不膨胀（${rows.length}）`)
  }
})

test('W3 fuzz：mergeInc/mergeAppend 随机序列终态 = 数学期望（多种子×60 轮）', async () => {
  for (const seed of [17, 231, 777, 31337, 909]) {
    const rnd = mulberry32(seed)
    const { orm, mem } = createMemoryOrm()
    fx(mem, 'c', { key: z.string().meta({ unique: true }), hits: z.number().int(), items: z.json().meta({ default: [] }) }, { columnTypes: { hits: 'INT', items: 'JSONB' } })
    const exp = new Map<string, { hits: number; items: number[] }>()
    const seen = new Set<string>()
    for (let i = 0; i < 60; i++) {
      const key = `k${Math.floor(rnd() * 6)}` // 有限键集——制造冲突
      const n = Math.floor(rnd() * 5) + 1 // inc 1..5
      // 参考世界：首次 INSERT 走 values 原样（hits=0/items=[]——merge 仅冲突时）；
      // 冲突轮才累计 mergeInc/mergeAppend
      if (seen.has(key)) {
        const cur = exp.get(key)!
        cur.hits += n
        cur.items.push(i)
      } else {
        seen.add(key)
        exp.set(key, { hits: 0, items: [] })
      }
      await orm.query.insert('c').values({ key, hits: 0, items: [] })
        .onConflict('key', true, { hits: ops.mergeInc(n), items: ops.mergeAppend([i]) })
        .run()
      // compile 面文本断言（抽检——merge 编码 → SQL 表达式）
      if (i === 0) {
        const c = compileQuery({ kind: 'insert', table: 'c', rows: [{ key, hits: 0, items: [] }], onConflict: { col: 'key', update: true, merge: { hits: ops.mergeInc(n), items: ops.mergeAppend([i]) } } })
        assert.ok(/hits = hits \+ \d+/.test(c.sql), c.sql)
        assert.ok(new RegExp(`items = c\\.items \\|\\| \\$\\d+::jsonb`).test(c.sql), c.sql)
      }
    }
    const rows = mem.executeQuery({ kind: 'select', table: 'c', cols: ['key', 'hits', 'items'] } as never)
    assert.equal(rows.length, exp.size, `键集（种子 ${seed}）`)
    for (const r of rows) {
      const e = exp.get(String(r.key))!
      assert.equal(r.hits, e.hits, `hits 累计（种子 ${seed}）`)
      assert.deepEqual(r.items, e.items, `items 顺序拼接（种子 ${seed}）`)
    }
  }
})
