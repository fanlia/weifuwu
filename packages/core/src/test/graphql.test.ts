import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router, graphql, createTestServer, type GraphQLHandler } from '../index.ts'
import type { Context } from '../types.ts'

const schema = `type Query { hello: String, fail: Int }
  type Mutation { set(v: Int!): Int }`
const resolvers = {
  Query: {
    hello: () => 'world',
    fail: () => {
      throw new Error('execution error')
    },
  },
  Mutation: {
    set: (_: unknown, args: { v: number }) => args.v,
  },
}

function gqlHandler(opts?: Record<string, unknown>) {
  return () => ({
    schema,
    resolvers,
    graphiql: true,
    ...opts,
  })
}

describe('graphql', () => {
  it('handles GET query', async () => {
    const m = graphql(gqlHandler())

    const res = await m.handler()(new Request('http://localhost/?query={hello}'), {
      params: {},
      query: {},
    } as Context)
    assert.equal(res.status, 200)
    const data = (await res.json()) as any
    assert.deepEqual(data, { data: { hello: 'world' } })
  })

  it('handles POST query', async () => {
    const m = graphql(gqlHandler())

    const res = await m.handler()(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ hello }' }),
      }),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 200)
    const data = (await res.json()) as any
    assert.deepEqual(data, { data: { hello: 'world' } })
  })

  it('handles POST with variables', async () => {
    const m = graphql(
      gqlHandler({
        schema: `type Query { dummy: String } type Mutation { set(v: Int!): Int }`,
        resolvers: {
          Query: { dummy: () => '' },
          Mutation: { set: (_: unknown, args: { v: number }) => args.v },
        },
        graphiql: false,
      }),
    )

    const res = await m.handler()(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'mutation($v:Int!){set(v:$v)}', variables: { v: 42 } }),
      }),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 200)
    const data = (await res.json()) as any
    assert.deepEqual(data, { data: { set: 42 } })
  })

  it('handles GET with variables', async () => {
    const m = graphql(
      gqlHandler({
        schema: `type Query { hello(name: String!): String }`,
        resolvers: {
          Query: { hello: (_: unknown, args: { name: string }) => `Hello ${args.name}` },
        },
        graphiql: false,
      }),
    )

    const res = await m.handler()(
      new Request('http://localhost/?query={hello(name:"world")}&variables={}'),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 200)
  })

  it('returns 400 with errors for invalid query', async () => {
    const m = graphql(gqlHandler())

    const res = await m.handler()(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ nonexistent }' }),
      }),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 400)
    const data = (await res.json()) as any
    assert.ok(data.errors)
    assert.ok(data.errors.length > 0)
  })

  it('returns 400 for missing query', async () => {
    const m = graphql(gqlHandler({ graphiql: false }))

    const res = await m.handler()(new Request('http://localhost/', { method: 'GET' }), {
      params: {},
      query: {},
    } as Context)
    assert.equal(res.status, 400)
  })

  it('returns 400 for POST with invalid JSON body', async () => {
    const m = graphql(gqlHandler())

    const res = await m.handler()(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not-json',
      }),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 400)
  })

  it('returns 400 for GET with invalid variables JSON', async () => {
    const m = graphql(gqlHandler({ graphiql: false }))

    const res = await m.handler()(
      new Request('http://localhost/?query={hello}&variables=not-json'),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 400)
  })

  it('returns GraphiQL HTML on GET without query when enabled', async () => {
    const m = graphql(gqlHandler({ graphiql: true }))

    const res = await m.handler()(new Request('http://localhost/', { method: 'GET' }), {
      params: {},
      query: {},
    } as Context)
    assert.equal(res.status, 200)
    const text = await res.text()
    assert.ok(text.includes('GraphiQL'))
    assert.ok(text.includes('graphiql'))
  })
})

// ── graphql HTTP integration ──────────────────────────────────────────────

