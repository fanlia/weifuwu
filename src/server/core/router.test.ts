import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../core/router.ts'

function mkCtx() {
  return { params: {}, query: {} } as any
}

describe('Router', () => {
  describe('route registration', () => {
    it('GET / returns 200', async () => {
      const r = new Router().get('/', () => new Response('ok'))
      const res = await r.handler()(new Request('http://localhost/'), mkCtx())
      assert.equal(res.status, 200)
    })

    it('POST /submit returns 201', async () => {
      const r = new Router().post('/submit', () => new Response('created', { status: 201 }))
      const res = await r.handler()(new Request('http://localhost/submit', { method: 'POST' }), mkCtx())
      assert.equal(res.status, 201)
    })

    it('all() matches any method', async () => {
      const r = new Router().all('/any', () => new Response('ok'))
      assert.equal((await r.handler()(new Request('http://localhost/any'), mkCtx())).status, 200)
      assert.equal((await r.handler()(new Request('http://localhost/any', { method: 'POST' }), mkCtx())).status, 200)
    })

    it('HEAD falls back to GET', async () => {
      const r = new Router().get('/data', () => new Response('ok'))
      const res = await r.handler()(new Request('http://localhost/data', { method: 'HEAD' }), mkCtx())
      assert.equal(res.status, 200)
    })

    it('route conflict throws', () => {
      assert.throws(() => {
        new Router()
          .get('/dup', () => new Response('a'))
          .get('/dup', () => new Response('b'))
      })
    })

    it('静态/参数并存不误报 + value 不污染（trieFind 精确匹配——agent-platform 沙盒路由事故）', async () => {
      // `:id/:action`（POST）与 `:id/debug|processes|stats`（GET）并存——
      // 旧 trieFind 静态段用参数槽兜底——debug 注册时 GET 写进 POST action
      // 的 value——后续 :id/<静态段> 误报 conflict
      const r = new Router()
        .get('/api/sandboxes', () => new Response('list'))
        .get('/api/sandboxes/:id', () => new Response('one'))
        .post('/api/sandboxes/:id/:action', () => new Response('act'))
        .get('/api/sandboxes/:id/debug', () => new Response('dbg'))
        .get('/api/sandboxes/:id/processes', () => new Response('procs'))
        .get('/api/sandboxes/:id/stats', () => new Response('stats'))
      // 匹配正确：:action 参数段命中 POST；静态段命中各自 GET——无串台
      const res1 = await r.handler()(new Request('http://localhost/api/sandboxes/abc/start', { method: 'POST' }), mkCtx())
      assert.equal(await res1.text(), 'act')
      const res2 = await r.handler()(new Request('http://localhost/api/sandboxes/abc/processes'), mkCtx())
      assert.equal(await res2.text(), 'procs')
      const res3 = await r.handler()(new Request('http://localhost/api/sandboxes/abc/debug'), mkCtx())
      assert.equal(await res3.text(), 'dbg')
      // 未注册的 :id/<其他段> 命中 :action 槽——405（方法不符）——而非 200
      // （若 action 槽 value 被 GET handler 污染——会返回 'dbg' 串台）
      const res4 = await r.handler()(new Request('http://localhost/api/sandboxes/abc/other'), mkCtx())
      assert.equal(res4.status, 405)
    })
  })

  describe('path params', () => {
    it('extracts single param', async () => {
      const r = new Router().get('/users/:id', (req, ctx) => new Response(ctx.params.id))
      const res = await r.handler()(new Request('http://localhost/users/42'), mkCtx())
      assert.equal(await res.text(), '42')
    })

    it('extracts multiple params', async () => {
      const r = new Router().get('/org/:orgId/user/:userId', (req, ctx) =>
        new Response(`${ctx.params.orgId}/${ctx.params.userId}`))
      const res = await r.handler()(new Request('http://localhost/org/acme/user/bob'), mkCtx())
      assert.equal(await res.text(), 'acme/bob')
    })

    it('decodes URI components', async () => {
      const r = new Router().get('/search/:query', (req, ctx) => new Response(ctx.params.query))
      const res = await r.handler()(new Request('http://localhost/search/hello%20world'), mkCtx())
      assert.equal(await res.text(), 'hello world')
    })
  })

  describe('wildcard', () => {
    it('matches any path under prefix', async () => {
      const r = new Router().get('/static/*', (req, ctx) => new Response(ctx.params['*']))
      const res = await r.handler()(new Request('http://localhost/static/js/app.js'), mkCtx())
      assert.equal(await res.text(), 'js/app.js')
    })

    it('falls back to catch-all when path is a prefix of registered routes', async () => {
      // /dashboard 是 /dashboard/overview 的纯前缀节点：应回退到通配符
      const r = new Router()
        .get('/dashboard/overview', () => new Response('overview'))
        .get('*', () => new Response('spa-shell'))
      const res = await r.handler()(new Request('http://localhost/dashboard'), mkCtx())
      assert.equal(res.status, 200)
      assert.equal(await res.text(), 'spa-shell')
    })

    it('does NOT fall back to catch-all when path has a handler but wrong method (405)', async () => {
      const r = new Router()
        .post('/items', () => new Response('created'))
        .get('*', () => new Response('spa-shell'))
      const res = await r.handler()(new Request('http://localhost/items'), mkCtx())
      assert.equal(res.status, 405)
      assert.ok((res.headers.get('Allow') ?? '').includes('POST'))
    })
  })

  describe('status codes', () => {
    it('returns 404 for unknown route', async () => {
      const r = new Router().get('/known', () => new Response('ok'))
      const res = await r.handler()(new Request('http://localhost/unknown'), mkCtx())
      assert.equal(res.status, 404)
    })

    it('405 includes Allow header', async () => {
      const r = new Router()
        .get('/items', () => new Response('ok'))
        .post('/items', () => new Response('created'))
      const res = await r.handler()(new Request('http://localhost/items', { method: 'PATCH' }), mkCtx())
      assert.equal(res.status, 405)
      assert.ok((res.headers.get('Allow') ?? '').includes('GET'))
    })
  })

  describe('middleware', () => {
    it('global middleware runs before handler', async () => {
      const order: string[] = []
      const r = new Router()
        .use(async (req, ctx, next) => { order.push('mw'); return next(req, ctx) })
        .get('/', (req, ctx) => { order.push('handler'); return new Response('ok') })
      await r.handler()(new Request('http://localhost/'), mkCtx())
      assert.deepEqual(order, ['mw', 'handler'])
    })

    it('middleware can modify response', async () => {
      const r = new Router()
        .use(async (req, ctx, next) => {
          const res = await next(req, ctx)
          res.headers.set('x-custom', 'added')
          return res
        })
        .get('/', () => new Response('ok'))
      const res = await r.handler()(new Request('http://localhost/'), mkCtx())
      assert.equal(res.headers.get('x-custom'), 'added')
    })

    it('route-level middleware runs before handler', async () => {
      const order: string[] = []
      const r = new Router().get('/',
        async (req, ctx, next) => { order.push('rmw'); return next(req, ctx) },
        (req, ctx) => { order.push('handler'); return new Response('ok') })
      await r.handler()(new Request('http://localhost/'), mkCtx())
      assert.deepEqual(order, ['rmw', 'handler'])
    })

    it('middleware runs for 404', async () => {
      let mwRan = false
      const r = new Router().use(async (req, ctx, next) => { mwRan = true; return next(req, ctx) })
      await r.handler()(new Request('http://localhost/nope'), mkCtx())
      assert.ok(mwRan)
    })

    it('next() called twice returns 500', async () => {
      const r = new Router()
        .use(async (req, ctx, next) => {
          await next(req, ctx)
          return next(req, ctx) // second call throws
        })
        .get('/', () => new Response('ok'))
      const res = await r.handler()(new Request('http://localhost/'), mkCtx())
      assert.equal(res.status, 500)
    })
  })

  describe('error handling', () => {
    it('onError catches thrown errors', async () => {
      const r = new Router()
        .get('/', () => { throw new Error('boom') })
        .onError((err) => new Response(`caught: ${err.message}`, { status: 500 }))
      const res = await r.handler()(new Request('http://localhost/'), mkCtx())
      assert.equal(res.status, 500)
      assert.equal(await res.text(), 'caught: boom')
    })

    it('unhandled errors return 500', async () => {
      const r = new Router().get('/', () => { throw new Error('unhandled') })
      const res = await r.handler()(new Request('http://localhost/'), mkCtx())
      assert.equal(res.status, 500)
    })
  })

  describe('mount', () => {
    it('mounts sub-router at prefix', async () => {
      const admin = new Router().get('/dashboard', () => new Response('admin'))
      const app = new Router().mount('/admin', admin)
      const res = await app.handler()(new Request('http://localhost/admin/dashboard'), mkCtx())
      assert.equal(await res.text(), 'admin')
    })

    it('sub-router inherits global middleware', async () => {
      const order: string[] = []
      const admin = new Router().get('/dash', () => { order.push('h'); return new Response('ok') })
      const app = new Router()
        .use(async (req, ctx, next) => { order.push('mw'); return next(req, ctx) })
        .mount('/a', admin)
      await app.handler()(new Request('http://localhost/a/dash'), mkCtx())
      assert.deepEqual(order, ['mw', 'h'])
    })

    it('routes() lists mounted routes', () => {
      const sub = new Router().get('/x', () => new Response(''))
      const app = new Router().mount('/p', sub)
      assert.ok(app.routes().some(l => l.includes('/p/x')))
    })
  })
})

it('根路径 "/" 与通配 "/*" 并存（精确优先——showcase SSR 事故回归）', async () => {
  const app = new Router()
  app.get('/', () => new Response('ROOT'))
  app.get('/*', () => new Response('WILD'))
  const handler = app.handler()
  const r1 = await handler(new Request('http://x/'), { params: {} })
  assert.equal(await r1.text(), 'ROOT', '根路径精确命中')
  const r2 = await handler(new Request('http://x/other'), { params: {} })
  assert.equal(await r2.text(), 'WILD', '其他路径通配命中')
  const r3 = await handler(new Request('http://x/deep/path'), { params: {} })
  assert.equal(await r3.text(), 'WILD', '深层路径通配命中')
})
