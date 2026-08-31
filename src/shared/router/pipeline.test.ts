/**
 * 路由内核契约（SHARED-TRIE-EXCELLENCE B0/B2——2027-10）
 *
 * **dispatchRouter 流程骨架**（机制公用、实现不一样——差异钩子化）：
 * parse 400 信号 → trie 匹配 → enrichCtx 恒执行（404 也注入）→
 * resolveHandler 三态（route/not-allowed/not-found）→ 错误边界。
 *
 * **B2 双端对账**（结构性防线）：同 Trie 操作序列 → server Router vs
 * client UIRouter 消费——GET 匹配/params/404 分类等价——前后端语义
 * 漂移在此现形。
 */
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { createTrie, trieRegister } from './trie.ts'
import { dispatchRouter, type RouterPipeline, type RouteMatch } from './pipeline.ts'
import type { SharedHandler } from './types.ts'

interface MiniCtx {
  params: Record<string, string>
  query: Record<string, string>
  enriched?: boolean
}

describe('dispatchRouter 流程骨架', () => {
  const mkPipeline = (overrides: Partial<RouterPipeline<string, MiniCtx>> = {}): RouterPipeline<string, MiniCtx> => ({
    resolveHandler: (m: RouteMatch<string>) => ({
      kind: 'route',
      run: () => new Response(`v=${m.value} id=${m.params.id ?? '-'}`),
    }),
    onNotFound: (_req, _ctx, path) => new Response(`nf:${path}`, { status: 404 }),
    ...overrides,
  })

  const mkRoot = () => {
    const root = createTrie<string>()
    trieRegister(root, '/u/:id', 'user')
    trieRegister(root, '/files/*', 'wf', true)
    trieRegister(root, '/only-get', 'og')
    return root
  }

  test('parse 400 信号：非法编码 %zz → 400（骨架统一防御——双端一致）', async () => {
    const root = mkRoot()
    const res = await dispatchRouter(root, mkPipeline(), new Request('http://x/u/%zz'), { params: {}, query: {} })
    assert.equal(res.status, 400)
    const body = await res.json() as any
    assert.equal(body.reason, 'malformed-encoding')
  })

  test('匹配 + params 注入 + handler 执行（run 闭包）', async () => {
    const root = mkRoot()
    const res = await dispatchRouter(root, mkPipeline(), new Request('http://x/u/42'), { params: {}, query: {} })
    assert.equal(res.status, 200)
    assert.equal(await res.text(), 'v=user id=42')
  })

  test('enrichCtx 恒执行——404 时也注入（client notFound 语义保留）', async () => {
    const root = mkRoot()
    let enriched: MiniCtx | null = null
    const p = mkPipeline({
      enrichCtx: (ctx, m, pathname, query) => {
        ctx.params = m ? { ...m.params } : {}
        ctx.query = query
        ctx.enriched = true
        void pathname
        enriched = ctx
      },
    })
    const res = await dispatchRouter(root, p, new Request('http://x/missing'), { params: {}, query: {} } as MiniCtx)
    assert.equal(res.status, 404)
    assert.ok(enriched!.enriched, '404 时 enrichCtx 也执行（m null → params fresh 空）')
    assert.deepEqual(enriched!.params, {})
  })

  test('not-found 三态：通配 method 落空 → onNotFound（通配不产生 405——锁死）', async () => {
    const root = mkRoot()
    let nfPath = ''
    const p = mkPipeline({
      resolveHandler: (m) => {
        // 模拟 server method 表：wildcard 命中但 method 落空
        if (m.wildcard && m.value === 'wf') return { kind: 'not-found' }
        return { kind: 'route', run: () => new Response('ok') }
      },
      onNotFound: (_req, _ctx, path) => { nfPath = path; return new Response('nf', { status: 404 }) },
    })
    const res = await dispatchRouter(root, p, new Request('http://x/files/a', { method: 'DELETE' }), { params: {}, query: {} })
    assert.equal(res.status, 404)
    assert.equal(nfPath, '/files/a')
  })

  test('not-allowed 三态：钩子优先，缺省 405+Allow', async () => {
    const root = mkRoot()
    // 缺省（无 onMethodNotAllowed）→ 骨架默认 405 + Allow
    const p1 = mkPipeline({
      resolveHandler: () => ({ kind: 'not-allowed', methods: ['GET', 'POST'] }),
    })
    const r1 = await dispatchRouter(root, p1, new Request('http://x/only-get', { method: 'DELETE' }), { params: {}, query: {} })
    assert.equal(r1.status, 405)
    assert.equal(r1.headers.get('allow'), 'GET, POST')
    // 钩子实现 → 双端形态自定（server: globalMws 链）
    const p2 = mkPipeline({
      resolveHandler: () => ({ kind: 'not-allowed', methods: ['GET'] }),
      onMethodNotAllowed: (methods) => new Response(`405-hook:${methods.join(',')}`, { status: 405 }),
    })
    const r2 = await dispatchRouter(root, p2, new Request('http://x/only-get', { method: 'DELETE' }), { params: {}, query: {} })
    assert.equal(await r2.text(), '405-hook:GET')
  })

  test('错误边界：onError 接住 run 抛错；缺省直抛', async () => {
    const root = createTrie<string>()
    trieRegister(root, '/boom', 'b')
    const p1 = mkPipeline({
      resolveHandler: () => ({ kind: 'route', run: () => { throw new Error('x') } }),
      onError: (e) => new Response(`handled:${(e as Error).message}`, { status: 500 }),
    })
    const r1 = await dispatchRouter(root, p1, new Request('http://x/boom'), { params: {}, query: {} })
    assert.equal(await r1.text(), 'handled:x')
    // 缺省直抛（serve 层兜底）
    const p2 = mkPipeline({
      resolveHandler: () => ({ kind: 'route', run: () => { throw new Error('raw') } }),
    })
    await assert.rejects(() => dispatchRouter(root, p2, new Request('http://x/boom'), { params: {}, query: {} }), /raw/)
  })

  test('onRouteSuccess：run 成功后执行（server 恢复清出锚点）', async () => {
    const root = createTrie<string>()
    trieRegister(root, '/ok', 'o')
    let okPath = ''
    const p = mkPipeline({
      onRouteSuccess: (_req, _ctx, path) => { okPath = path },
    })
    await dispatchRouter(root, p, new Request('http://x/ok'), { params: {}, query: {} })
    assert.equal(okPath, '/ok')
    // 失败路径不触发
    okPath = ''
    const p2 = mkPipeline({
      resolveHandler: () => ({ kind: 'route', run: () => { throw new Error('f') } }),
      onError: () => new Response('e', { status: 500 }),
    })
    await dispatchRouter(root, p2, new Request('http://x/ok'), { params: {}, query: {} })
    assert.equal(okPath, '', '抛错不触发 onRouteSuccess')
  })
})

