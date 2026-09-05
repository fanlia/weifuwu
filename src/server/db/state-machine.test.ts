/**
 * 状态机契约（W3——确定性原则机制化）
 *
 * 覆盖：MemoryTable 三态（absent/declared/observed）行为矩阵 · 转换守卫
 * （applySchema 声明采纳观察态）· 状态可见面 inspectTable · jsonb 解码
 * 矩阵（declared=columnTypes / observed=行键值启发）· O1 `{ eq: null }`
 * 双端一致（编译 IS NULL + 内存判空——真库恒假 vs 内存判 true 分裂修复）
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z } from '../../shared/zod.ts'
import { f } from './shape.ts'
import { compileQuery } from './query.ts'
import { MemorySql } from './memory-sql.ts'

const shape = {
  id: f.pk(z.uuid()),
  name: f.req(z.string()),
  meta: z.json().nullable(),
} satisfies Parameters<typeof z.object>[0]

test('状态机：absent——访问显式拒绝（42P01——对齐真库——不再静默建空表）', async () => {
  const mem = new MemorySql()
  for (const op of ['select', 'delete', 'update'] as const) {
    const q =
      op === 'select' ? { kind: 'select' as const, table: 'nope', where: undefined }
      : op === 'delete' ? { kind: 'delete' as const, table: 'nope', where: { id: { eq: 'x' } } }
      : { kind: 'update' as const, table: 'nope', where: { id: { eq: 'x' } }, set: { name: 'y' } }
    assert.throws(() => mem.executeQuery(q as never), /不存在|42P01/, `${op} 未注册表应拒绝`)
  }
  // join 未注册表同样 42P01（之前静默空表 → 0 行——不一致）
  const q = { kind: 'select', table: 'a', alias: undefined, cols: undefined, where: undefined, joins: [{ table: 'ghost', alias: 'g', on: { 'g.id': { col: 'a.id' } }, type: 'inner' }], sub: undefined, groupBy: undefined, having: undefined, orderBy: undefined, limit: undefined, offset: undefined, aggregate: undefined, distinct: false } as const
  assert.throws(() => mem.executeQuery(q as never), /不存在|42P01/)
})

test('状态机：declared——applySchema 声明态（列集/类型/约束确定）', async () => {
  const mem = new MemorySql()
  mem.applySchema({ tables: [{ name: 't1', columns: shape }] })
  const info = mem.inspectTable('t1')
  assert.equal(info.state, 'declared')
  assert.deepEqual(info.columns, ['id', 'name', 'meta'])
  assert.equal(info.columnTypes.id, 'uuid')
  assert.equal(info.columnTypes.name, 'text')
  assert.deepEqual(info.constraints.uniques, [])
  assert.ok(info.constraints.pk)
  // declared 列校验：未知列红
  const q = { kind: 'select', table: 't1', alias: undefined, cols: ['ghost'], where: undefined, joins: undefined, sub: undefined, groupBy: undefined, having: undefined, orderBy: undefined, limit: undefined, offset: undefined, aggregate: undefined, distinct: false } as const
  assert.throws(() => mem.executeQuery(q as never), /未知列/)
})

test('状态机：observed——insert 直建（行键事实列集 + 状态可见）', async () => {
  const mem = new MemorySql()
  mem.executeQuery({ kind: 'insert', table: 'o1', rows: [{ a: 1, b: 'x' }] } as never)
  const info = mem.inspectTable('o1')
  assert.equal(info.state, 'observed')
  assert.equal(info.columnTypes.a, undefined) // 类型未知——诚实
  // observed 列校验：行键事实（宽容——不红）
  const rows = mem.executeQuery({ kind: 'select', table: 'o1', alias: undefined, cols: ['a', 'b'], where: undefined, joins: undefined, sub: undefined, groupBy: undefined, having: undefined, orderBy: undefined, limit: undefined, offset: undefined, aggregate: undefined, distinct: false } as never)
  assert.equal(rows[0].a, 1)
})

test('状态机：转换守卫——observed 表 applySchema 声明采纳（state→declared 列集以声明为准）', async () => {
  const mem = new MemorySql()
  mem.executeQuery({ kind: 'insert', table: 'o2', rows: [{ name: 'raw' }] } as never)
  assert.equal(mem.inspectTable('o2').state, 'observed')
  // 声明采纳（声明权威——列集/类型以声明为准）
  mem.applySchema({ tables: [{ name: 'o2', columns: shape }] })
  const info = mem.inspectTable('o2')
  assert.equal(info.state, 'declared')
  assert.ok(info.columnTypes.id) // 类型恢复
})

test('jsonb 解码矩阵：declared（columnTypes 判定）vs observed（行键值启发）', async () => {
  const mem = new MemorySql()
  mem.applySchema({ tables: [{ name: 'j1', columns: shape }] })
  mem.executeQuery({ kind: 'insert', table: 'j1', rows: [{ id: 'a1', name: 'n', meta: '{"k":1}' }] } as never)
  const declared = mem.executeQuery({ kind: 'select', table: 'j1', alias: undefined, cols: ['meta'], where: undefined, joins: undefined, sub: undefined, groupBy: undefined, having: undefined, orderBy: undefined, limit: undefined, offset: undefined, aggregate: undefined, distinct: false } as never)
  assert.deepEqual(declared[0].meta, { k: 1 }) // 解码
  // observed：insert 值面（对象原样存储——读回对象）
  mem.executeQuery({ kind: 'insert', table: 'o3', rows: [{ j: { k: 2 }, t: '[1,2]' }] } as never)
  const observed = mem.executeQuery({ kind: 'select', table: 'o3', alias: undefined, cols: ['j', 't'], where: undefined, joins: undefined, sub: undefined, groupBy: undefined, having: undefined, orderBy: undefined, limit: undefined, offset: undefined, aggregate: undefined, distinct: false } as never)
  assert.deepEqual(observed[0].j, { k: 2 })
  assert.deepEqual(observed[0].t, [1, 2]) // 启发解码（JSON 可解析且为对象/数组）
  // 启发不误伤普通文本（非 JSON 字符串）
  mem.executeQuery({ kind: 'insert', table: 'o4', rows: [{ t: 'plain text' }] } as never)
  const t4 = mem.executeQuery({ kind: 'select', table: 'o4', alias: undefined, cols: ['t'], where: undefined, joins: undefined, sub: undefined, groupBy: undefined, having: undefined, orderBy: undefined, limit: undefined, offset: undefined, aggregate: undefined, distinct: false } as never)
  assert.equal(t4[0].t, 'plain text')
})

test('O1：{ eq: null } 双端一致——编译 IS NULL + 内存判空（分裂修复）', async () => {
  // 真库面：`= NULL`（恒假）→ `IS NULL`（判空——语义正确化）
  const c = compileQuery({ kind: 'select', table: 't', alias: undefined, cols: ['*'], where: { deleted_at: { eq: null } }, joins: undefined, sub: undefined, groupBy: undefined, having: undefined, orderBy: undefined, limit: undefined, offset: undefined, aggregate: undefined, distinct: false } as const)
  assert.ok(c.sql.includes('IS NULL'), c.sql)
  assert.ok(!c.sql.includes('= NULL'), c.sql)
  // 内存面：eq:null 判空（与 IS NULL 一致）
  const mem = new MemorySql()
  mem.applySchema({ tables: [{ name: 'n1', columns: { id: z.string(), deleted_at: z.string().nullable() } }] })
  mem.executeQuery({ kind: 'insert', table: 'n1', rows: [{ id: 'a', deleted_at: null }, { id: 'b', deleted_at: 'x' }] } as never)
  const rows = mem.executeQuery({ kind: 'select', table: 'n1', alias: undefined, cols: ['id'], where: { deleted_at: { eq: null } }, joins: undefined, sub: undefined, groupBy: undefined, having: undefined, orderBy: undefined, limit: undefined, offset: undefined, aggregate: undefined, distinct: false } as never)
  assert.deepEqual(rows.map((r) => String((r as { id: unknown }).id)), ['a'])
  // isNull: false 与 eq: null 语义一致（互为否定）
  const notNull = mem.executeQuery({ kind: 'select', table: 'n1', alias: undefined, cols: ['id'], where: { deleted_at: { isNull: false } }, joins: undefined, sub: undefined, groupBy: undefined, having: undefined, orderBy: undefined, limit: undefined, offset: undefined, aggregate: undefined, distinct: false } as never)
  assert.deepEqual(notNull.map((r) => String((r as { id: unknown }).id)), ['b'])
})

test('状态机：事务快照携带 state（ROLLBACK 恢复状态）', async () => {
  const mem = new MemorySql()
  mem.applySchema({ tables: [{ name: 's1', columns: shape }] })
  const snap = mem.snapshot()
  mem.executeQuery({ kind: 'insert', table: 's1', rows: [{ id: 'x', name: 'y' }] } as never)
  mem.restore(snap)
  assert.equal(mem.inspectTable('s1').state, 'declared')
  assert.equal(mem.inspectTable('s1').columns.length, 3)
})