describe('graphql http', () => {
  it('handles GET query via HTTP', async () => {
    const r = new Router()
    const m = graphql(gqlHandler())
    r.mount('/graphql', m)

    const { server, url } = await createTestServer(r)
    const res = await fetch(`${url}/graphql?query={hello}`)
    assert.equal(res.status, 200)
    const data = (await res.json()) as Record<string, unknown>
    assert.deepEqual(data, { data: { hello: 'world' } })
    await server.stop()
  })

  it('handles POST query via HTTP', async () => {
    const r = new Router()
    const m = graphql(gqlHandler())
    r.mount('/graphql', m)

    const { server, url } = await createTestServer(r)
    const res = await fetch(`${url}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ hello }' }),
    })
    assert.equal(res.status, 200)
    const data = (await res.json()) as Record<string, unknown>
    assert.deepEqual(data, { data: { hello: 'world' } })
    await server.stop()
  })

  it('returns GraphiQL HTML on GET without query via HTTP', async () => {
    const r = new Router()
    const m = graphql(gqlHandler({ graphiql: true }))
    r.mount('/graphql', m)

    const { server, url } = await createTestServer(r)
    const res = await fetch(`${url}/graphql`)
    assert.equal(res.status, 200)
    const text = await res.text()
    assert.ok(text.includes('GraphiQL'))
    assert.ok(text.includes('graphiql'))
    await server.stop()
  })

  it('executes query when graphiql=true but query param present', async () => {
    const m = graphql(gqlHandler({ graphiql: true }))

    const res = await m.handler()(new Request('http://localhost/?query={hello}'), {
      params: {},
      query: {},
    } as Context)
    assert.equal(res.status, 200)
    const data = (await res.json()) as any
    assert.deepEqual(data, { data: { hello: 'world' } })
  })

  it('handles POST with missing query field', async () => {
    const m = graphql(gqlHandler({ graphiql: false }))

    const res = await m.handler()(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notQuery: 'x' }),
      }),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 400)
  })

  it('handles POST with operationName', async () => {
    const opts = {
      schema: `type Query { hello: String, world: String }
type Mutation { set(v: Int!): Int }`,
      resolvers: {
        Query: { hello: () => 'HELLO', world: () => 'WORLD' },
        Mutation: { set: (_: unknown, args: { v: number }) => args.v },
      },
      graphiql: false,
    }
    const m = graphql(() => opts)

    const res = await m.handler()(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'query H { hello } query W { world }', operationName: 'W' }),
      }),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 200)
    const data = (await res.json()) as any
    assert.deepEqual(data, { data: { world: 'WORLD' } })
  })

  it('handles GET with operationName', async () => {
    const opts = {
      schema: `type Query { hello: String, world: String }`,
      resolvers: { Query: { hello: () => 'HELLO', world: () => 'WORLD' } },
      graphiql: false,
    }
    const m = graphql(() => opts)

    const res = await m.handler()(
      new Request('http://localhost/?query=query H { hello } query W { world }&operationName=H'),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 200)
    const data = (await res.json()) as any
    assert.deepEqual(data, { data: { hello: 'HELLO' } })
  })

  it('executes with custom context function', async () => {
    let ctxReceived: any = null
    const m = graphql(() => ({
      schema,
      resolvers: { Query: { hello: (_: unknown, __: unknown, c: any) => c.foo } },
      context: async (req: Request, ctx: Context) => {
        ctxReceived = ctx
        return { foo: 'bar-from-context' }
      },
      graphiql: false,
    }))

    const testCtx = { params: {}, query: {} } as Context
    const res = await m.handler()(new Request('http://localhost/?query={hello}'), testCtx)
    assert.equal(res.status, 200)
    const data = (await res.json()) as any
    assert.deepEqual(data, { data: { hello: 'bar-from-context' } })
    assert.ok(ctxReceived)
  })

  it('builds schema from SDL string without resolvers', async () => {
    const m = graphql(() => ({
      schema: `type Query { hello: String }`,
      graphiql: false,
    }))

    const res = await m.handler()(new Request('http://localhost/?query={hello}'), {
      params: {},
      query: {},
    } as Context)
    assert.equal(res.status, 200)
    const data = (await res.json()) as any
    assert.deepEqual(data, { data: { hello: null } })
  })
})