// ── B2: 双端对账（同操作序列 → server/client 消费分类等价） ────

describe('B2 双端对账（前后端语义漂移的结构性防线）', () => {
  /** 操作序列（双端同注册集 + 同请求集——分类等价断言） */
  const routes = ['/a', '/u/:id', '/files/*', '/deep/nested/x']
  const requests = ['/a', '/u/42', '/files/z/9', '/deep/nested/x', '/missing', '/a/b']

  test('server Router 与 client UIRouter：GET 命中/params/404 分类全等', async () => {
    const { Router } = await import('../../server/core/router.ts')
    const { UIRouter } = await import('../../client/vdom/core/router.ts')

    // server 侧（value = handler 标识）
    const server = new Router()
    const serverHits: Record<string, string> = {}
    for (const r of routes) server.get(r, (req, ctx: any) => {
      const key = new URL(req.url).pathname
      serverHits[key] = JSON.stringify(ctx.params)
      return new Response(`s:${key}`)
    })
    const sh = server.handler() as any

    // client 侧（value = handler 标识）
    const client = new UIRouter()
    const clientHits: Record<string, string> = {}
    client.notFound(() => new Response('c:404', { status: 404 }))
    for (const r of routes) client.get(r, (req, ctx: any) => {
      const key = new URL(req.url).pathname
      clientHits[key] = JSON.stringify(ctx.params)
      return new Response(`c:${key}`)
    })

    for (const reqPath of requests) {
      const sRes = await sh(new Request(`http://x${reqPath}`), { params: {}, query: {} })
      const cRes = await client.resolve(new Request(`http://x${reqPath}`), { params: {}, query: {} } as any)
      const sCls = sRes.status === 200 ? 'hit' : sRes.status
      const cCls = cRes.status === 200 ? 'hit' : cRes.status
      assert.equal(sCls, cCls, `req=${reqPath}——分类等价（server=${sCls} client=${cCls}）`)
      if (sCls === 'hit') {
        assert.equal(serverHits[reqPath], clientHits[reqPath], `req=${reqPath}——params 等价（server=${serverHits[reqPath]} client=${clientHits[reqPath]}）`)
      }
    }
  })

  test('wildcard 通配命中分类等价（/files/* 形态）', async () => {
    const { Router } = await import('../../server/core/router.ts')
    const { UIRouter } = await import('../../client/vdom/core/router.ts')
    const server = new Router()
    server.get('/f/*', () => new Response('s-wf'))
    const client = new UIRouter()
    client.get('/f/*', () => new Response('c-wf'))
    const sRes = await (server.handler() as any)(new Request('http://x/f/a/b'), { params: {}, query: {} })
    const cRes = await client.resolve(new Request('http://x/f/a/b'), { params: {}, query: {} } as any)
    assert.equal(sRes.status, 200)
    assert.equal(cRes.status, 200)
    assert.equal(await sRes.text(), 's-wf')
    assert.equal(await cRes.text(), 'c-wf')
  })
})
