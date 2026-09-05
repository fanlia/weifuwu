/**
 * W0 api 计划契约：errorResponse 总错误面（单源——HTTP 链/route 内 catch 同函数）
 *
 * 锁定：code 面（{ error, code }——validation/conflict/kind——前端可 switch）·
 * 双层语义（链面普通 Error→500 / route 内→400——有意分层）· HttpError status
 * 权威 · DbError 23505→409·其余→400 · 显式 status 优先。
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { errorResponse, ok, created, badRequest, forbidden, notFound } from './response.ts'
import { HttpError } from './types.ts'
import { DbError, ValidationError, ProtocolError } from './db/errors.ts'

test('W0：errorResponse——code 面（validation/conflict/kind——可 switch 编程）', async () => {
  const v = await errorResponse(new ValidationError('参数校验失败（agents）：name: 必填')).json() as Record<string, unknown>
  assert.equal(v.code, 'validation')
  assert.ok(v.error?.toString().includes('name'), 'message 可读保留（前端 errMsg 兼容）')
  const c = await errorResponse(new DbError('protocol', 'unique_violation', { code: '23505' })).json() as Record<string, unknown>
  assert.equal(c.code, 'conflict', '23505 → 语义码 conflict（非 pg 内部码）')
  const p = await errorResponse(new ProtocolError('COPY')).json() as Record<string, unknown>
  assert.equal(p.code, 'protocol')
})

test('W0：errorResponse——状态码矩阵（DbError/HttpError/普通 Error/显式 status）', () => {
  assert.equal(errorResponse(new ValidationError('x')).status, 400)
  assert.equal(errorResponse(new DbError('protocol', 'u', { code: '23505' })).status, 409)
  assert.equal(errorResponse(new DbError('protocol', 'c')).status, 400)
  assert.equal(errorResponse(new HttpError('无权', 403)).status, 403)
  assert.equal(errorResponse(new HttpError('孤儿', 404)).status, 404)
  assert.equal(errorResponse(new Error('业务守卫')).status, 400, 'route 内 catch——已知业务 → 400')
  assert.equal(errorResponse(new Error('守卫'), 403).status, 403, '显式 status 优先')
  assert.equal(errorResponse(new Error('意外'), 500).status, 500)
  assert.equal(errorResponse('字符串错误').status, 400)
})

test('W0：HttpError 无 code（status 已是语义——不冗余）', async () => {
  const h = await errorResponse(new HttpError('没找到', 404)).json() as Record<string, unknown>
  assert.equal(h.code, undefined)
  assert.equal(h.error, '没找到')
})

test('W0：response helpers 面（ok/created/badRequest——错误面同家族）', async () => {
  assert.equal((await ok({ a: 1 }).json()).a, 1)
  assert.equal(ok({}).status, 200)
  assert.equal(created({ id: 'x' }).status, 201)
  assert.equal(badRequest('坏').status, 400)
})

test('W1：throw 与 return 等价——同一 HttpError 双面同形状同状态（迁移依据）', async () => {
  // 面 A：route 内 return errorResponse(e)（迁移前形态）
  const a = errorResponse(new HttpError('无权', 403))
  // 面 B：throw 经链捕获（迁移后形态——路由链回归经 router.test 验证）
  const { Router } = await import('./core/router.ts')
  const r = new Router().get('/', () => { throw new HttpError('无权', 403) })
  const b = await r.handler()(new Request('http://localhost/'), { params: {}, query: {} } as never)
  assert.equal(a.status, b.status)
  assert.deepEqual(await a.json(), await b.json())
})

test('W1：errorResponse 家族矩阵——helpers 全走单源（badRequest/forbidden/notFound 等价 HttpError 语义）', async () => {
  const cases: Array<[Response, number, string]> = [
    [badRequest('参数错'), 400, '参数错'],
    [forbidden('无权'), 403, '无权'],
    [notFound('不见'), 404, '不见'],
    [errorResponse(new HttpError('冲突', 409)), 409, '冲突'],
  ]
  for (const [res, status, msg] of cases) {
    assert.equal(res.status, status)
    const body = await res.json()
    assert.equal((body as Record<string, unknown>).error, msg)
  }
})
