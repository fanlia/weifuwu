import type { Sql } from 'postgres'
import { Router } from '../router.ts'
import { broadcastToChannel } from './ws.ts'
import type { AgentModule } from '../agent/types.ts'

interface RestDeps {
  sql: Sql<{}>
  agents?: AgentModule
}

export function buildRouter(deps: RestDeps): Router {
  const { sql, agents } = deps
  const r = new Router()

  // ── Channels ───────────────────────────────────────────

  r.post('/channels', async (req) => {
    const body = await req.json() as any
    if (!body.name) return Response.json({ error: 'name is required' }, { status: 400 })

    const [ch] = await sql`
      INSERT INTO "_channels" ("name", "type", "created_by")
      VALUES (${body.name}, ${body.type || 'channel'}, ${body.created_by || 1})
      RETURNING *
    `
    const channel = ch as any

    // Add creator as admin member
    await sql`
      INSERT INTO "_channel_members" ("channel_id", "member_id", "member_type", "role")
      VALUES (${channel.id}, ${channel.created_by}, 'user', 'admin')
    `

    // Add additional members
    if (Array.isArray(body.members)) {
      for (const m of body.members) {
        await sql`
          INSERT INTO "_channel_members" ("channel_id", "member_id", "member_type", "role")
          VALUES (${channel.id}, ${m.member_id ?? m}, ${m.member_type ?? 'user'}, ${m.role ?? 'member'})
          ON CONFLICT DO NOTHING
        `
      }
    }

    return Response.json(channel, { status: 201 })
  })

  r.get('/channels', async (_req, ctx) => {
    const userId = (ctx as any).user?.id ?? 1
    const rows = await sql`
      SELECT c.*, (
        SELECT content FROM "_messages"
        WHERE channel_id = c.id
        ORDER BY created_at DESC LIMIT 1
      ) AS last_message
      FROM "_channels" c
      JOIN "_channel_members" m ON m.channel_id = c.id
      WHERE m.member_id = ${userId} AND m.member_type = 'user'
      ORDER BY c.created_at DESC
    `
    return Response.json(rows)
  })

  r.get('/channels/:id', async (_req, ctx) => {
    const id = parseInt(ctx.params.id, 10)
    const [ch] = await sql`SELECT * FROM "_channels" WHERE id = ${id} LIMIT 1`
    if (!ch) return Response.json({ error: 'Channel not found' }, { status: 404 })

    const members = await sql`
      SELECT * FROM "_channel_members" WHERE channel_id = ${id}
    `
    return Response.json({ channel: ch, members })
  })

  r.delete('/channels/:id', async (_req, ctx) => {
    const id = parseInt(ctx.params.id, 10)
    await sql`DELETE FROM "_channels" WHERE id = ${id}`
    return Response.json({ ok: true })
  })

  // ── Members ────────────────────────────────────────────

  r.post('/channels/:id/members', async (req, ctx) => {
    const channelId = parseInt(ctx.params.id, 10)
    const body = await req.json() as any
    await sql`
      INSERT INTO "_channel_members" ("channel_id", "member_id", "member_type", "role")
      VALUES (${channelId}, ${body.member_id}, ${body.member_type || 'user'}, ${body.role || 'member'})
      ON CONFLICT DO NOTHING
    `
    return Response.json({ ok: true }, { status: 201 })
  })

  r.delete('/channels/:id/members/:memberId', async (_req, ctx) => {
    const channelId = parseInt(ctx.params.id, 10)
    const memberId = parseInt(ctx.params.memberId, 10)
    await sql`
      DELETE FROM "_channel_members"
      WHERE channel_id = ${channelId} AND member_id = ${memberId}
    `
    return Response.json({ ok: true })
  })

  // ── Messages ───────────────────────────────────────────

  r.get('/channels/:id/messages', async (req, ctx) => {
    const channelId = parseInt(ctx.params.id, 10)
    const url = new URL(req.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100)
    const before = url.searchParams.get('before')

    if (before) {
      const rows = await sql`
        SELECT * FROM "_messages"
        WHERE channel_id = ${channelId} AND id < ${parseInt(before, 10)}
        ORDER BY created_at DESC LIMIT ${limit}
      `
      return Response.json({ rows: rows.reverse(), count: (rows as any[]).length })
    }

    const rows = await sql`
      SELECT * FROM "_messages"
      WHERE channel_id = ${channelId}
      ORDER BY created_at DESC LIMIT ${limit}
    `
    return Response.json({ rows: rows.reverse(), count: (rows as any[]).length })
  })

  r.post('/channels/:id/messages', async (req, ctx) => {
    const channelId = parseInt(ctx.params.id, 10)
    const body = await req.json() as any
    if (!body.content) return Response.json({ error: 'content is required' }, { status: 400 })

    const [row] = await sql`
      INSERT INTO "_messages" ("channel_id", "sender_id", "sender_type", "type", "content")
      VALUES (${channelId}, ${body.sender_id ?? 1}, ${body.sender_type || 'user'}, ${body.type || 'text'}, ${body.content})
      RETURNING *
    `
    const msg = row as any

    // Broadcast via WebSocket
    broadcastToChannel(channelId, { type: 'message', data: msg })

    // Agent routing
    if (agents) {
      const agentMembers = await sql`
        SELECT member_id FROM "_channel_members"
        WHERE channel_id = ${channelId} AND member_type = 'agent'
      ` as any[]

      for (const am of agentMembers) {
        agents.run(am.member_id, { input: body.content, stream: false }).then(result => {
          if ('output' in result && result.output) {
            sql`
              INSERT INTO "_messages" ("channel_id", "sender_id", "sender_type", "content")
              VALUES (${channelId}, ${am.member_id}, 'agent', ${result.output})
            `.then(([r]) => {
              broadcastToChannel(channelId, { type: 'message', data: r })
            })
          }
        }).catch(() => {})
      }
    }

    return Response.json(msg, { status: 201 })
  })

  // ── Read receipts ──────────────────────────────────────

  r.post('/channels/:id/read', async (req, ctx) => {
    const channelId = parseInt(ctx.params.id, 10)
    const body = await req.json() as { last_message_id: number; user_id?: number }
    const userId = body.user_id ?? (ctx as any).user?.id ?? 1

    await sql`
      UPDATE "_channel_members"
      SET last_read_id = ${body.last_message_id}, last_read_at = NOW()
      WHERE channel_id = ${channelId} AND member_id = ${userId} AND member_type = 'user'
    `
    return Response.json({ ok: true })
  })

  // ── Upload ─────────────────────────────────────────────

  r.post('/upload', async (req) => {
    const body = await req.json() as { file_url?: string; file_name?: string; file_size?: number; mime_type?: string }
    return Response.json(body, { status: 201 })
  })

  return r
}
