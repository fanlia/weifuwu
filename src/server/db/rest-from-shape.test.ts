/**
 * W4 契约：restFromShape —— shape → RESTful 路由组（样板 handler 生成）
 *
 * 锁定：路由矩阵（list/one/insert/update/delete）· query 参数 schema 派生
 * （枚举白名单/sort 白名单/limit clamp）· 404/204 语义 · fieldPolicy.hidden ·
 * hooks 接缝（业务 handler 插点）· 租户 scope（ctxTable 自动隔离）
 */
import assert from 'node:assert/strict'
import { test, before } from 'node:test'
import { Router } from '../core/router.ts'
import type { Handler, Context } from '../types.ts'
import { postgres } from '../postgres/client.ts'
import { restFromShape } from './rest-from-shape.ts'
import { shape, f } from './shape.ts'
import { z } from '../../shared/zod.ts'

const Agents = shape({
  table: 'agentes',
  fields: {
    id: f.pk(z.uuid()),
    appId: f.req(f.col(z.uuid(), 'app_id')),
    type: f.req(z.enum(['ai', 'user', 'webhook'])),
    name: f.req(z.string()),
    secret: f.req(f.col(z.string(), 'secret_col')),
  },
})

let pg: ReturnType<typeof postgres>
let handle: Handler<Context>
let ID_A = ''
let ID_B = ''

before(async () => {
  pg = postgres({ memory: true, tenant: { field: 'appId', value: (c: unknown) => (c as { appId?: string })?.appId } })
  await pg.migrateModule('rest_test', { tables: [{ name: 'agentes', columns: Agents.fields as never }] })
  const orm = pg.orm
  // 注册 face 与 rest shape 同构（Agents.fields 单源——insertSchema/校验一致）
  orm.table('agentes', Agents.fields as never)
  // 播种两个租户（ctxTable 自动注入 appId）
  const APP_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const APP_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  const scoped = orm.withCtx({ appId: APP_A })
  const insA = await scoped.ctxTable('agentes').insert([
    { type: 'ai', name: '甲', secret: 'S1' },
  ]).returning('id').run()
  ID_A = insA[0].id as string
  const scopedB = orm.withCtx({ appId: APP_B })
  const insB = await scopedB.ctxTable('agentes').insert([
    { type: 'user', name: '乙', secret: 'S2' },
  ]).returning('id').run()
  ID_B = insB[0].id as string

  const app = new Router()
  app.use(pg)
  restFromShape(Agents, { hidden: ['secret'] }).mount(app as never, '/api/agentes')
  handle = app.handler()
})

