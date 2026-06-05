import type { Sql } from '../vendor.ts'
import { Router } from '../router.ts'
import { broadcastToChannel } from './ws.ts'
import type { AgentModule } from '../agent/types.ts'
import type { Hub } from '../hub.ts'
import { eq, lt } from '../postgres/schema/index.ts'
import type { BoundTable } from '../postgres/schema/index.ts'

interface RestDeps {
  sql: Sql<{}>
  channels: BoundTable<any>
  members: BoundTable<any>
  messages: BoundTable<any>
  agents?: AgentModule
  hub: Hub
}

export function buildRouter(deps: RestDeps): Router {
  const { sql, channels, members, messages, agents, hub } = deps
  const r = new Router()

  // ── Channels ───────────────────────────────────────────

  r.post('/channels', async (req) => {
    const body = await req.json() as any
    if (!body.name) return Response.json({ error: 'name is required' }, { status: 400 })

    const channel = await channels.insert({
      name: body.name,
      type: body.type || 'channel',
      created_by: body.created_by || 1,
    })

    // Add creator as admin member
    await members.insert({
      channel_id: channel.id,
      member_id: channel.created_by,
      member_type: 'user',
      role: 'admin',
    })

    // Add additional members
    if (Array.isArray(body.members)) {
      for (const m of body.members) {
        await members.upsert(
          {
            channel_id: channel.id,
            member_id: m.member_id ?? m,
            member_type: m.member_type ?? 'user',
            role: m.role ?? 'member',
          },
          ['channel_id', 'member_id', 'member_type'],
        )
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
    const ch = await channels.read(id)
    if (!ch) return Response.json({ error: 'Channel not found' }, { status: 404 })

    const { data: memberRows } = await members.readMany({ channel_id: id })
    return Response.json({ channel: ch, members: memberRows })
  })

  r.delete('/channels/:id', async (_req, ctx) => {
    const id = parseInt(ctx.params.id, 10)
    await channels.delete(id)
    return Response.json({ ok: true })
  })

  // ── Members ────────────────────────────────────────────

  r.post('/channels/:id/members', async (req, ctx) => {
    const channelId = parseInt(ctx.params.id, 10)
    const body = await req.json() as any
    await members.upsert(
      {
        channel_id: channelId,
        member_id: body.member_id,
        member_type: body.member_type || 'user',
        role: body.role || 'member',
      },
      ['channel_id', 'member_id', 'member_type'],
    )
    return Response.json({ ok: true }, { status: 201 })
  })

  r.delete('/channels/:id/members/:memberId', async (_req, ctx) => {
    const channelId = parseInt(ctx.params.id, 10)
    const memberId = parseInt(ctx.params.memberId, 10)
    await members.deleteMany([eq('channel_id', channelId), eq('member_id', memberId)])
    return Response.json({ ok: true })
  })

  // ── Messages ───────────────────────────────────────────

  r.get('/channels/:id/messages', async (req, ctx) => {
    const channelId = parseInt(ctx.params.id, 10)
    const url = new URL(req.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100)
    const before = url.searchParams.get('before')

    if (before) {
      const { data: rows } = await messages.readMany(
        [eq('channel_id', channelId), lt('id', parseInt(before, 10))],
        { orderBy: { created_at: 'desc' }, limit },
      )
      return Response.json({ rows: rows.reverse(), count: rows.length })
    }

    const { data: rows } = await messages.readMany(
      { channel_id: channelId },
      { orderBy: { created_at: 'desc' }, limit },
    )
    return Response.json({ rows: rows.reverse(), count: rows.length })
  })

  r.post('/channels/:id/messages', async (req, ctx) => {
    const channelId = parseInt(ctx.params.id, 10)
    const body = await req.json() as any
    if (!body.content) return Response.json({ error: 'content is required' }, { status: 400 })

    const msg = await messages.insert({
      channel_id: channelId,
      sender_id: body.sender_id ?? 1,
      sender_type: body.sender_type || 'user',
      type: body.type || 'text',
      content: body.content,
    })

    // Broadcast via WebSocket
    broadcastToChannel(hub, channelId, { type: 'message', data: msg })

    // Agent routing
    if (agents) {
      const agentMembers = await sql`
        SELECT member_id FROM "_channel_members"
        WHERE channel_id = ${channelId} AND member_type = 'agent'
      ` as any[]

      for (const am of agentMembers) {
        agents.run(am.member_id, { input: body.content, stream: false }).then(result => {
          if ('output' in result && result.output) {
            messages.insert({
              channel_id: channelId,
              sender_id: am.member_id,
              sender_type: 'agent',
              content: result.output,
            }).then((r) => {
              broadcastToChannel(hub, channelId, { type: 'message', data: r })
            }).catch((e) => {
              console.error('[messager] agent reply insert failed:', e)
            })
          }
        }).catch((e) => {
          console.error('[messager] agent run failed:', e)
        })
      }
    }

    return Response.json(msg, { status: 201 })
  })

  // ── Read receipts ──────────────────────────────────────

  r.post('/channels/:id/read', async (req, ctx) => {
    const channelId = parseInt(ctx.params.id, 10)
    const body = await req.json() as { last_message_id: number; user_id?: number }
    const userId = body.user_id ?? (ctx as any).user?.id ?? 1

    await members.updateMany(
      [eq('channel_id', channelId), eq('member_id', userId), eq('member_type', 'user')],
      { last_read_id: body.last_message_id },
    )
    return Response.json({ ok: true })
  })

  // ── Upload ─────────────────────────────────────────────

  r.post('/upload', async (req) => {
    const body = await req.json() as { file_url?: string; file_name?: string; file_size?: number; mime_type?: string }
    return Response.json(body, { status: 201 })
  })

  return r
}
