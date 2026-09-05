/**
 * W1 契约：listQuery + errorResponse —— 协议面 helpers（rest 私有提取共享）
 *
 * 锁定：eq 直排 · sort `-field` 多字段 · limit/offset clamp（默认 20/max 100）·
 * 枚举白名单/未知 sort 字段校验（抛错——调用方 errorResponse 400）·
 * errorResponse 状态码映射（DbError validation→400 · 23505→409 ·
 * 显式 status 优先 403）。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { listQuery, errorResponse } from './http.ts'
import { shape, f } from './shape.ts'
import { z } from '../../shared/zod.ts'
import { DbError, ValidationError } from './errors.ts'

const Agents = shape({
  table: 'agents',
  fields: {
    id: f.pk(z.uuid()),
    appId: f.req(f.col(z.uuid(), 'app_id')),
    type: f.req(z.enum(['ai', 'user'])),
    name: f.req(z.string()),
    createdAt: f.now(z.date()),
  },
})

function urlOf(qs: string): URL {
  return new URL(`http://localhost/api/agents${qs}`)
}

// ── listQuery ─────────────────────────────────────────────

test('W1：listQuery——eq 直排 + sort 多字段（-desc 前缀）', () => {
  const r = listQuery(urlOf('?type=ai&sort=-createdAt,name&offset=10&limit=5'), Agents as never)
  assert.deepEqual(r.filter, { type: { eq: 'ai' } })
  assert.deepEqual(r.sort, [{ field: 'createdAt', dir: 'desc' }, { field: 'name', dir: 'asc' }])
  assert.equal(r.limit, 5)
  assert.equal(r.offset, 10)
})

test('W1：listQuery——limit clamp（默认 20/max 100）+ offset clamp', () => {
  const d = listQuery(urlOf(''), Agents as never)
  assert.equal(d.limit, 20)
  assert.equal(d.offset, 0)
  const m = listQuery(urlOf('?limit=9999'), Agents as never)
  assert.equal(m.limit, 100)
  const bad = listQuery(urlOf('?limit=-3'), Agents as never)
  assert.equal(bad.limit, 1, '负值 → clamp 到 1（rest 原行为）')
  const o = listQuery(urlOf('?offset=-5'), Agents as never)
  assert.equal(o.offset, 0)
})

test('W1：listQuery——枚举白名单校验（错值抛——400 面）', () => {
  assert.throws(() => listQuery(urlOf('?type=robot'), Agents as never), /invalid enum value for type/)
})

test('W1：listQuery——未知 sort 字段校验（抛——400 面）', () => {
  assert.throws(() => listQuery(urlOf('?sort=bogus'), Agents as never), /invalid sort field: bogus/)
})

test('W1：listQuery——maxLimit 可配（rest opts 面）', () => {
  const r = listQuery(urlOf('?limit=50'), Agents as never, { maxLimit: 30 })
  assert.equal(r.limit, 30)
})

// ── errorResponse ─────────────────────────────────────────

test('W1：errorResponse——DbError 映射（validation→400 · 23505→409）', async () => {
  const v = errorResponse(new ValidationError('参数校验失败：name'))
  assert.equal(v.status, 400)
  const u = errorResponse(new DbError('protocol', 'unique_violation', { code: '23505' }))
  assert.equal(u.status, 409)
  const body = await u.json() as { error: string }
  assert.ok(body.error.includes('unique_violation'))
})

test('W1：errorResponse——显式 status 优先（业务守卫 403）+ 普通 Error→400', () => {
  const g = errorResponse(new Error('viewer 无权'), 403)
  assert.equal(g.status, 403)
  const e = errorResponse(new Error('bogus'))
  assert.equal(e.status, 400)
  const s = errorResponse('字符串错误')
  assert.equal(s.status, 400)
})
