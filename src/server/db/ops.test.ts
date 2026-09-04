/**
 * ops 算子契约 + fuzz 对账（W3：shape+operator 数据层计划）
 *
 * 锁定：
 * - 算子 → WhereExpr 形态（eq/gt/ilike/and/or/not/inArray/between/isNull——快照）
 * - builder 集成（where(ops)——MemorySql 执行——复用已验证引擎）
 * - 类型收窄（tsd 式：ilike 仅 string 列·eq 值类型绑定·and/or 组合）
 * - fuzz 对账：DSL（ops→WhereExpr）vs 字符串轨（SQL→parser→WhereExpr）——
 *   同一 MemSql 引擎·同数据集·终态行集等价（≥200 对）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryOrm } from './memory-sql.ts'
import { parseSqlToAst } from './sql-parser.ts'
import {
  eq, ne, gt, gte, lt, lte, inArray, notInArray, between,
  like, ilike, contains, startsWith, endsWith, isNull, isNotNull,
  and, or, not,
} from './ops.ts'

/** 列引用（类型面 phantom——运行时 ref） */
const C = {
  num: { ref: 'num', __out: 0 as number },
  txt: { ref: 'txt', __out: '' as string },
  st: { ref: 'st', __out: '' as string },
}

// ── 算子形态 ──────────────────────────────────────────────

test('ops：值算子产 WhereExpr（快照）', () => {
  assert.deepEqual(eq(C.num, 5), { num: { eq: 5 } })
  assert.deepEqual(gt(C.num, 5), { num: { gt: 5 } })
  assert.deepEqual(gte(C.num, 5), { num: { gte: 5 } })
  assert.deepEqual(lt(C.num, 5), { num: { lt: 5 } })
  assert.deepEqual(lte(C.num, 5), { num: { lte: 5 } })
  assert.deepEqual(ne(C.num, 5), { num: { ne: 5 } })
  assert.deepEqual(inArray(C.num, [1, 2]), { num: { in: [1, 2] } })
  assert.deepEqual(notInArray(C.num, [1, 2]), { num: { notIn: [1, 2] } })
  assert.deepEqual(between(C.num, 1, 9), { num: { between: [1, 9] } })
})

test('ops：字符串算子（like 语义/转义）', () => {
  assert.deepEqual(ilike(C.txt, '%张%'), { txt: { ilike: '%张%' } })
  assert.deepEqual(contains(C.txt, '50%'), { txt: { ilike: '%50\\%%' } })
  assert.deepEqual(startsWith(C.txt, 'a'), { txt: { ilike: 'a%' } })
  assert.deepEqual(endsWith(C.txt, 'z'), { txt: { ilike: '%z' } })
  assert.deepEqual(isNull(C.st), { st: { isNull: true } })
  assert.deepEqual(isNotNull(C.st), { st: { isNull: false } })
})

test('ops：and/or/not 组合', () => {
  assert.deepEqual(and(eq(C.num, 1), eq(C.st, 'a')), { and: [{ num: { eq: 1 } }, { st: { eq: 'a' } }] })
  assert.deepEqual(or(eq(C.num, 1), eq(C.num, 2)), { or: [{ num: { eq: 1 } }, { num: { eq: 2 } }] })
  assert.deepEqual(not(eq(C.num, 5)), { num: { ne: 5 } })
  assert.deepEqual(not(gt(C.num, 5)), { num: { lte: 5 } })
  assert.deepEqual(not(isNull(C.st)), { st: { isNull: false } })
})

// ── 类型收窄（tsd 式编译期断言）──────────────────────────

test('ops：类型收窄（编译期——tsd 风格）', () => {
  // eq 值类型绑定列类型：number 列收 string——编译错误
  // @ts-expect-error —— num 列 eq 字符串非法
  eq(C.num, 'x')
  // ilike 仅 string 列
  // @ts-expect-error —— num 列 ilike 非法
  ilike(C.num as unknown as { ref: string; __out: string }, '%x%')
  // and/or 组合类型保真
  const w = and(eq(C.num, 1), or(eq(C.st, 'a'), eq(C.st, 'b')))
  assert.ok(w)
})

// ── builder 集成执行 ──────────────────────────────────────

test('ops：builder 集成（where(ops)——MemorySql 执行）', async () => {
  const { orm: sql, mem } = createMemoryOrm()
  await mem.unsafe(`CREATE TABLE t (num INT, txt TEXT, st TEXT)`)
  await mem.unsafe(`INSERT INTO t (num, txt, st) VALUES (1, '张三', 'a'), (2, '李四', 'b'), (3, '王五', 'a')`)
  const r1 = await sql.query.from('t').select('*').where(and(eq(C.st, 'a'), gt(C.num, 1)) as any).run()
  assert.deepEqual(r1.map((r: any) => r.num), [3])
  const r2 = await sql.query.from('t').select('*').where(contains(C.txt, '张') as any).run()
  assert.deepEqual(r2.map((r: any) => r.num), [1])
  const r3 = await sql.query.from('t').select('*').where(inArray(C.num, [1, 3]) as any).run()
  assert.deepEqual(r3.map((r: any) => r.num), [1, 3])
  const r4 = await sql.query.from('t').select('*').where(isNull(C.st) as any).run()
  assert.equal(r4.length, 0)
  const r5 = await sql.query.from('t').select('*').where(between(C.num, 1, 2) as any).run()
  assert.deepEqual(r5.map((r: any) => r.num), [1, 2])
})