function req(method: string, path: string, body?: unknown, ctx?: object): Promise<Response> {
  // Handler 允许同步/异步返回——Promise.resolve 归一（类型面）
  return Promise.resolve(handle(new Request(`http://localhost${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  }) as never, { params: {}, query: {}, appId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', ...ctx } as never))
}

// ── 路由矩阵 ──────────────────────────────────────────────

test('W4：GET list——eq 直排 + 分页 + 租户隔离（ctxTable 自动 scope）', async () => {
  const r = await req('GET', '/api/agentes')
  assert.equal(r.status, 200)
  const body = await r.json() as { agentes: { name: string }[]; total: number }
  assert.deepEqual(body.agentes.map((x) => x.name), ['甲'], 'app-a 只见自己')
  assert.equal(body.total, 1)
  // eq 直排过滤（?type=user——app-a 无 user）
  const r2 = await req('GET', '/api/agentes?type=user')
  const b2 = await r2.json() as { agentes: unknown[] }
  assert.equal(b2.agentes.length, 0)
})

test('W4：GET one——200 + 404 + 跨租户不可见', async () => {
  const r = await req('GET', `/api/agentes/${ID_A}`)
  assert.equal(r.status, 200)
  assert.equal((await r.json() as { name: string }).name, '甲')
  const r404 = await req('GET', '/api/agentes/none')
  assert.equal(r404.status, 404)
  const rb = await req('GET', `/api/agentes/${ID_A}`, undefined, { appId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' })
  assert.equal(rb.status, 404, '跨租户 scope 命中 404')
})

test('W4：POST insert——201 + 校验 400', async () => {
  const r = await req('POST', '/api/agentes', { type: 'ai', name: '丙', secret: 'S3' })
  assert.equal(r.status, 201)
  const body = await r.json() as { id: string; name: string }
  assert.equal(body.name, '丙')
  // insertSchema 校验（缺必填 type）
  const bad = await req('POST', '/api/agentes', { name: '缺 type' })
  assert.equal(bad.status, 400)
})

test('W4：PATCH update——200 + 404；DELETE——204 + 404', async () => {
  const created = await req('POST', '/api/agentes', { type: 'ai', name: '丁', secret: 'S4' })
  const { id } = await created.json() as { id: string }
  const up = await req('PATCH', `/api/agentes/${id}`, { name: '丁二' })
  assert.equal(up.status, 200)
  assert.equal((await up.json() as { name: string }).name, '丁二')
  const del = await req('DELETE', `/api/agentes/${id}`)
  assert.equal(del.status, 204)
  const gone = await req('GET', `/api/agentes/${id}`)
  assert.equal(gone.status, 404)
})

// ── 参数 schema 派生 ───────────────────────────────────────

test('W4：query 参数 schema——枚举白名单 400 · sort 白名单 400 · limit clamp', async () => {
  const badEnum = await req('GET', '/api/agentes?type=robot')
  assert.equal(badEnum.status, 400)
  const badSort = await req('GET', '/api/agentes?sort=bogus')
  assert.equal(badSort.status, 400)
  const clamped = await req('GET', '/api/agentes?limit=99999&sort=-type')
  assert.equal(clamped.status, 200)
})

// ── fieldPolicy.hidden ────────────────────────────────────

test('W4：hidden——list/one/POST 返回不含敏感列（secret 字段豁免）', async () => {
  const list = await req('GET', '/api/agentes')
  const body = await list.json() as { agentes: Record<string, unknown>[] }
  assert.ok(!('secret' in body.agentes[0]), 'list 无 secret')
  assert.ok(!('secret_col' in body.agentes[0]), 'DB 列名也不泄漏')
  const one = await req('GET', `/api/agentes/${ID_A}`)
  assert.ok(!('secret' in (await one.json() as Record<string, unknown>)))
  const created = await req('POST', '/api/agentes', { type: 'ai', name: '戊', secret: 'S5' })
  assert.ok(!('secret' in (await created.json() as Record<string, unknown>)))
})

// ── orm.rest 入口（对称面——命名契约：orm.table/orm.gql/orm.rest） ──

test('W4：orm.rest 入口——与 restFromShape 同构（__shape 单源）', async () => {
  const app3 = new Router()
  app3.use(pg)
  const rest = pg.orm.rest(pg.orm.table('agentes'), { hidden: ['secret'] })
  rest.mount(app3 as never, '/api/agentes3')
  const h3 = app3.handler()
  const r = await h3(new Request('http://localhost/api/agentes3', { method: 'GET' }), { params: {}, query: {}, appId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never)
  assert.equal(r.status, 200)
  const body = await r.json() as { agentes: { name: string }[] }
  assert.ok(body.agentes.some((x) => x.name === '甲'), '入口面与 restFromShape 同输出')
  // 未注册表 → 明确错误（不静默）
  assert.throws(() => pg.orm.rest(pg.orm.table('nope')), /未注册/)
})

// ── hooks 接缝（业务 handler 插点——分层纪律） ────────────────

test('W4：hooks——beforeList 权限守卫（viewer 拒绝）+ afterList 响应增强', async () => {
  const app2 = new Router()
  app2.use(pg)
  restFromShape(Agents, {
    hidden: ['secret'],
    hooks: {
      beforeList: (_req, ctx) => {
        if ((ctx as { role?: string }).role === 'viewer') throw new Error('viewer 无权')
      },
      afterList: (rows) => rows.map((r) => ({ ...r, annotated: true })),
    },
  }).mount(app2 as never, '/api/agentes2')
  const h2 = app2.handler()
  const ok = await h2(new Request('http://localhost/api/agentes2', { method: 'GET' }), { params: {}, query: {}, appId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never)
  assert.equal(ok.status, 200)
  const body = await ok.json() as { agentes: { annotated?: boolean }[] }
  assert.ok(body.agentes.every((x) => x.annotated), 'afterList 增强生效')
  const denied = await h2(new Request('http://localhost/api/agentes2', { method: 'GET' }), { params: {}, query: {}, appId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', role: 'viewer' } as never)
  assert.equal(denied.status, 400, 'beforeList 抛错 → 400（业务守卫拒绝——接缝生效）')
})
