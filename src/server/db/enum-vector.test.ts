/**
 * W4 契约：enum 单源 + vector 声明面
 *
 * - z.enum 字面量 tuple（U 技巧——修复 ZodEnum<[string,string]> 坍缩——W1 登记）
 * - z.vector(dims)：Infer=number[]（S2——embedding 不再 ZodJson unknown）· dims
 *   元数据 · 维度校验 · zodTypeOf=JSONB（内存/传输面）· memory string 承载解码
 * - enumValuesOf（zodTypeOf enum → TEXT + CHECK 面）
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z, type Infer } from '../../shared/zod.ts'
import { zodTypeOf, enumValuesOf } from './schema.ts'

test('W4：z.enum 字面量 tuple——U 技巧（值集保留 + Infer 联合）', () => {
  const En = z.enum(['ai', 'user', 'webhook'])
  // values 保留字面量（tuple——不是 [string,...]）
  const v0: typeof En.values[0] = 'ai'
  // @ts-expect-error —— 'robot' 红（W1 登记：枚举外值无编译错）
  const bad: typeof En.values[0] = 'robot'
  // Infer = 值联合
  const ev: Infer<typeof En> = 'webhook'
  // @ts-expect-error —— Infer 联合外红
  const bad2: Infer<typeof En> = 'nope'
  void v0; void bad; void ev; void bad2
})

test('W4：z.vector(1024)——Infer=number[] + dims 元数据 + 维度校验', () => {
  const V = z.vector(1024)
  const vec: Infer<typeof V> = [0.1, 0.2] // number[]（S2——不再 unknown）
  assert.equal(V.dims, 1024)
  assert.equal(V._typeName(), 'vector')
  assert.equal(zodTypeOf(V), 'JSONB') // 内存/传输面
  // 维度校验（parse 抛 ZodError——1024 维要求）
  const V3 = z.vector(3)
  assert.deepEqual(V3.parse([0, 0, 0]), [0, 0, 0])
  assert.throws(() => V3.parse([0, 0, 0, 0]), /vector\(3\)/)
  void vec
})

test('W4：enumValuesOf——枚举值面（zodTypeOf enum → TEXT + 值集）', () => {
  const En = z.enum(['ai', 'user'])
  assert.equal(zodTypeOf(En), 'TEXT')
  assert.deepEqual(enumValuesOf(En), ['ai', 'user'])
  // nullable 穿透（f.req/z.enum().nullable() 单源）
  assert.deepEqual(enumValuesOf(En.nullable()), ['ai', 'user'])
})

test('W4：memory vector 列——number[] 承载 + string 解码（declared 面）', async () => {
  const mem = await import('./memory-sql.ts')
  const m = new mem.MemorySql()
  m.applySchema({ tables: [{ name: 'vb', columns: { id: z.string(), vec: z.vector(3).nullable() } }] })
  // 数组写入 → 原样读回
  m.executeQuery({ kind: 'insert', table: 'vb', rows: [{ id: 'a', vec: [1, 2, 3] }] } as never)
  const rows = m.executeQuery({ kind: 'select', table: 'vb', alias: undefined, cols: ['vec'], where: undefined, joins: undefined, sub: undefined, groupBy: undefined, having: undefined, orderBy: undefined, limit: undefined, offset: undefined, aggregate: undefined, distinct: false } as never)
  assert.deepEqual(rows[0].vec, [1, 2, 3])
})
