/**
 * zod 子集 + shape 层契约（W2：shape+operator 数据层计划）
 *
 * 锁定：
 * - 基础校验（string/number/boolean/enum/literal/object/array/union/optional/nullable/
 *   default/refine/transform/date/uuid——parse 通过/拒绝/错误路径）
 * - 类型推断（z.infer 编译期——tsd 风格 assignability 断言）
 * - meta 挂载/读取（shape 层 db 语义消费面）
 * - shape 变体派生（insert 省略 auto 字段/update 全 optional）· pk 识别 · 多态判别联合
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z, type Infer, ZodError } from './zod.ts'
import { shape } from '../server/db/shape.ts'

// ── 基础校验 ──────────────────────────────────────────────

test('zod：string/number/boolean/enum 基础面', () => {
  assert.equal(z.string().parse('hi'), 'hi')
  assert.throws(() => z.string().parse(1), ZodError)
  assert.equal(z.number().int().parse(3), 3)
  assert.throws(() => z.number().int().parse(3.5), ZodError)
  assert.equal(z.boolean().parse(true), true)
  assert.equal(z.enum(['a', 'b', 'c']).parse('b'), 'b')
  assert.throws(() => z.enum(['a', 'b']).parse('x'), ZodError)
})

test('zod：string 校验器（email/uuid/min/max/regex）', () => {
  assert.equal(z.string().email().parse('a@x.com'), 'a@x.com')
  assert.throws(() => z.string().email().parse('nope'), ZodError)
  assert.equal(z.string().uuid().parse('00000000-0000-4000-8000-0000000000b1'), '00000000-0000-4000-8000-0000000000b1')
  assert.throws(() => z.string().min(5).parse('abc'), ZodError)
  assert.throws(() => z.string().regex(/^x/).parse('abc'), ZodError)
})

test('zod：object 嵌套/数组/union/optional/nullable/default', () => {
  const S = z.object({ a: z.number(), list: z.array(z.string()).min(1), opt: z.string().optional(), n: z.number().nullable() })
  const ok = S.parse({ a: 1, list: ['x'], n: null })
  assert.equal(ok.a, 1)
  assert.equal(ok.list.length, 1)
  assert.equal(ok.n, null)
  assert.throws(() => S.parse({ a: 1, list: [], n: null }), ZodError)
  const U = z.union([z.string(), z.number()])
  assert.equal(U.parse('s'), 's')
  assert.equal(U.parse(1), 1)
  assert.throws(() => U.parse(true), ZodError)
  const D = z.string().default('dft')
  assert.equal(D.parse(undefined), 'dft')
  assert.equal(D.parse('x'), 'x')
})

test('zod：refine/transform/date', () => {
  const R = z.number().refine((v) => v > 0, 'must be positive')
  assert.equal(R.parse(1), 1)
  assert.throws(() => R.parse(-1), /must be positive/)
  const T = z.string().transform((v) => v.length)
  assert.equal(T.parse('abcd'), 4)
  assert.ok(z.date().parse('2026-09-03T00:00:00Z'))
  assert.throws(() => z.date().parse('not-a-date'), ZodError)
})

test('zod：safeParse 不抛·错误路径', () => {
  const r = z.object({ email: z.string().email() }).safeParse({ email: 'x' })
  assert.equal(r.success, false)
  if (!r.success) assert.equal(r.error.issues[0].path, 'email')
  const ok = z.string().safeParse('v')
  assert.equal(ok.success, true)
  if (ok.success) assert.equal(ok.data, 'v')
})

test('zod：类型推断（编译期——tsd 风格）', () => {
  const S = z.object({ name: z.string(), age: z.number().optional(), role: z.enum(['a', 'b']) })
  type T = Infer<typeof S>
  const v: T = { name: 'x', role: 'a' }
  void v
  // @ts-expect-error —— role 类型收窄（'c' 非法）
  const bad: T = { name: 'x', role: 'c' }
  void bad
  // @ts-expect-error —— name 必须 string
  const bad2: T = { name: 1, role: 'a' }
  void bad2
  assert.ok(true)
})

// ── 多态判别联合 ──────────────────────────────────────────

test('zod：discriminatedUnion（多态 shape 面）', () => {
  const S = z.discriminatedUnion('type', [
    z.object({ type: z.literal('ai'), model: z.string() }),
    z.object({ type: z.literal('user'), name: z.string() }),
  ])
  const ai = S.parse({ type: 'ai', model: 'deepseek' })
  assert.equal(ai.type, 'ai')
  const user = S.parse({ type: 'user', name: '张三' })
  assert.equal(user.name, '张三')
  assert.throws(() => S.parse({ type: 'webhook', url: 'x' }), ZodError)
})

// ── meta 与 shape 层 ──────────────────────────────────────

test('zod：meta 挂载/读取（shape 层 db 语义消费面）', () => {
  const s = z.string().meta({ column: 'full_name', notNull: true })
  assert.equal(s.metaInfo.column, 'full_name')
  const Agent = shape({
    table: 'agents',
    fields: {
      id: z.uuid().meta({ pk: true, default: 'random' }),
      appId: z.string().meta({ column: 'app_id', notNull: true }),
      type: z.enum(['ai', 'user']).meta({ notNull: true }),
      createdAt: z.date().meta({ column: 'created_at', default: 'now' }),
    },
  })
  assert.equal(Agent.table, 'agents')
  assert.equal(Agent.pkField, 'id')
  assert.equal(Agent.dbFields.appId.column, 'app_id')
  assert.equal(Agent.dbFields.id.default, 'random')
  assert.equal(Agent.dbFields.createdAt.default, 'now')
})

test('shape：insertSchema 省略 auto 字段（pk+random/now）', () => {
  const Agent = shape({
    table: 'agents',
    fields: {
      id: z.uuid().meta({ pk: true, default: 'random' }),
      appId: z.string().meta({ notNull: true }),
      name: z.string(),
      createdAt: z.date().meta({ default: 'now' }),
    },
  })
  const ins = Agent.insertSchema()
  const ok = ins.safeParse({ appId: 'a1', name: 'x' })
  assert.equal(ok.success, true)
  // 缺 id/createdAt 合法（DB 侧生成）· 多余键校验（object 严格面）
  const bad = ins.safeParse({ appId: 'a1' })
  assert.equal(bad.success, false)
})

test('shape：updateSchema 全字段 optional（部分更新面）', () => {
  const Agent = shape({
    table: 'agents',
    fields: { id: z.uuid().meta({ pk: true, default: 'random' }), name: z.string().meta({ notNull: true }) },
  })
  const upd = Agent.updateSchema()
  assert.equal(upd.safeParse({}).success, true)
  assert.equal(upd.safeParse({ name: '新' }).success, true)
  assert.equal(upd.safeParse({ name: 1 }).success, false)
})

test('shape：f 快捷装饰（pk/req/col/now/unique/soft）', async () => {
  const { f } = await import('../server/db/shape.ts')
  const Agent = shape({
    table: 'agents',
    fields: {
      id: f.pk(z.uuid()),
      name: f.req(f.col(z.string(), 'full_name')),
      email: f.unique(z.string().email()),
      deletedAt: f.soft(z.date().nullable()),
    },
  })
  assert.equal(Agent.pkField, 'id')
  assert.equal(Agent.dbFields.name.column, 'full_name')
  assert.equal(Agent.dbFields.name.notNull, true)
  assert.equal(Agent.dbFields.email.unique, true)
  assert.equal(Agent.dbFields.deletedAt.softDelete, true)
})

test('shape：输出类型（infer 编译期）', () => {
  const Agent = shape({
    table: 'agents',
    fields: { id: z.uuid(), type: z.enum(['ai', 'user']) },
  })
  type T = typeof Agent.output
  const v: T = { id: 'u', type: 'ai' }
  void v
  // @ts-expect-error —— type 收窄
  const bad: T = { id: 'u', type: 'x' }
  void bad
  assert.ok(true)
})
