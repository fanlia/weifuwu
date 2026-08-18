/**
 * weifuwu response helpers — HTTP 响应辅助函数测试
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const {
  ok, created, noContent, badRequest, unauthorized, forbidden,
  notFound, conflict, unprocessable, tooManyRequests, serverError, redirect,
} = await import('../response.ts')

describe('response helpers', () => {
  it('ok: 200 + JSON', async () => {
    const res = ok({ id: 1, name: 'Alice' })
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('content-type'), 'application/json')
    assert.deepEqual(await res.json(), { id: 1, name: 'Alice' })
  })

  it('ok: 可覆盖 status', async () => {
    const res = ok('ok', { status: 201 })
    assert.equal(res.status, 201)
  })

  it('created: 201 + JSON', async () => {
    const res = created({ id: 42 })
    assert.equal(res.status, 201)
    assert.deepEqual(await res.json(), { id: 42 })
  })

  it('noContent: 204', () => {
    const res = noContent()
    assert.equal(res.status, 204)
    assert.equal(res.body, null)
  })

  it('badRequest: 400 + error message', async () => {
    const res = badRequest('名称不能为空')
    assert.equal(res.status, 400)
    const body = await res.json() as any
    assert.equal(body.error, '名称不能为空')
  })

  it('badRequest: 默认错误消息', async () => {
    const res = badRequest()
    const body = await res.json() as any
    assert.equal(body.error, 'Bad Request')
  })

  it('unauthorized: 401', async () => {
    const res = unauthorized('Token 已过期')
    assert.equal(res.status, 401)
    const body = await res.json() as any
    assert.equal(body.error, 'Token 已过期')
  })

  it('forbidden: 403', async () => {
    const res = forbidden()
    assert.equal(res.status, 403)
  })

  it('notFound: 404', async () => {
    const res = notFound('用户不存在')
    assert.equal(res.status, 404)
    const body = await res.json() as any
    assert.equal(body.error, '用户不存在')
  })

  it('conflict: 409', async () => {
    const res = conflict('邮箱已注册')
    assert.equal(res.status, 409)
  })

  it('unprocessable: 422', async () => {
    const res = unprocessable('验证失败')
    assert.equal(res.status, 422)
  })

  it('tooManyRequests: 429', async () => {
    const res = tooManyRequests()
    assert.equal(res.status, 429)
  })

  it('serverError: 500', async () => {
    const res = serverError('数据库连接失败')
    assert.equal(res.status, 500)
  })

  it('redirect: 302 + Location', () => {
    const res = redirect('/login')
    assert.equal(res.status, 302)
    assert.equal(res.headers.get('Location'), '/login')
  })

  it('redirect: 301 永久重定向', () => {
    const res = redirect('/new-page', 301)
    assert.equal(res.status, 301)
    assert.equal(res.headers.get('Location'), '/new-page')
  })
})
