/**
 * weifuwu request helpers — 请求解析辅助函数测试
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const { parseBody } = await import('../request.ts')
const { HttpError } = await import('../types.ts')

describe('parseBody', () => {
  it('解析 JSON 请求体', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Alice', age: 30 }),
    })
    const body = await parseBody<{ name: string; age: number }>(req)
    assert.equal(body.name, 'Alice')
    assert.equal(body.age, 30)
  })

  it('GET 请求返回空对象', async () => {
    const req = new Request('http://localhost', { method: 'GET' })
    const body = await parseBody(req)
    assert.deepEqual(body, {})
  })

  it('无效 JSON 抛出 HttpError 400', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not-json',
    })
    try {
      await parseBody(req)
      assert.fail('应抛出错误')
    } catch (e) {
      assert.ok(e instanceof HttpError)
      assert.equal((e as HttpError).status, 400)
      assert.ok((e as HttpError).message.includes('Invalid JSON'))
    }
  })

  it('空 body 抛出 HttpError 400', async () => {
    const req = new Request('http://localhost', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    try {
      await parseBody(req)
      assert.fail('应抛出错误')
    } catch (e) {
      assert.ok(e instanceof HttpError)
      assert.equal((e as HttpError).status, 400)
    }
  })
})
