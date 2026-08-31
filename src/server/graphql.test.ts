import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from './core/router.ts'
import { createGraphqlRouter } from './graphql.ts'

/** POST 查询 helper（wire 断言） */
async function postQuery(r: ReturnType<typeof createGraphqlRouter>, query: string, options?: Record<string, unknown>): Promise<Response> {
  return r.handler()(
    new Request('http://localhost/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ query, ...options }),
    }),
    { params: {}, query: {} } as any,
  )
}

describe('graphql', () => {
  it('returns a Router', () => {
    const r = createGraphqlRouter(() => ({
      schema: 'type Query { hello: String }',
      resolvers: { Query: { hello: () => 'world' } },
    }))
    assert.ok(r.routes().length >= 1)
  })

  it('serves a POST query', async () => {
    const r = createGraphqlRouter(() => ({
      schema: 'type Query { hello: String }',
      resolvers: { Query: { hello: () => 'world' } },
    }))

    const res = await r.handler()(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: '{ hello }' }),
      }),
      { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.deepEqual(data, { data: { hello: 'world' } })
  })

  it('serves GraphiQL on GET', async () => {
    const r = createGraphqlRouter(() => ({
      schema: 'type Query { hello: String }',
      graphiql: true,
    }))
    const res = await r.handler()(new Request('http://localhost/'), { params: {}, query: {} } as any)
    assert.equal(res.status, 200)
    const html = await res.text()
    assert.ok(html.includes('graphiql') || html.includes('GraphiQL') || html.includes('graphql'))
  })
})

describe('graphql — G1 深度限制 fragment 展开（安全）', () => {
  // 类型链：a→b→c→d→e→f→g→h→i（深度 9）
  const DEEP_SDL = `
type Query { a: A, hello: String }
type A { b: B }
type B { c: C }
type C { d: D }
type D { e: E }
type E { f: F }
type F { g: G }
type G { h: H }
type H { i: I }
type I { hello: String }
`

  it('T1 fragment 链展开超限 → 400（旧代码 200——深度限制可绕过）', async () => {
    const r = createGraphqlRouter(() => ({ schema: DEEP_SDL, maxDepth: 3 }))
    // 字面深度 3（a→b→...F1）≤ 3；fragment 展开后实际 11 层
    const q = `query { a { b { ...F1 } } }
fragment F1 on B { c { d { ...F2 } } }
fragment F2 on D { e { f { ...F3 } } }
fragment F3 on F { g { h { i { hello } } } }`
    const res = await postQuery(r, q)
    assert.equal(res.status, 400, 'fragment 展开深度必须计入限制')
    const body = await res.json()
    assert.ok(body.errors[0].message.includes('depth'), '错误信息带深度')
  })

  it('T2 内联深查询保持拒绝（回归——字面深度语义不破）', async () => {
    const r = createGraphqlRouter(() => ({ schema: DEEP_SDL, maxDepth: 3 }))
    const res = await postQuery(r, '{ a { b { c { d { e { f } } } } } }')
    assert.equal(res.status, 400)
  })

  it('T3 循环 fragment 深度计算不抛（防御——validate 兜底）', async () => {
    const r = createGraphqlRouter(() => ({ schema: 'type Query { hello: String }', maxDepth: 10 }))
    const q = `query { ...A } fragment A on Query { hello ...B } fragment B on Query { hello ...A }`
    const res = await postQuery(r, q)
    assert.equal(res.status, 400, '循环 fragment 由 validate 拦截（NoFragmentCycles）——不 500')
  })
})

