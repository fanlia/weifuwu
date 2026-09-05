/**
 * ops 算子契约 + fuzz 对账（W3：shape+operator 数据层计划）
 *
 * 锁定：
 * - 算子 → WhereExpr 形态（eq/gt/ilike/and/or/not/inArray/between/isNull——快照）
 * - builder 集成（where(ops)——MemorySql 执行——复用已验证引擎）
 * - 类型收窄（tsd 式：ilike 仅 string 列·eq 值类型绑定·and/or 组合）
 * - escapeLike round-trip（%/_ 字面量）
 *
 * 判负（W3c）：fuzz「DSL vs SQL 字符串轨」对账——字符串轨（parser）消亡——
 * 第二轨不存在即无从对账——语义由 builder 集成 + escapeLike + 引擎契约承接（删除）
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMemoryOrm } from './memory-sql.ts'
import {
  eq, ne, gt, gte, lt, lte, inArray, notInArray, between,
  like, ilike, contains, startsWith, endsWith, isNull, isNotNull,
  and, or, not,
} from './ops.ts'
import { z } from '../../shared/zod.ts'

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
  ilike(C.num, '%x%') // W1: cast 绕过收窄（断言原意 = num 列禁 ilike）
  // and/or 组合类型保真
  const w = and(eq(C.num, 1), or(eq(C.st, 'a'), eq(C.st, 'b')))
  assert.ok(w)
})

// ── builder 集成执行 ──────────────────────────────────────

test('ops：builder 集成（where(ops)——MemorySql 执行）', async () => {
  const { orm: sql, mem } = createMemoryOrm()
  mem.applySchema({ tables: [{ name: 't', columns: { num: z.number().int(), txt: z.string(), st: z.string() }, columnTypes: { num: 'INT' } }] })
  await sql.query.insert('t').rows([
    { num: 1, txt: '张三', st: 'a' }, { num: 2, txt: '李四', st: 'b' }, { num: 3, txt: '王五', st: 'a' },
  ]).run()
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

test('ops：escapeLike（%/_ 字面量——DSL contains 与 SQL 转义同语义）', async () => {
  const { orm: sql, mem } = createMemoryOrm()
  mem.applySchema({ tables: [{ name: 't2', columns: { txt: z.string() } }] })
  await sql.query.insert('t2').rows([
    { txt: '50%off' }, { txt: '50off' }, { txt: 'a_b' }, { txt: 'axb' },
  ]).run()
  const dsl = await sql.query.from('t2').select('*').where(contains({ ref: 'txt', __out: '' as string }, '0%o') as any).run()
  assert.deepEqual(dsl.map((r: any) => r.txt), ['50%off'])
  const dsl2 = await sql.query.from('t2').select('*').where(contains({ ref: 'txt', __out: '' as string }, '_') as any).run()
  assert.deepEqual(dsl2.map((r: any) => r.txt), ['a_b'])
})
