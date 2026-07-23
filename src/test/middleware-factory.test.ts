/**
 * weifuwu createMiddleware — 中间件工厂测试
 */

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../core/router.ts'
import { serve } from '../core/serve.ts'

const { createMiddleware } = await import('../types.ts')

describe('createMiddleware', () => {
  it('注入字段到 ctx', async () => {
    const myMw = createMiddleware({
      injects: ['greeting'],
      setup: () => ({ greeting: 'hello world' }),
    })

    const app = new Router()
      .use(myMw)
      .get('/', (req, ctx) => {
        return new Response((ctx as any).greeting)
      })

    const s = serve(app, { port: 0, shutdown: false })
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/`)
    assert.equal(await res.text(), 'hello world')
    await s.close()
  })

  it('异步 setup 支持', async () => {
    const myMw = createMiddleware({
      injects: ['value'],
      setup: async () => ({ value: 'async' }),
    })

    const app = new Router()
      .use(myMw)
      .get('/', (req, ctx) => new Response((ctx as any).value))

    const s = serve(app, { port: 0, shutdown: false })
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/`)
    assert.equal(await res.text(), 'async')
    await s.close()
  })

  it('中间件可以读取已有 ctx 字段', async () => {
    // 先用普通中间件注入一个字段
    const firstMw: any = (req: any, ctx: any, next: any) => {
      ctx.base = 'prefix'
      return next(req, ctx)
    }
    firstMw.__meta = { injects: ['base'], depends: [] }

    const secondMw = createMiddleware({
      injects: ['combined'],
      depends: ['base'],
      setup: (ctx) => ({ combined: (ctx as any).base + '-suffix' }),
    })

    const app = new Router()
      .use(firstMw)
      .use(secondMw)
      .get('/', (req, ctx) => new Response((ctx as any).combined))

    const s = serve(app, { port: 0, shutdown: false })
    await s.ready
    const res = await fetch(`http://localhost:${s.port}/`)
    assert.equal(await res.text(), 'prefix-suffix')
    await s.close()
  })

  it('自动附带 __meta 元信息', () => {
    const myMw = createMiddleware({
      injects: ['a', 'b'],
      depends: ['sql'],
      setup: () => ({ a: 1, b: 2 }),
    })
    assert.deepEqual(myMw.__meta, { injects: ['a', 'b'], depends: ['sql'] })
  })
})
