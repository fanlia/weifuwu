import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { postgres } from '../postgres/index.ts'
import { opencode } from '../opencode/index.ts'
import type { PostgresClient } from '../postgres/types.ts'
import type { OpencodeModule } from '../opencode/types.ts'

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL

describe('opencode', { skip: !DATABASE_URL }, () => {
  let pg: PostgresClient
  let mod: OpencodeModule

  before(async () => {
    pg = postgres({ connection: DATABASE_URL })
    mod = await opencode({ pg })
    await mod.migrate()
  })

  after(async () => {
    await pg.sql.unsafe('DROP TABLE IF EXISTS "_opencode_messages" CASCADE')
    await pg.sql.unsafe('DROP TABLE IF EXISTS "_opencode_sessions" CASCADE')
    await mod.close()
  })

  it('creates a session via router', async () => {
    const res = await mod.handler()(
      new Request('http://localhost/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test Session' }),
      }),
      { params: {}, query: {} } as any,
    )
    assert.equal(res.status, 201)
    const body = (await res.json()) as any
    assert.ok(body.id)
    assert.equal(body.title, 'Test Session')
    assert.equal(body.agent_type, 'build')
    await pg.sql`DELETE FROM "_opencode_sessions" WHERE id = ${body.id}`
  })

  it('lists sessions', async () => {
    await pg.sql`INSERT INTO "_opencode_sessions" ("title", "user_id") VALUES ('ListTest', 1)`
    const res = await mod.handler()(new Request('http://localhost/sessions'), {
      params: {},
      query: {},
    } as any)
    assert.equal(res.status, 200)
    const list = (await res.json()) as any[]
    assert.ok(list.length >= 1)
    await pg.sql`DELETE FROM "_opencode_sessions"`
  })

  it('gets a session by id', async () => {
    const [row] = (await pg.sql`
      INSERT INTO "_opencode_sessions" ("title", "user_id") VALUES ('GetTest', 1) RETURNING *
    `) as any
    const res = await mod.handler()(new Request(`http://localhost/sessions/${row.id}`), {
      params: { id: String(row.id) },
      query: {},
    } as any)
    assert.equal(res.status, 200)
    const { session } = (await res.json()) as any
    assert.equal(session.id, row.id)
    assert.equal(session.title, 'GetTest')
    await pg.sql`DELETE FROM "_opencode_sessions" WHERE id = ${row.id}`
  })

  it('deletes a session', async () => {
    const [row] = (await pg.sql`
      INSERT INTO "_opencode_sessions" ("title", "user_id") VALUES ('DeleteTest', 1) RETURNING *
    `) as any
    const res = await mod.handler()(
      new Request(`http://localhost/sessions/${row.id}`, { method: 'DELETE' }),
      { params: { id: String(row.id) }, query: {} } as any,
    )
    assert.equal(res.status, 204)
    const [check] = (await pg.sql`
      SELECT * FROM "_opencode_sessions" WHERE id = ${row.id}
    `) as any
    assert.equal(check.active, false)
  })

  it('builds system prompt with skills', async () => {
    const { buildSystemPrompt } = await import('../opencode/prompt.ts')
    const prompt = buildSystemPrompt({
      workspace: '/test',
      model: 'deepseek-v4-flash',
      skills: [{ name: 'test-skill', description: 'A test skill', content: 'Do something' }],
      systemPrompt: 'Custom instruction',
    })
    assert.ok(prompt.includes('/test'))
    assert.ok(prompt.includes('deepseek-v4-flash'))
    assert.ok(prompt.includes('Use the skill tool to load relevant skills when needed.'))
    assert.ok(prompt.includes('Custom instruction'))
  })

  it('checks permissions', async () => {
    const { isCommandAllowed, isPathAllowed, isToolEnabled } =
      await import('../opencode/permissions.ts')

    assert.equal(isCommandAllowed('ls -la'), true)
    assert.equal(isCommandAllowed('rm -rf /'), false)
    assert.equal(isCommandAllowed('mkfs.ext4 /dev/sda'), false)

    assert.equal(isPathAllowed('/workspace/src/file.ts', '/workspace'), true)
    assert.equal(isPathAllowed('/other/file.ts', '/workspace'), false)
    assert.equal(isPathAllowed('/workspace/.env', '/workspace'), false)

    const perms = { read: { allow: true }, bash: { allow: false } }
    assert.equal(isToolEnabled('read', perms as any), true)
    assert.equal(isToolEnabled('bash', perms as any), false)
    assert.equal(isToolEnabled('grep', perms as any), true)
  })
})
