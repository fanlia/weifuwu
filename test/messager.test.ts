import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from '../postgres/index.ts'
import { messager } from '../messager/index.ts'
import type { PostgresClient } from '../postgres/types.ts'
import type { MessagerModule } from '../messager/types.ts'

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

describe('messager', { skip: !DATABASE_URL }, () => {
  let pg: PostgresClient
  let msg: MessagerModule

  before(async () => {
    pg = postgres({ connection: DATABASE_URL })
    msg = messager({ pg })
    await msg.migrate()
  })

  after(async () => {
    await pg.sql.unsafe('DROP TABLE IF EXISTS "_messages" CASCADE')
    await pg.sql.unsafe('DROP TABLE IF EXISTS "_channel_members" CASCADE')
    await pg.sql.unsafe('DROP TABLE IF EXISTS "_channels" CASCADE')
    await pg.close()
  })

  it('creates a channel via router', async () => {
    const r = msg
    const res = await r.handler()(
      new Request('http://localhost/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'General', created_by: 1 }),
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 201)
    const ch = await res.json() as any
    assert.ok(ch.id)
    assert.equal(ch.name, 'General')
    await pg.sql`DELETE FROM "_channel_members" WHERE channel_id = ${ch.id}`
    await pg.sql`DELETE FROM "_channels" WHERE id = ${ch.id}`
  })

  it('lists channels for user', async () => {
    const r = msg
    const [ch] = await pg.sql`INSERT INTO "_channels" ("name", "created_by") VALUES ('Test', 1) RETURNING *`
    await pg.sql`INSERT INTO "_channel_members" ("channel_id", "member_id", "member_type", "role") VALUES (${(ch as any).id}, 1, 'user', 'admin')`

    const res = await r.handler()(
      new Request('http://localhost/channels'),
      { params: {}, query: {}, user: { id: 1 } } as any,
    )
    assert.equal(res.status, 200)
    const list = await res.json() as any[]
    assert.ok(list.length >= 1)

    await pg.sql`DELETE FROM "_channel_members" WHERE channel_id = ${(ch as any).id}`
    await pg.sql`DELETE FROM "_channels" WHERE id = ${(ch as any).id}`
  })

  it('creates and lists messages', async () => {
    const r = msg
    const [ch] = await pg.sql`INSERT INTO "_channels" ("name", "created_by") VALUES ('MsgTest', 1) RETURNING *`
    const channelId = (ch as any).id

    // Create messages
    await r.handler()(
      new Request(`http://localhost/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'Hello', sender_id: 1 }),
      }),
      { params: {}, query: {} } as any,
    )
    await r.handler()(
      new Request(`http://localhost/channels/${channelId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'World', sender_id: 1 }),
      }),
      { params: {}, query: {} } as any,
    )

    // List messages
    const res = await r.handler()(
      new Request(`http://localhost/channels/${channelId}/messages?limit=10`),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const body = await res.json() as any
    assert.equal(body.rows.length, 2)

    await pg.sql`DELETE FROM "_messages" WHERE channel_id = ${channelId}`
    await pg.sql`DELETE FROM "_channel_members" WHERE channel_id = ${channelId}`
    await pg.sql`DELETE FROM "_channels" WHERE id = ${channelId}`
  })

  it('marks channel as read', async () => {
    const r = msg
    const [ch] = await pg.sql`INSERT INTO "_channels" ("name", "created_by") VALUES ('ReadTest', 1) RETURNING *`
    const channelId = (ch as any).id
    await pg.sql`INSERT INTO "_channel_members" ("channel_id", "member_id", "member_type", "role") VALUES (${channelId}, 1, 'user', 'admin')`

    const res = await r.handler()(
      new Request(`http://localhost/channels/${channelId}/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ last_message_id: 42, user_id: 1 }),
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 200)
    const body = await res.json() as any
    assert.ok(body.ok)

    await pg.sql`DELETE FROM "_channel_members" WHERE channel_id = ${channelId}`
    await pg.sql`DELETE FROM "_channels" WHERE id = ${channelId}`
  })

  it('sends message programmatically', async () => {
    const [ch] = await pg.sql`INSERT INTO "_channels" ("name", "created_by") VALUES ('SendTest', 1) RETURNING *`
    const channelId = (ch as any).id

    const message = await msg.send(channelId, 'System message', { sender_type: 'system' })
    assert.ok(message.id)
    assert.equal(message.content, 'System message')
    assert.equal(message.sender_type, 'system')

    await pg.sql`DELETE FROM "_messages" WHERE channel_id = ${channelId}`
    await pg.sql`DELETE FROM "_channels" WHERE id = ${channelId}`
  })

  it('creates channel with members', async () => {
    const r = msg
    const res = await r.handler()(
      new Request('http://localhost/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Team',
          created_by: 1,
          members: [
            { member_id: 10, member_type: 'user' },
            { member_id: 2, member_type: 'agent' },
          ],
        }),
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 201)
    const ch = await res.json() as any

    const count = await pg.sql`SELECT count(*) as c FROM "_channel_members" WHERE channel_id = ${ch.id}`
    assert.equal(Number((count as any[])[0].c), 3) // creator + user + agent

    await pg.sql`DELETE FROM "_channel_members" WHERE channel_id = ${ch.id}`
    await pg.sql`DELETE FROM "_channels" WHERE id = ${ch.id}`
  })
})
