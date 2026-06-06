import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from '../postgres/index.ts'
import type { PostgresClient } from '../postgres/types.ts'
import { logdb } from '../logdb/client.ts'
import { createTestServer } from '../serve.ts'

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

describe('logdb', { skip: !DATABASE_URL }, () => {
  let pg: PostgresClient
  const tableName = '__test_log_entries'

  before(async () => {
    pg = postgres({ connection: DATABASE_URL })
    const logger = logdb({ pg, table: tableName })
    await logger.migrate()
  })

  beforeEach(async () => {
    const partitions = await pg.sql.unsafe(`
      SELECT relid::regclass::text AS name
      FROM pg_partition_tree('"${tableName}"'::regclass)
      WHERE relid IS DISTINCT FROM '"${tableName}"'::regclass
    `) as { name: string }[]
    for (const { name } of partitions) {
      await pg.sql.unsafe(`DROP TABLE IF EXISTS "${name}"`)
    }
    // Recreate partitions for the current month
    const now = new Date()
    for (let i = 0; i < 13; i++) {
      const start = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const end = new Date(now.getFullYear(), now.getMonth() + i + 1, 1)
      const pad = (n: number) => n < 10 ? '0' + n : String(n)
      const partName = `${tableName}_${start.getFullYear()}_${pad(start.getMonth() + 1)}`
      await pg.sql.unsafe(`
        CREATE TABLE IF NOT EXISTS "${partName}"
        PARTITION OF "${tableName}"
        FOR VALUES FROM ('${start.toISOString().slice(0, 19)}+00:00') TO ('${end.toISOString().slice(0, 19)}+00:00')
      `)
    }
  })

  after(async () => {
    await pg.sql.unsafe(`DROP TABLE IF EXISTS "${tableName}" CASCADE`)
    await pg.close()
  })

  it('log inserts and returns entry with id', async () => {
    const logger = logdb({ pg, table: tableName })
    const entry = await logger.log({ level: 'info', source: 'test', message: 'hello' })

    assert.ok(entry)
    assert.ok(typeof entry.id === 'number')
    assert.equal(entry.level, 'info')
    assert.equal(entry.source, 'test')
    assert.equal(entry.message, 'hello')
    assert.deepEqual(entry.metadata, {})
    assert.ok(entry.created_at)
  })

  it('log stores metadata', async () => {
    const logger = logdb({ pg, table: tableName })
    const entry = await logger.log({
      level: 'error',
      source: 'api',
      message: 'fail',
      metadata: { userId: 42, service: 'auth' },
    })

    assert.equal(entry.metadata.userId, 42)
    assert.equal(entry.metadata.service, 'auth')
  })

  it('POST / creates entry and returns 201', async () => {
    const logger = logdb({ pg, table: tableName })
    const handler = logger.handler()
    const { server, url } = await createTestServer(handler)
    try {
      await server.ready

      const res = await fetch(`${url}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 'warn', source: 'ui', message: 'deprecated' }),
      })
      assert.equal(res.status, 201)
      const entry = await res.json()
      assert.equal(entry.level, 'warn')
      assert.equal(entry.source, 'ui')
    } finally {
      server.stop()
    }
  })

  it('POST / requires level, source, message', async () => {
    const logger = logdb({ pg, table: tableName })
    const handler = logger.handler()
    const { server, url } = await createTestServer(handler)
    try {
      await server.ready

      const res = await fetch(`${url}/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: 'info' }),
      })
      assert.equal(res.status, 400)
    } finally {
      server.stop()
    }
  })

  it('POST / auto-captures ctx.user.id in metadata', async () => {
    const logger = logdb({ pg, table: tableName })
    const handler = logger.handler()

    const req = new Request('http://localhost/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level: 'info', source: 'api', message: 'user action' }),
    })
    const ctx = { params: {}, query: {}, user: { id: 99 } } as any
    const res = await handler(req, ctx)
    assert.equal(res.status, 201)
    const entry = await res.json()
    assert.equal(entry.metadata.user_id, 99)
  })

  it('GET / returns paginated entries ordered by created_at DESC', async () => {
    const logger = logdb({ pg, table: tableName })
    await logger.log({ level: 'info', source: 'test', message: 'first' })
    await logger.log({ level: 'info', source: 'test', message: 'second' })

    const handler = logger.handler()
    const { server, url } = await createTestServer(handler)
    try {
      await server.ready

      const res = await fetch(`${url}/?limit=10&offset=0`)
      assert.equal(res.status, 200)
      const body = await res.json()
      assert.ok(body.entries.length >= 2)
      assert.ok(new Date(body.entries[0].created_at) >= new Date(body.entries[1].created_at))
    } finally {
      server.stop()
    }
  })

  it('GET / filters by level', async () => {
    const logger = logdb({ pg, table: tableName })
    await logger.log({ level: 'info', source: 'test', message: 'a' })
    await logger.log({ level: 'error', source: 'test', message: 'b' })

    const handler = logger.handler()
    const { server, url } = await createTestServer(handler)
    try {
      await server.ready

      const res = await fetch(`${url}/?level=error`)
      const body = await res.json()
      assert.equal(body.entries.length, 1)
      assert.equal(body.entries[0].level, 'error')
    } finally {
      server.stop()
    }
  })

  it('GET / filters by time range', async () => {
    const logger = logdb({ pg, table: tableName })
    await logger.log({ level: 'info', source: 'test', message: 'old' })
    await logger.log({ level: 'info', source: 'test', message: 'new' })

    const handler = logger.handler()
    const { server, url } = await createTestServer(handler)
    try {
      await server.ready

      const after = new Date(Date.now() - 1000).toISOString()
      const res = await fetch(`${url}/?after=${after}`)
      const body = await res.json()
      assert.ok(body.entries.length >= 1)
    } finally {
      server.stop()
    }
  })

  it('GET / filters by metadata key/value', async () => {
    const logger = logdb({ pg, table: tableName })
    await logger.log({ level: 'info', source: 'test', message: 'a', metadata: { service: 'auth' } })
    await logger.log({ level: 'info', source: 'test', message: 'b', metadata: { service: 'api' } })

    const handler = logger.handler()
    const { server, url } = await createTestServer(handler)
    try {
      await server.ready

      const res = await fetch(`${url}/?meta.service=auth`)
      const body = await res.json()
      assert.equal(body.entries.length, 1)
      assert.equal(body.entries[0].message, 'a')
    } finally {
      server.stop()
    }
  })

  it('GET / filters by multiple metadata keys', async () => {
    const logger = logdb({ pg, table: tableName })
    await logger.log({ level: 'info', source: 'test', message: 'a', metadata: { service: 'auth', env: 'prod' } })
    await logger.log({ level: 'info', source: 'test', message: 'b', metadata: { service: 'auth', env: 'dev' } })

    const handler = logger.handler()
    const { server, url } = await createTestServer(handler)
    try {
      await server.ready

      const res = await fetch(`${url}/?meta.service=auth&meta.env=prod`)
      const body = await res.json()
      assert.equal(body.entries.length, 1)
      assert.equal(body.entries[0].message, 'a')
    } finally {
      server.stop()
    }
  })

  it('GET /:id returns single entry', async () => {
    const logger = logdb({ pg, table: tableName })
    const entry = await logger.log({ level: 'info', source: 'test', message: 'findme' })

    const handler = logger.handler()
    const { server, url } = await createTestServer(handler)
    try {
      await server.ready

      const res = await fetch(`${url}/${entry.id}`)
      assert.equal(res.status, 200)
      const found = await res.json()
      assert.equal(found.id, entry.id)
      assert.equal(found.message, 'findme')
    } finally {
      server.stop()
    }
  })

  it('GET /:id returns 404 for missing', async () => {
    const logger = logdb({ pg, table: tableName })
    const handler = logger.handler()
    const { server, url } = await createTestServer(handler)
    try {
      await server.ready

      const res = await fetch(`${url}/999999`)
      assert.equal(res.status, 404)
    } finally {
      server.stop()
    }
  })

  it('clean drops old partitions', async () => {
    const logger = logdb({ pg, table: tableName })

    const oldPart = `${tableName}_2020_01`
    await pg.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS "${oldPart}"
      PARTITION OF "${tableName}"
      FOR VALUES FROM ('2020-01-01') TO ('2020-02-01')
    `)

    const dropped = await logger.clean(12)
    assert.ok(dropped >= 1)
  })
})
