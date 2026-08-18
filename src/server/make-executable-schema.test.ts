import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { graphql } from 'graphql'
import { makeExecutableSchema } from './make-executable-schema.ts'

describe('makeExecutableSchema (自研, 替代 @graphql-tools/schema)', () => {
  it('binds root Query resolvers', async () => {
    const schema = makeExecutableSchema({
      typeDefs: 'type Query { hello: String }',
      resolvers: { Query: { hello: () => 'world' } },
    })
    const r = await graphql({ schema, source: '{ hello }' })
    assert.ok(r.data)
    assert.equal((r.data as any).hello, 'world')
  })

  it('binds nested type field resolvers (makeExecutableSchema 核心价值)', async () => {
    const schema = makeExecutableSchema({
      typeDefs: `
        type Query { user: User }
        type User { name: String, age: Int }
      `,
      resolvers: {
        Query: { user: () => ({ name: 'Alice', birthYear: 1995 }) },
        User: { age: (user: any) => new Date().getFullYear() - user.birthYear },
      },
    })
    const r = await graphql({ schema, source: '{ user { name age } }' })
    assert.ok(r.data)
    assert.equal((r.data as any).user.name, 'Alice')
    assert.equal((r.data as any).user.age, new Date().getFullYear() - 1995)
  })

  it('resolvers receive args', async () => {
    const schema = makeExecutableSchema({
      typeDefs: 'type Query { add(a: Int!, b: Int!): Int }',
      resolvers: { Query: { add: (_: any, args: any) => args.a + args.b } },
    })
    const r = await graphql({ schema, source: '{ add(a: 2, b: 3) }' })
    assert.ok(r.data)
    assert.equal((r.data as any).add, 5)
  })

  it('fields without resolvers fall back to default property lookup', async () => {
    const schema = makeExecutableSchema({
      typeDefs: 'type Query { user: User } type User { name: String }',
      resolvers: { Query: { user: () => ({ name: 'Bob' }) } },
    })
    const r = await graphql({ schema, source: '{ user { name } }' })
    assert.ok(r.data)
    assert.equal((r.data as any).user.name, 'Bob')
  })

  it('supports Subscription/Mutation resolvers', async () => {
    const schema = makeExecutableSchema({
      typeDefs: `
        type Query { ping: String }
        type Mutation { set: String }
      `,
      resolvers: {
        Query: { ping: () => 'pong' },
        Mutation: { set: () => 'done' },
      },
    })
    const r = await graphql({ schema, source: 'mutation { set }' })
    assert.ok(r.data)
    assert.equal((r.data as any).set, 'done')
  })

  it('ignores unknown type names in resolvers (lenient)', async () => {
    const schema = makeExecutableSchema({
      typeDefs: 'type Query { hello: String }',
      resolvers: { Query: { hello: () => 'hi' }, Ghost: { x: () => 1 } },
    })
    const r = await graphql({ schema, source: '{ hello }' })
    assert.ok(r.data)
    assert.equal((r.data as any).hello, 'hi')
  })
})
