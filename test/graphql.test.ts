import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { graphql } from '../graphql.ts'
import type { Context } from '../types.ts'

const schema = `type Query { hello: String, fail: Int }
  type Mutation { set(v: Int!): Int }`
const resolvers = {
  Query: {
    hello: () => 'world',
    fail: () => { throw new Error('execution error') },
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
    const r = graphql(gqlHandler())
    r.use('/', graphql(gqlHandler()))

    const res = await r.handler()(
      new Request('http://localhost/?query={hello}'),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 200)
    const data = await res.json() as any
    assert.deepEqual(data, { data: { hello: 'world' } })
  })

  it('handles POST query', async () => {
    const r = graphql(gqlHandler())

    const res = await r.handler()(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ hello }' }),
      }),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 200)
    const data = await res.json() as any
    assert.deepEqual(data, { data: { hello: 'world' } })
  })

  it('handles POST with variables', async () => {
    const r = graphql(gqlHandler({
      schema: `type Query { dummy: String } type Mutation { set(v: Int!): Int }`,
      resolvers: { Query: { dummy: () => '' }, Mutation: { set: (_: unknown, args: { v: number }) => args.v } },
      graphiql: false,
    }))

    const res = await r.handler()(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'mutation($v:Int!){set(v:$v)}', variables: { v: 42 } }),
      }),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 200)
    const data = await res.json() as any
    assert.deepEqual(data, { data: { set: 42 } })
  })

  it('handles GET with variables', async () => {
    const r = graphql(gqlHandler({
      schema: `type Query { hello(name: String!): String }`,
      resolvers: { Query: { hello: (_: unknown, args: { name: string }) => `Hello ${args.name}` } },
      graphiql: false,
    }))

    const res = await r.handler()(
      new Request('http://localhost/?query={hello(name:"world")}&variables={}'),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 200)
  })

  it('returns 200 with errors for invalid query (not 400)', async () => {
    const r = graphql(gqlHandler())

    const res = await r.handler()(
      new Request('http://localhost/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: '{ nonexistent }' }),
      }),
      { params: {}, query: {} } as Context,
    )
    // GraphQL errors should be 200 per spec
    assert.equal(res.status, 200)
    const data = await res.json() as any
    assert.ok(data.errors)
    assert.ok(data.errors.length > 0)
  })

  it('returns 400 for missing query', async () => {
    const r = graphql(gqlHandler({ graphiql: false }))

    const res = await r.handler()(
      new Request('http://localhost/', { method: 'GET' }),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 400)
  })

  it('returns 400 for POST with invalid JSON body', async () => {
    const r = graphql(gqlHandler())

    const res = await r.handler()(
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
    const r = graphql(gqlHandler({ graphiql: false }))

    const res = await r.handler()(
      new Request('http://localhost/?query={hello}&variables=not-json'),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 400)
  })

  it('returns GraphiQL HTML on GET without query when enabled', async () => {
    const r = graphql(gqlHandler({ graphiql: true }))

    const res = await r.handler()(
      new Request('http://localhost/', { method: 'GET' }),
      { params: {}, query: {} } as Context,
    )
    assert.equal(res.status, 200)
    const text = await res.text()
    assert.ok(text.includes('GraphiQL'))
    assert.ok(text.includes('graphiql'))
  })
})
