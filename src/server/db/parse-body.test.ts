/**
 * W0 契约：parseBody —— shape → body 校验面（handler 样板消失——开发者动线）
 *
 * 锁定：校验语义（enum/必填/nullable 缺省/default 缺省/auto 省略）· 类型面
 * （BodyOf 精确——auto 列拒绝·必填拒绝缺省·nullable 可缺省——tsd 断言）·
 * 错误语义（非法 JSON/非对象/校验失败——ValidationError 400 面可读）。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shape, f, type BodyOf, type PatchOf } from './shape.ts'
import { bodyOf } from './body.ts'
import { z, ZodString } from '../../shared/zod.ts'

const Agent = shape({
  table: 'agents',
  fields: {
    id: f.pk(z.uuid()),
    appId: f.req(f.col(z.uuid(), 'app_id')),
    type: f.req(z.enum(['ai', 'user', 'webhook'])),
    name: f.req(z.string()),
    model: z.string().nullable(),
    quota: f.dflt(z.number(), 0),
  },
})

function reqBody(body: unknown): Request {
  return new Request('http://localhost/api/agents', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

// ── 类型面（tsd——BodyOf/PatchOf 精确性） ────────────────────

test('W0 tsd：BodyOf——auto 列拒绝 · 字段名/枚举精确（可缺省面宽——运行时权威校验）', () => {
  type B = BodyOf<typeof Agent.fields>
  // 合法（无 id——auto 省略 · model/quota 可缺省）
  const ok: B = { appId: 'a1000000-0000-4000-8000-000000000001', type: 'ai', name: 'x' }
  const ok2: B = { appId: 'a1000000-0000-4000-8000-000000000001', type: 'ai', name: 'x', model: null, quota: 3 }
  // @ts-expect-error id 是 auto——body 类型面不含 id
  const bad1: B = { id: 'x', appId: 'a', type: 'ai', name: 'x' }
  // @ts-expect-error type 是 enum 字面量——'robot' 编译期红
  const bad3: B = { appId: 'a', type: 'robot', name: 'x' }
  assert.ok(ok.appId && ok2.quota === 3)
  void bad1; void bad3
})

test('W0 tsd：PatchOf——全字段可选（部分更新面）', () => {
  type P = PatchOf<typeof Agent.fields>
  const empty: P = {}
  const one: P = { name: '改名' }
  const withNull: P = { model: null }
  assert.ok(empty && withNull.model === null && one.name === '改名')
})

// ── 校验语义（运行时——与 insertSchema 对齐） ─────────────────

test('W0：parseBody insert——合法 body 通过（auto 省略·default 缺省）', async () => {
  const d = await bodyOf(reqBody({ appId: 'a1000000-0000-4000-8000-000000000001', type: 'ai', name: '甲' }), Agent)
  assert.equal(d.name, '甲')
  assert.equal(d.type, 'ai')
  // insertSchema 语义：quota 缺省（未定义键——cleanUndefined 删除）
  assert.ok(!('quota' in d), '缺省键不产生 undefined 残留')
})

test('W0：parseBody——enum 校验失败（可读错误）', async () => {
  await assert.rejects(
    bodyOf(reqBody({ appId: 'a1000000-0000-4000-8000-000000000001', type: 'robot', name: 'x' }), Agent),
    (e: Error) => e.message.includes('type') && e.message.includes('ai'),
    'enum 错误含字段与期望',
  )
})

test('W0：parseBody——必填缺失失败 · nullable/default 可缺省通过', async () => {
  // name 必填缺
  await assert.rejects(
    bodyOf(reqBody({ appId: 'a1000000-0000-4000-8000-000000000001', type: 'ai' }), Agent),
    (e: Error) => e.message.includes('name'),
  )
  // model（nullable）+ quota（default）均可缺省
  const d = await bodyOf(reqBody({ appId: 'a1000000-0000-4000-8000-000000000001', type: 'ai', name: 'x' }), Agent)
  assert.ok(!('model' in d) && !('quota' in d))
})

// ── 错误语义（400 面——非 JSON/非对象/变体） ──────────────────

test('W0：parseBody——非法 JSON / 非对象 → ValidationError 400 面', async () => {
  const bad = new Request('http://localhost/api/agents', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{not-json' })
  await assert.rejects(bodyOf(bad, Agent), /JSON/)
  const arr = reqBody([1, 2])
  await assert.rejects(bodyOf(arr, Agent), /对象/)
})

test('W0：parseBody patch 变体——全字段可选（部分更新）', async () => {
  const d = await bodyOf(reqBody({ name: '改名' }), Agent, { variant: 'patch' })
  assert.equal(d.name, '改名')
  const empty = await bodyOf(reqBody({}), Agent, { variant: 'patch' })
  assert.ok(!('name' in empty))
})

test('W0：parseBody 接受 OrmTable（__shape 解包——与 orm 面同源）', async () => {
  // 表实体形态（orm.table 返回——__shape 单源）——用 shape 实体的包装面
  const wrapped = { __shape: Agent } as never
  const d = await bodyOf(reqBody({ appId: 'a1000000-0000-4000-8000-000000000001', type: 'user', name: '乙' }), wrapped)
  assert.equal(d.type, 'user')
  void ZodString
})

test('W4：bodyOf omit——系统列（租户注入面）校验前剔除', async () => {
  const sh = shape({
    table: 'agents',
    fields: {
      id: f.pk(z.uuid()),
      appId: f.req(f.col(z.uuid(), 'app_id')),
      name: f.req(z.string()),
      type: f.req(z.enum(['ai', 'user'])),
    },
  })
  // app_id 传了也被忽略（注入面权威——不校验它的格式）
  const body = await bodyOf(reqOf({ app_id: 'not-a-uuid', name: '助手', type: 'ai' }), sh, { omit: ['appId', 'id'] })
  assert.equal(body.name, '助手')
  // omit 键不在 schema 校验面（app_id 必填豁免——租户注入面承担）
  const body2 = await bodyOf(reqOf({ name: 'x', type: 'user' }), sh, { omit: ['appId'] })
  assert.equal(body2.type, 'user')

  function reqOf(obj: unknown): Request {
    return new Request('http://localhost/api/agents', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(obj) })
  }
})
