import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router } from '../core/router.ts'
import { createGraphqlRouter } from '../graphql.ts'

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
