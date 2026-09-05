/**
 * W3 契约：checkConsistency —— 声明（orm 注册表）vs 实况（库 schema）diff。
 *
 * 锁定：表缺失/列缺失 error（必须修）· 类型不匹配 warn（宽等价组不误报）·
 * 表/列残留 warn · 纯函数双后端共用（真库 information_schema / memory
 * schemaSnapshot——同 diff）· 零参数（registry 自动枚举——惰性注册先
 * tables(orm) 先行）。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { diffConsistency, normalizeType } from './consistency.ts'
import { f, shape } from './shape.ts'
import { z } from '../../shared/zod.ts'
import { postgres } from '../postgres/client.ts'

const Users = shape({
  table: 'users',
  fields: {
    id: f.pk(z.uuid()).meta({ pk: true, default: 'random' }),
    appId: f.col(z.uuid(), 'app_id'),
    name: z.string(),
    age: z.number().int().meta({ default: 0 }),
  },
})

test('W3：diffConsistency——表缺失/列缺失 error（声明有库无）', () => {
  const decl = [{ name: 'users', fields: Users.fields as never, dbFields: Users.dbFields as never }]
  const r = diffConsistency(decl, [{ name: 'users', columns: [{ name: 'id', type: 'uuid' }, { name: 'app_id', type: 'uuid' }] }])
  assert.equal(r.ok, false)
  const errs = r.issues.filter((i) => i.level === 'error')
  assert.equal(errs.length, 2, 'name + age 均缺失')
  assert.ok(errs.some((i) => i.kind === 'column-missing' && i.column === 'name'))
  const r2 = diffConsistency(decl, [{ name: 'other', columns: [] }])
  assert.equal(r2.issues[0].kind, 'table-missing')
})

test('W3：diffConsistency——类型不匹配 warn（宽等价组不误报）', () => {
  const decl = [{ name: 'users', fields: Users.fields as never, dbFields: Users.dbFields as never }]
  // varchar/text 等价（不报）——age INT vs DOUBLE PRECISION（报）
  const r = diffConsistency(decl, [
    { name: 'users', columns: [
      { name: 'id', type: 'uuid' }, { name: 'app_id', type: 'uuid' },
      { name: 'name', type: 'character varying' }, { name: 'age', type: 'double precision' },
    ] },
  ])
  const mism = r.issues.filter((i) => i.kind === 'type-mismatch')
  assert.equal(mism.length, 1, '仅 age 报（INT vs double precision）')
  assert.equal(r.ok, true, '全 warn（type-mismatch 不阻断——ok true）')
})

test('W3：diffConsistency——列缺失全绿·残留 warn（库侧无声明的表/列）', () => {
  const decl = [{ name: 'users', fields: Users.fields as never, dbFields: Users.dbFields as never }]
  const r = diffConsistency(decl, [
    { name: 'users', columns: [
      { name: 'id', type: 'uuid' }, { name: 'app_id', type: 'uuid' },
      { name: 'name', type: 'text' }, { name: 'age', type: 'integer' },
    ] },
    { name: 'legacy', columns: [{ name: 'x', type: 'text' }] },
  ])
  assert.equal(r.ok, true, '声明面全绿（残留仅 warn）')
  const warns = r.issues.filter((i) => i.level === 'warn')
  assert.ok(warns.some((i) => i.kind === 'table-extra' && i.table === 'legacy'))
})

test('W3：normalizeType——宽等价组（text 家族/时间族/json 族）', () => {
  assert.equal(normalizeType('VARCHAR(255)'), 'text')
  assert.equal(normalizeType('character varying'), 'text')
  assert.equal(normalizeType('TIMESTAMP WITH TIME ZONE'), 'timestamptz')
  assert.equal(normalizeType('JSON'), 'jsonb')
  assert.equal(normalizeType('JSONB'), 'jsonb')
  assert.equal(normalizeType('BIGINT'), 'int8')
})

test('W3：pg memory 面——checkConsistency 端到端（migrateModule 后全绿·缺列报错）', async () => {
  const pg = postgres({ memory: true })
  await pg.migrate()
  await pg.migrateModule('users', { tables: [{ name: 'users', columns: { id: z.uuid().meta({ pk: true, default: 'random' }), app_id: z.uuid(), name: z.string(), age: z.number().int().meta({ default: 0 }) } }] })
  pg.orm.table('users', Users.fields as never)
  const ok = await pg.checkConsistency()
  assert.equal(ok.ok, true, '声明=库实况（migrateModule 后）——issues: ' + JSON.stringify(ok.issues))
  // 缺列场景：声明多一列（库无）——error
  pg.orm.table('users_full', { ...(Users.fields as Record<string, unknown>), extra: z.string() })
  await pg.migrateModule('users_full', { tables: [{ name: 'users_full', columns: { id: z.uuid(), name: z.string() } }] })
  const bad = await pg.checkConsistency()
  assert.equal(bad.ok, false)
  assert.ok(bad.issues.some((i) => i.kind === 'column-missing' && i.column === 'extra'))
  await pg.close()
})
