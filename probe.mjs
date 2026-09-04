import { createOrm, memoryAdapter } from './src/server/db/orm.ts'
import { MemorySql } from './src/server/db/memory-sql.ts'
import { z } from './src/shared/zod.ts'
import { f } from './src/server/db/shape.ts'
const mem = new MemorySql()
const orm = createOrm(memoryAdapter(mem))
await orm.execute('CREATE TABLE probe_t (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), created_at TIMESTAMPTZ DEFAULT NOW(), email TEXT)')
const T = orm.table('probe_t', { id: f.pk(z.uuid()), created_at: f.now(z.date()), email: z.string() } as never)
// 1. insert 显式 returning（用户传字段名）
try {
  const r = await T.insert({ email: 'a@b.c' }).returning('email').run()
  console.log('[1] explicit returning email:', JSON.stringify(r))
} catch (e) { console.log('[1] explicit returning:', e.constructor.name, e.message) }
// 2. date 返回值形态
const r2 = await T.select().run()
console.log('[2] row values:', JSON.stringify(r2[0]), 'typeof created_at:', typeof r2[0]?.created_at)
// 3. z.date() 传 Date 对象
try {
  const r3 = await T.insert({ email: 'd@e.f', created_at: new Date() }).run()
  console.log('[3] Date 对象插入 ok:', JSON.stringify(r3[0]?.created_at))
} catch (e) { console.log('[3] Date 对象插入:', e.constructor.name, e.message) }
// 4. tx 内 table 免 shapeDef（现状）
await orm.transaction(async (tx) => {
  const t = tx.table('probe_t')
  console.log('[4] tx.table(name) 无 shapeDef:', t ? 'ok' : 'undefined')
}).catch((e) => { console.log('[4] tx.table(name) 无 shapeDef:', e.constructor.name) })
