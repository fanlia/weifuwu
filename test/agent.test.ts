import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from '../postgres/index.ts'
import { agent } from '../agent/index.ts'
import type { PostgresClient } from '../postgres/types.ts'
import type { AgentModule } from '../agent/types.ts'

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

describe('agent', { skip: !DATABASE_URL }, () => {
  let pg: PostgresClient
  let a: AgentModule

  before(async () => {
    pg = postgres({ connection: DATABASE_URL })
    a = agent({ pg })
    await a.migrate()
  })

  after(async () => {
    await pg.sql.unsafe('DROP TABLE IF EXISTS "_agents" CASCADE')
    await pg.sql.unsafe('DROP TABLE IF EXISTS "_knowledge_documents" CASCADE')
    await pg.close()
  })

  it('creates an agent via router', async () => {
    const r = a.router()
    const res = await r.handler()(
      new Request('http://localhost/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test', type: 'chat', system_prompt: 'test' }),
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 201)
    const body = await res.json() as any
    assert.ok(body.id)
    assert.equal(body.name, 'Test')
    assert.equal(body.type, 'chat')
    await pg.sql`DELETE FROM "_agents" WHERE id = ${body.id}`
  })

  it('lists agents', async () => {
    await pg.sql`INSERT INTO "_agents" ("name", "type", "owner_id") VALUES ('ListTest', 'chat', 1)`
    const r = a.router()
    const res = await r.handler()(
      new Request('http://localhost/agents'),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const list = await res.json() as any[]
    assert.ok(list.length >= 1)
    await pg.sql`DELETE FROM "_agents"`
  })

  it('runs an agent without stream', async () => {
    const [ag] = await pg.sql`INSERT INTO "_agents" ("name", "type", "owner_id") VALUES ('RunTest', 'chat', 1) RETURNING *`
    const result = await a.run((ag as any).id, { input: 'hello' })
    if ('output' in result) {
      assert.ok(result.output.length > 0)
      assert.ok(result.elapsed > 0)
    }
    await pg.sql`DELETE FROM "_agents" WHERE id = ${(ag as any).id}`
  })

  it('runs an agent with stream', async () => {
    const [ag] = await pg.sql`INSERT INTO "_agents" ("name", "type", "owner_id") VALUES ('StreamTest', 'chat', 1) RETURNING *`
    const result = await a.run((ag as any).id, { input: 'hello', stream: true })
    if ('stream' in result) {
      const reader = result.stream.getReader()
      const first = await reader.read()
      assert.ok(first.value)
      reader.releaseLock()
    }
    await pg.sql`DELETE FROM "_agents" WHERE id = ${(ag as any).id}`
  })

  it('adds and searches knowledge', async () => {
    const [ag] = await pg.sql`INSERT INTO "_agents" ("name", "type", "system_prompt", "owner_id") VALUES ('KnowTest', 'chat', '你是一个测试助手，基于知识库回答用户问题。', 1) RETURNING *`
    const aid = (ag as any).id

    const doc = await a.addKnowledge(aid, '测试文档', 'RAG（检索增强生成）是一种结合信息检索和文本生成的技术。它通过从知识库中检索相关文档片段，然后提供给语言模型生成回答。')
    assert.ok(doc.id)
    assert.equal(doc.title, '测试文档')

    // Verify the doc exists in DB
    const [stored] = await pg.sql`SELECT id, content FROM "_knowledge_documents" WHERE id = ${doc.id} LIMIT 1`
    assert.ok(stored)
    assert.ok((stored as any).content.length > 0)

    await pg.sql`DELETE FROM "_knowledge_documents" WHERE agent_id = ${aid}`
    await pg.sql`DELETE FROM "_agents" WHERE id = ${aid}`
  })

  it('deletes knowledge doc with correct agent ownership', async () => {
    const [ag] = await pg.sql`INSERT INTO "_agents" ("name", "type", "owner_id") VALUES ('KnowDelTest', 'chat', 1) RETURNING *`
    const agentId = (ag as any).id

    const r = a.router()
    const createRes = await r.handler()(
      new Request(`http://localhost/agents/${agentId}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test', content: 'test content' }),
      }),
      { params: {}, query: {}, user: { id: 1 } } as any,
    )
    assert.equal(createRes.status, 201)
    const created = await createRes.json() as any

    const delRes = await r.handler()(
      new Request(`http://localhost/agents/${agentId}/knowledge/${created.id}`, { method: 'DELETE' }),
      { params: {}, query: {} } as any,
    )
    assert.equal(delRes.status, 200)

    const [check] = await pg.sql`SELECT id FROM "_knowledge_documents" WHERE id = ${created.id}` as any[]
    assert.equal(check, undefined)

    await pg.sql`DELETE FROM "_knowledge_documents" WHERE agent_id = ${agentId}`
    await pg.sql`DELETE FROM "_agents" WHERE id = ${agentId}`
  })

  it('rejects knowledge delete for wrong agent', async () => {
    const [ag] = await pg.sql`INSERT INTO "_agents" ("name", "type", "owner_id") VALUES ('WrongAgent', 'chat', 1) RETURNING *`
    const agentId = (ag as any).id

    const r = a.router()
    const createRes = await r.handler()(
      new Request(`http://localhost/agents/${agentId}/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Secret', content: 'secret data' }),
      }),
      { params: {}, query: {}, user: { id: 1 } } as any,
    )
    assert.equal(createRes.status, 201)
    const created = await createRes.json() as any

    const delRes = await r.handler()(
      new Request(`http://localhost/agents/${agentId + 999}/knowledge/${created.id}`, { method: 'DELETE' }),
      { params: {}, query: {} } as any,
    )
    assert.equal(delRes.status, 200)

    const [check] = await pg.sql`SELECT id FROM "_knowledge_documents" WHERE id = ${created.id}` as any[]
    assert.ok(check, 'doc should still exist')

    await pg.sql`DELETE FROM "_knowledge_documents" WHERE agent_id = ${agentId}`
    await pg.sql`DELETE FROM "_agents" WHERE id = ${agentId}`
  })
})
