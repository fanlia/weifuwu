import type { Sql } from '../vendor.ts'
import { Router } from '../router.ts'
import type { AgentConfig, RunParams } from './types.ts'

interface RestDeps {
  sql: Sql<{}>
  runner: {
    run: (agentId: number, params: RunParams) => Promise<any>
    addKnowledge: (agentId: number, title: string, content: string) => Promise<any>
  }
}

async function getAgent(sql: Sql<{}>, id: number): Promise<AgentConfig | null> {
  const [row] = await sql`SELECT * FROM "_agents" WHERE id = ${id} LIMIT 1`
  return (row as AgentConfig) ?? null
}

export function buildRouter(deps: RestDeps): Router {
  const { sql, runner } = deps
  const r = new Router()

  // ── Agent CRUD ─────────────────────────────────────────

  r.post('/agents', async (req) => {
    const body = await req.json() as Partial<AgentConfig>
    if (!body.name) return Response.json({ error: 'name is required' }, { status: 400 })

    const [row] = await sql`
      INSERT INTO "_agents" ("name", "description", "type", "model", "system_prompt", "owner_id")
      VALUES (${body.name}, ${body.description || ''}, ${body.type || 'chat'}, ${body.model || ''}, ${body.system_prompt || ''}, ${body.owner_id || 1})
      RETURNING *
    `
    return Response.json(row, { status: 201 })
  })

  r.get('/agents', async () => {
    const rows = await sql`SELECT * FROM "_agents" ORDER BY created_at DESC`
    return Response.json(rows)
  })

  r.get('/agents/:id', async (_req, ctx) => {
    const agent = await getAgent(sql, parseInt(ctx.params.id, 10))
    if (!agent) return Response.json({ error: 'Agent not found' }, { status: 404 })
    return Response.json(agent)
  })

  r.patch('/agents/:id', async (req, ctx) => {
    const id = parseInt(ctx.params.id, 10)
    const agent = await getAgent(sql, id)
    if (!agent) return Response.json({ error: 'Agent not found' }, { status: 404 })

    const body = await req.json() as Partial<AgentConfig>
    const fields: string[] = []
    const values: any[] = []
    let idx = 1

    for (const key of ['name', 'description', 'type', 'model', 'system_prompt', 'active'] as const) {
      if (body[key] !== undefined) {
        fields.push(`"${key}" = $${idx++}`)
        values.push(body[key])
      }
    }

    if (fields.length === 0) return Response.json({ error: 'No fields to update' }, { status: 400 })
    values.push(id)
    fields.push(`"updated_at" = NOW()`)

    const [row] = await sql.unsafe(
      `UPDATE "_agents" SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    )
    return Response.json(row)
  })

  r.delete('/agents/:id', async (_req, ctx) => {
    const id = parseInt(ctx.params.id, 10)
    const [row] = await sql`DELETE FROM "_agents" WHERE id = ${id} RETURNING 1`
    if (!row) return Response.json({ error: 'Agent not found' }, { status: 404 })
    return Response.json({ ok: true })
  })

  // ── Run ────────────────────────────────────────────────

  r.post('/agents/:id/run', async (req, ctx) => {
    const id = parseInt(ctx.params.id, 10)
    const body = await req.json() as RunParams
    if (!body.input && !body.messages) {
      return Response.json({ error: 'input or messages is required' }, { status: 400 })
    }

    try {
      const result = await runner.run(id, body)

      if ('stream' in result) {
        return new Response(result.stream, {
          headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        })
      }

      return Response.json(result)
    } catch (err: any) {
      return Response.json({ error: err.message }, { status: 500 })
    }
  })

  // ── Knowledge ──────────────────────────────────────────

  r.post('/agents/:id/knowledge', async (req, ctx) => {
    const agentId = parseInt(ctx.params.id, 10)
    const agent = await getAgent(sql, agentId)
    if (!agent) return Response.json({ error: 'Agent not found' }, { status: 404 })

    const body = await req.json() as { title?: string; content: string }
    if (!body.content) return Response.json({ error: 'content is required' }, { status: 400 })

    try {
      const doc = await runner.addKnowledge(agentId, body.title || '', body.content)
      return Response.json(doc, { status: 201 })
    } catch (err: any) {
      return Response.json({ error: err.message }, { status: 500 })
    }
  })

  r.get('/agents/:id/knowledge', async (_req, ctx) => {
    const agentId = parseInt(ctx.params.id, 10)
    const rows = await sql`
      SELECT id, title, created_at FROM "_knowledge_documents"
      WHERE agent_id = ${agentId}
      ORDER BY created_at DESC
    `
    return Response.json(rows)
  })

  r.delete('/agents/:id/knowledge/:docId', async (_req, ctx) => {
    const agentId = parseInt(ctx.params.id, 10)
    const docId = parseInt(ctx.params.docId, 10)
    await sql`DELETE FROM "_knowledge_documents" WHERE id = ${docId} AND agent_id = ${agentId}`
    return Response.json({ ok: true })
  })

  return r
}
