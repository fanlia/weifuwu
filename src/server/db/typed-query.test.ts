/**
 * typedQuery 契约——tsd 风格类型断言（编译期红）+ 运行时转发验证
 *
 * 类型断言形态（项目惯例——@ts-expect-error 负向）：
 *   - 正向：行类型键/值精确（字符串化/可空/jsonb unknown）
 *   - 负向：未知列红 · 未知 alias 红 · where 非法列红 · aggregate AS 键并入
 *
 * 运行时 = SelectBuilder 链转发（零解析）——与 query-language 运行时契约
 * 共用 memory 引擎——断言命令流/wire 语义不变。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { z, type Infer } from '../../shared/zod.ts'
import { f } from './shape.ts'
import { createMemoryOrm } from './memory-sql.ts'
import { createTypedQuery } from './typed-query.ts'

const kb_chunks = {
  id: f.pk(z.uuid()),
  agent_id: f.req(z.uuid()),
  content: f.req(z.string()),
  document_id: z.uuid().nullable(),
} satisfies Parameters<typeof createTypedQuery>[1][string]

const kb_documents = {
  id: f.pk(z.uuid()),
  filename: z.string().nullable(),
} satisfies Parameters<typeof createTypedQuery>[1][string]

// ── tsd 断言（typecheck:tests 守卫面） ─────────────────────

test('typedQuery：tsd——跨表 join 行类型精确（正向 + 负向红）', async () => {
  const db = createMemoryOrm(); const orm = db.orm
  db.mem.applySchema({ tables: [{ name: 'kb_chunks', columns: kb_chunks }, { name: 'kb_documents', columns: kb_documents }] })
  orm.table('kb_chunks', kb_chunks)
  orm.table('kb_documents', kb_documents)
  const q = createTypedQuery(orm, { kb_chunks, kb_documents })
  // 数据（pk 自动 gen_random_uuid——insert 面省略；返回行含 id 供关联）
  const doc = await orm.table('kb_documents', kb_documents).insert([{ filename: 'a.pdf' }]).run()
  await orm.table('kb_chunks', kb_chunks).insert([
    { agent_id: 'a1000000-0000-4000-8000-000000000001', content: 'hello', document_id: doc[0].id },
  ]).run()

  const rows = await q.from('kb_chunks kc')
    .join('kb_documents kd', { 'kd.id': { col: 'kc.document_id' } })
    .select('kc.id', 'kc.content', 'kd.filename')
    .where({ 'kc.agent_id': { eq: 'a1000000-0000-4000-8000-000000000001' } })
    .run()
  // 正向：键/值精确
  const id: string = rows[0].id
  const content: string = rows[0].content
  const filename: string | null = rows[0].filename
  // 负向：未知列红
  // @ts-expect-error —— kc 无 nonexistent 列（编译期红）
  rows[0].nonexistent
  void id; void content; void filename
})

test('typedQuery：tsd——裸列=主表 + 未知 alias 红', async () => {
  const db = createMemoryOrm(); const orm = db.orm
  db.mem.applySchema({ tables: [{ name: 'kb_chunks', columns: kb_chunks }] })
  orm.table('kb_chunks', kb_chunks)
  const q = createTypedQuery(orm, { kb_chunks })
  await orm.table('kb_chunks', kb_chunks).insert([
    { agent_id: 'a1000000-0000-4000-8000-000000000001', content: 'hello' },
  ]).run()
  const rows = await q.from('kb_chunks').select('content', 'document_id').where({ agent_id: { eq: 'a1000000-0000-4000-8000-000000000001' } }).run()
  const c: string = rows[0].content
  const d: string | null = rows[0].document_id
  // @ts-expect-error —— zz 未注册 alias（select 列编译期红）
  q.from('kb_chunks').select('zz.id')
  // @ts-expect-error —— where 非法列红（zz 未注册）
  q.from('kb_chunks').where({ 'zz.id': { eq: 'x' } })
  void c; void d
})

test('typedQuery：tsd——aggregate/vectorScore AS 键并入行', async () => {
  const db = createMemoryOrm(); const orm = db.orm
  db.mem.applySchema({ tables: [{ name: 'kb_chunks', columns: kb_chunks }] })
  orm.table('kb_chunks', kb_chunks)
  const q = createTypedQuery(orm, { kb_chunks })
  // 聚合键并入（number）
  const agg = await q.from('kb_chunks')
    .select('agent_id')
    .count('*', 'n')
    .run()
  const n: number = agg[0].n
  const agentId: string = agg[0].agent_id
  void n; void agentId
})

test('typedQuery：运行时——SelectBuilder 链转发（契约语义等价 query.from）', async () => {
  const db = createMemoryOrm(); const orm = db.orm
  db.mem.applySchema({ tables: [{ name: 'kb_chunks', columns: kb_chunks }, { name: 'kb_documents', columns: kb_documents }] })
  orm.table('kb_chunks', kb_chunks)
  orm.table('kb_documents', kb_documents)
  // 数据（pk 自动生成——返回行 id 供 join 关联）
  const docs = await orm.table('kb_documents', kb_documents).insert([
    { filename: 'a.pdf' },
    { filename: 'b.pdf' },
  ]).run()
  await orm.table('kb_chunks', kb_chunks).insert([
    { agent_id: 'a1000000-0000-4000-8000-000000000001', content: 'hello', document_id: docs[0].id },
    { agent_id: 'a1000000-0000-4000-8000-000000000001', content: 'world', document_id: docs[1].id },
    { agent_id: 'a1000000-0000-4000-8000-000000000002', content: 'other', document_id: docs[0].id },
  ]).run()

  const q = createTypedQuery(orm, { kb_chunks, kb_documents })
  const rows = await q.from('kb_chunks kc')
    .join('kb_documents kd', { 'kd.id': { col: 'kc.document_id' } })
    .select('kc.id', 'kc.content', 'kd.filename')
    .where({ 'kc.agent_id': { eq: 'a1000000-0000-4000-8000-000000000001' } })
    .orderBy('kc.content', 'asc')
    .run()
  assert.equal(rows.length, 2)
  assert.ok(rows[0].id.length > 0)
  assert.equal(rows[0].filename, 'a.pdf')
  assert.equal(rows[1].content, 'world')
  assert.deepEqual(Object.keys(rows[0]).sort(), ['content', 'filename', 'id'])
})

test('typedQuery：运行时——聚合 + vectorScore 投影转发', async () => {
  const db = createMemoryOrm(); const orm = db.orm
  db.mem.applySchema({ tables: [{ name: 'kb_chunks', columns: kb_chunks }] })
  orm.table('kb_chunks', kb_chunks)

  await orm.table('kb_chunks', kb_chunks).insert([
    { id: 'c2000000-0000-4000-8000-000000000001', agent_id: 'a1000000-0000-4000-8000-000000000001', content: 'x', document_id: null },
    { id: 'c2000000-0000-4000-8000-000000000002', agent_id: 'a1000000-0000-4000-8000-000000000001', content: 'y', document_id: null },
  ]).run()
  const q = createTypedQuery(orm, { kb_chunks })
  const agg = await q.from('kb_chunks').count('*', 'n').run()
  assert.equal(agg[0].n, 2)
  // vectorScore 转发（memory 引擎支持——项目已有契约）
  const scored = await q.from('kb_chunks').select('content').vectorScore('embedding', [0.1, 0.2], 'similarity').run()
  assert.ok(Array.isArray(scored))
})

test('W4：enum 字面量推断 + vector 断言——tsd（W1 登记失效断言恢复）', async () => {
  // A) z.enum 字面量 tuple（U 技巧——修复 ZodEnum<[string,string]> 坍缩）
  const En = z.enum(['ai', 'user'])
  type Ev = Infer<typeof En>
  const ev: Ev = 'ai'
  // @ts-expect-error —— 'robot' 不在枚举（编译期红——W1 登记：eq(type,'robot') 无编译错）
  const bad: Ev = 'robot'
  void ev; void bad
  // B) eq(type, 'robot') 红（typedQuery 面——列型字面量传播）
  const db = createMemoryOrm(); const orm = db.orm
  const agentsCols = { id: z.string(), type: z.enum(['ai', 'user', 'webhook']) }
  orm.table('agents_types', agentsCols)
  const q = createTypedQuery(orm, { agents_types: agentsCols })
  void q.from('agents_types').where({ type: { eq: 'ai' } })
  // @ts-expect-error —— eq type:'robot'（枚举外——编译期红）
  void q.from('agents_types').where({ type: { eq: 'robot' } })
  // C) z.vector Infer = number[]（S2——embedding 不再 unknown）
  const V = z.vector(1024)
  const vec: Infer<typeof V> = [0.1, 0.2]
  void vec
  // D) W2 判负登记：undefined 的编译期拒绝**不可行**——可选属性 `eq?: V` 的
  // undefined 面（无 exactOptionalPropertyTypes）恒绿——TS 条件类型惰性+可选
  // 属性语义——不做 exactOptionalPropertyTypes 迁移（全局风险判负）——
  // undefined 的权威拒绝在**运行时**（qb 入口/filterToWhere/compile/execution
  // 四层同语义——fuzz 3 种子×201 对双面对账绿）
})
