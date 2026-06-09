import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { Router, graphql, createTestServer } from '../index.ts'

// ── graphql middleware ──────────────────────────────────────────────────────────

describe('graphql', () => {
  it('handles GET query', async () => {
    const r = new Router()
    const gql1 = graphql(() => ({
      schema: `type Query { hello: String }`,
      resolvers: { Query: { hello: () => 'world' } },
    }))
    r.use('/graphql', gql1)

    const { server, url } = await createTestServer(r.handler())
    const res = await fetch(`${url}/graphql?query={hello}`)
    assert.equal(res.status, 200)
    const data = await res.json() as Record<string, unknown>
    assert.deepEqual(data, { data: { hello: 'world' } })
    server.stop()
  })

  it('handles POST query', async () => {
    const r = new Router()
    const gql2 = graphql(() => ({
      schema: `type Query { hello: String }`,
      resolvers: { Query: { hello: () => 'world' } },
    }))
    r.use('/graphql', gql2)

    const { server, url } = await createTestServer(r.handler())
    const res = await fetch(`${url}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '{ hello }' }),
    })
    assert.equal(res.status, 200)
    const data = await res.json() as Record<string, unknown>
    assert.deepEqual(data, { data: { hello: 'world' } })
    server.stop()
  })

  it('returns GraphiQL HTML on GET without query', async () => {
    const r = new Router()
    const gql3 = graphql(() => ({
      schema: `type Query { hello: String }`,
      resolvers: { Query: { hello: () => 'world' } },
      graphiql: true,
    }))
    r.use('/graphql', gql3)

    const { server, url } = await createTestServer(r.handler())
    const res = await fetch(`${url}/graphql`)
    assert.equal(res.status, 200)
    const text = await res.text()
    assert.ok(text.includes('GraphiQL'))
    assert.ok(text.includes('graphiql'))
    server.stop()
  })
})