// ── fuzz 对账（DSL vs 字符串轨——终态等价）────────────────

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

test('ops：fuzz 对账（DSL vs SQL 字符串轨——200 对·≥5 种子）', async () => {
  for (const seed of [11, 42, 777, 2024, 31415]) {
    const rnd = mulberry32(seed)
    const { orm: sql, mem } = createMemoryOrm()
    await mem.unsafe(`CREATE TABLE t (num INT, txt TEXT, st TEXT)`)
    // 随机数据集（50 行）
    const names = ['张', '张三', '李四', '王小明', 'a%b', 'x_y', 'admin', '100%', 'A_B', '李']
    for (let i = 0; i < 50; i++) {
      const num = Math.floor(rnd() * 20)
      const txt = names[Math.floor(rnd() * names.length)]
      const st = rnd() < 0.3 ? 'a' : rnd() < 0.5 ? 'b' : ['x', null][Math.floor(rnd() * 2)] as string | null
      await mem.unsafe(`INSERT INTO t (num, txt, st) VALUES ($1, $2, $3)`, [num, txt, st ?? null])
    }
    // 生成断言样本（随机 col×op×val——200 对/种子）
    for (let i = 0; i < 200; i++) {
      const op = Math.floor(rnd() * 12)
      const val = Math.floor(rnd() * 20)
      let dsl: unknown
      let sqlStr: string
      if (op === 0) { dsl = eq(C.num, val); sqlStr = `SELECT num FROM t WHERE num = $1`; }
      else if (op === 1) { dsl = ne(C.num, val); sqlStr = `SELECT num FROM t WHERE num != $1`; }
      else if (op === 2) { dsl = gt(C.num, val); sqlStr = `SELECT num FROM t WHERE num > $1`; }
      else if (op === 3) { dsl = gte(C.num, val); sqlStr = `SELECT num FROM t WHERE num >= $1`; }
      else if (op === 4) { dsl = lt(C.num, val); sqlStr = `SELECT num FROM t WHERE num < $1`; }
      else if (op === 5) { dsl = lte(C.num, val); sqlStr = `SELECT num FROM t WHERE num <= $1`; }
      else if (op === 6) {
        const vals = [val, val + 3]
        dsl = inArray(C.num, vals); sqlStr = `SELECT num FROM t WHERE num = ANY($1)`; void vals
      } else if (op === 7) { dsl = between(C.num, val, val + 4); sqlStr = `SELECT num FROM t WHERE num >= $1 AND num <= $2`; }
      else if (op === 8) { dsl = and(eq(C.num, val), gt(C.num, val - 1)); sqlStr = `SELECT num FROM t WHERE num = $1 AND num > $2`; }
      else if (op === 9) { dsl = or(eq(C.num, val), eq(C.num, val + 1)); sqlStr = `SELECT num FROM t WHERE num = $1 OR num = $2`; }
      else if (op === 10) { dsl = eq(C.st, 'a'); sqlStr = `SELECT num FROM t WHERE st = $1`; }
      else { dsl = and(contains(C.txt, '三'), eq(C.num, val)); sqlStr = `SELECT num FROM t WHERE txt ILIKE $1 AND num = $2`; }
      const viaDsl = await sql.query.from('t').select('num').where(dsl as any).run()
      async function viaSql() {
        if (op === 6) {
          const r = await mem.unsafe(`SELECT num FROM t WHERE num IN ($1, $2)`, [val, val + 3])
          return r
        }
        if (op === 10) { const r = await mem.unsafe(sqlStr, ['a']); return r }
        if (op === 11 || op === 8 || op === 9 || op === 7) {
          const ps = op === 8 ? [val, val - 1] : op === 9 ? [val, val + 1] : op === 7 ? [val, val + 4] : [`%三%`, val]
          const r = await mem.unsafe(sqlStr, ps)
          return r
        }
        const r = await mem.unsafe(sqlStr, [val])
        return r
      }
      let viaSqlRows: Row[]
      try {
        viaSqlRows = await viaSql()
      } catch (e) {
        throw new Error(`种子 ${seed} 样例 ${i}（op=${op} val=${val}）sql=${sqlStr}`) // eslint-disable-line
      }
      const dslNums = viaDsl.map((r: any) => r.num).sort((a, b) => Number(a) - Number(b))
      const sqlNums = viaSqlRows.map((r: any) => r.num).sort((a, b) => Number(a) - Number(b))
      assert.deepEqual(dslNums, sqlNums, `种子 ${seed} 样例 ${i}（op=${op} val=${val}）不等价`)
    }
  }
})

test('ops：fuzz escapeLike（%/_ 字面量——DSL contains vs SQL 转义）', async () => {
  const { orm: sql, mem } = createMemoryOrm()
  await mem.unsafe(`CREATE TABLE t2 (txt TEXT)`)
  await mem.unsafe(`INSERT INTO t2 (txt) VALUES ('50%off'), ('50off'), ('a_b'), ('axb')`)
  const dsl = await sql.query.from('t2').select('*').where(contains({ ref: 'txt', __out: '' as string }, '0%o') as any).run()
  assert.deepEqual(dsl.map((r: any) => r.txt), ['50%off'])
  const dsl2 = await sql.query.from('t2').select('*').where(contains({ ref: 'txt', __out: '' as string }, '_') as any).run()
  assert.deepEqual(dsl2.map((r: any) => r.txt), ['a_b'])
})

// 引用规避（编译面已有·防未用导入）
void parseSqlToAst