describe('graphql — G2/G3 协议与错误面', () => {
  it('T4 resolver 执行错误 → 200 + errors[path] + 部分 data（旧代码 400——规范违例）', async () => {
    const r = createGraphqlRouter(() => ({
      schema: 'type Query { boom: String, ok: String }',
      resolvers: { Query: { boom: () => { throw new Error('resolver crashed') }, ok: () => 'fine' } },
    }))
    const res = await postQuery(r, '{ boom ok }')
    assert.equal(res.status, 200, '执行错误 = 部分结果语义（graphql-over-http）')
    const body = await res.json()
    assert.ok(body.errors[0].path, 'errors 带 path（field 级错误）')
    assert.equal(body.data.ok, 'fine', '部分数据保留')
  })

  it('T5 validation 错误 → 400（请求级语义保持回归）', async () => {
    const r = createGraphqlRouter(() => ({ schema: 'type Query { hello: String }' }))
    const res = await postQuery(r, '{ nope }')
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.ok(body.errors[0].message.includes('Cannot query'), '未定义字段错误信息')
  })

  it('T6 context 抛错 → 500 + errors 文档（旧代码 HTML 500）', async () => {
    const r = createGraphqlRouter(() => ({
      schema: 'type Query { hello: String }',
      context: async () => { throw new Error('ctx boom') },
    }))
    const res = await postQuery(r, '{ hello }')
    assert.equal(res.status, 500)
    const text = await res.text()
    assert.ok(text.includes('ctx boom'), '错误文档带原因（非 HTML Internal Server Error）')
    const body = JSON.parse(text)
    assert.ok(Array.isArray(body.errors), 'GraphQL 错误文档形状')
  })

  it('T7 SDL 语法错误 → 500 + errors 文档（统一 JSON 面）', async () => {
    const r = createGraphqlRouter(() => ({ schema: 'type Query {' }))
    const res = await postQuery(r, '{ hello }')
    assert.equal(res.status, 500)
    const body = await res.json()
    assert.ok(body.errors[0].message.includes('schema 构建失败'), '构建错误文档')
  })
})

describe('graphql — G4 schema 缓存', () => {
  it('T8 缓存不串 resolver：同对象函数替换 → 用新函数（sig 比对——防绑定污染）', async () => {
    let resolver = { hello: () => 'v1' }
    const r = createGraphqlRouter(() => ({
      schema: 'type Query { hello: String }',
      resolvers: { Query: resolver },
    }))
    const r1 = await postQuery(r, '{ hello }')
    assert.equal((await r1.json()).data.hello, 'v1')
    // 同一 resolver 对象的函数被替换（热更新）——缓存必须 miss（不粘旧函数）
    resolver.hello = () => 'v2'
    const r2 = await postQuery(r, '{ hello }')
    assert.equal((await r2.json()).data.hello, 'v2', 'sig 变化 → 重建——行为与每请求重建一致')
  })

  it('T8b 同 SDL + 同函数 → 稳定命中且结果正确（缓存路径无副作用）', async () => {
    const resolver = { hello: () => 'stable' }
    const r = createGraphqlRouter(() => ({
      schema: 'type Query { hello: String }',
      resolvers: { Query: resolver },
    }))
    for (let i = 0; i < 3; i++) {
      const res = await postQuery(r, '{ hello }')
      assert.equal((await res.json()).data.hello, 'stable', `第 ${i + 1} 次请求正确`)
    }
  })

  it('T9 不同 SDL 各自缓存（键正确——不串 schema）', async () => {
    let sdl = 'type Query { hello: String }'
    const resolver = { hello: () => 'h', world: () => 'w' }
    const r = createGraphqlRouter(() => ({ schema: sdl, resolvers: { Query: resolver } }))
    const r1 = await postQuery(r, '{ hello }')
    assert.equal((await r1.json()).data.hello, 'h')
    // 切换 SDL（另一种 schema）——独立缓存条目
    sdl = 'type Query { world: String }'
    const r2 = await postQuery(r, '{ world }')
    assert.equal((await r2.json()).data.world, 'w')
    // 切回第一个 SDL
    sdl = 'type Query { hello: String }'
    const r3 = await postQuery(r, '{ hello }')
    assert.equal((await r3.json()).data.hello, 'h')
  })
})

describe('graphql — G5/G6 信息面与 HTTP 语义', () => {
  it('T10 GET variables 坏 JSON → 400 + 具体错误（旧代码 Missing query 误导）', async () => {
    const r = createGraphqlRouter(() => ({ schema: 'type Query { hello: String }' }))
    const res = await r.handler()(
      new Request('http://localhost/?query=%7B%20hello%20%7D&variables=not-json'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 400)
    const body = await res.json()
    assert.ok(body.errors[0].message.includes('Invalid variables JSON'))
  })

  it('T11 POST 非 JSON content-type → 415（旧代码 400 Missing query）', async () => {
    const r = createGraphqlRouter(() => ({ schema: 'type Query { hello: String }' }))
    const res = await r.handler()(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: '{ hello }',
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 415)
    const body = await res.json()
    assert.ok(body.errors[0].message.includes('application/json'))
  })

  it('T12 charset 后缀不误杀（application/json; charset=utf-8 → 200）', async () => {
    const r = createGraphqlRouter(() => ({ schema: 'type Query { hello: String }' }))
    const res = await r.handler()(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ query: '{ hello }' }),
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
  })
})
