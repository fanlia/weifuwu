import { Router } from '../router.ts'
import { eq, and, gte, type BoundTable } from '../postgres/schema/index.ts'
import type { AgentConfig, RunParams } from './types.ts'

interface RestDeps {
  agents: BoundTable<any>
  runs: BoundTable<any>
  knowledge: BoundTable<any>
  runner: {
    run: (agentId: number, params: RunParams) => Promise<any>
    addKnowledge: (agentId: number, title: string, content: string) => Promise<any>
  }
}

export function buildRouter(deps: RestDeps): Router {
  const { agents: agentsTable, runs: runsTable, knowledge, runner } = deps

  async function getAgent(id: number): Promise<AgentConfig | null> {
    const row = await agentsTable.read(id)
    return (row as AgentConfig) ?? null
  }

  const r = new Router()

  // ── Agent CRUD ─────────────────────────────────────────

  r.post('/agents', async (req) => {
    const body = (await req.json()) as Partial<AgentConfig>
    if (!body.name) return Response.json({ error: 'name is required' }, { status: 400 })

    const row = await agentsTable.insert({
      name: body.name,
      description: body.description || '',
      type: body.type || 'chat',
      model: body.model || '',
      system_prompt: body.system_prompt || '',
      owner_id: body.owner_id || 1,
    })
    return Response.json(row, { status: 201 })
  })

  r.get('/agents', async () => {
    const { data: rows } = await agentsTable.readMany(undefined, {
      orderBy: { created_at: 'desc' },
    })
    return Response.json(rows)
  })

  r.get('/agents/:id', async (_req, ctx) => {
    const agent = await getAgent(parseInt(ctx.params.id, 10))
    if (!agent) return Response.json({ error: 'Agent not found' }, { status: 404 })
    return Response.json(agent)
  })

  r.patch('/agents/:id', async (req, ctx) => {
    const id = parseInt(ctx.params.id, 10)
    const agent = await getAgent(id)
    if (!agent) return Response.json({ error: 'Agent not found' }, { status: 404 })

    const body = (await req.json()) as Partial<AgentConfig>
    const updateData: Record<string, unknown> = {}

    for (const key of [
      'name',
      'description',
      'type',
      'model',
      'system_prompt',
      'active',
    ] as const) {
      if (body[key] !== undefined) {
        updateData[key] = body[key]
      }
    }

    if (Object.keys(updateData).length === 0) {
      return Response.json({ error: 'No fields to update' }, { status: 400 })
    }

    const row = await agentsTable.update(id, updateData)
    return Response.json(row)
  })

  r.delete('/agents/:id', async (_req, ctx) => {
    const id = parseInt(ctx.params.id, 10)
    const row = await agentsTable.delete(id)
    if (!row) return Response.json({ error: 'Agent not found' }, { status: 404 })
    return Response.json({ ok: true })
  })

  // ── Run ────────────────────────────────────────────────

  r.post('/agents/:id/run', async (req, ctx) => {
    const id = parseInt(ctx.params.id, 10)
    const body = (await req.json()) as RunParams
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

  // ── Run history & analytics ──────────────────────────

  r.get('/agents/:id/runs', async (_req, ctx) => {
    const agentId = parseInt(ctx.params.id, 10)
    const agent = await getAgent(agentId)
    if (!agent) return Response.json({ error: 'Agent not found' }, { status: 404 })

    const url = new URL(_req.url)
    const days = parseInt(url.searchParams.get('days') || '7', 10)
    const since = new Date()
    since.setDate(since.getDate() - days)
    const sinceStr = since.toISOString()

    const { data: rows } = await runsTable.readMany(
      and(eq('agent_id', agentId), gte('created_at', sinceStr)),
      { orderBy: { created_at: 'desc' }, limit: 100 },
    )
    return Response.json(rows)
  })

  r.get('/agents/:id/runs/summary', async (_req, ctx) => {
    const agentId = parseInt(ctx.params.id, 10)
    const agent = await getAgent(agentId)
    if (!agent) return Response.json({ error: 'Agent not found' }, { status: 404 })

    const url = new URL(_req.url)
    const days = parseInt(url.searchParams.get('days') || '7', 10)
    const since = new Date()
    since.setDate(since.getDate() - days)
    const sinceStr = since.toISOString()

    const { data: rows } = await runsTable.readMany(
      and(eq('agent_id', agentId), gte('created_at', sinceStr)),
      { orderBy: { created_at: 'desc' } },
    )

    const total = rows.length
    const success = rows.filter((r: any) => r.status === 'success' || r.status === 'stream').length
    const error = rows.filter((r: any) => r.status === 'error').length
    const totalTokensIn = rows.reduce((sum: number, r: any) => sum + (r.tokens_in || 0), 0)
    const totalTokensOut = rows.reduce((sum: number, r: any) => sum + (r.tokens_out || 0), 0)
    const totalElapsed = rows.reduce((sum: number, r: any) => sum + (r.elapsed_ms || 0), 0)
    const avgElapsed = total > 0 ? Math.round(totalElapsed / total) : 0

    // P95 elapsed
    const sorted = [...rows].sort((a: any, b: any) => (a.elapsed_ms || 0) - (b.elapsed_ms || 0))
    const p95Idx = Math.ceil(sorted.length * 0.95) - 1
    const p95Elapsed = sorted.length > 0 ? sorted[p95Idx]?.elapsed_ms || 0 : 0

    return Response.json({
      agent_id: agentId,
      period_days: days,
      total,
      success,
      error,
      success_rate: total > 0 ? ((success / total) * 100).toFixed(1) : '0',
      tokens_in: totalTokensIn,
      tokens_out: totalTokensOut,
      avg_elapsed_ms: avgElapsed,
      p95_elapsed_ms: p95Elapsed,
    })
  })

  // ── Knowledge ──────────────────────────────────────────

  r.post('/agents/:id/knowledge', async (req, ctx) => {
    const agentId = parseInt(ctx.params.id, 10)
    const agent = await getAgent(agentId)
    if (!agent) return Response.json({ error: 'Agent not found' }, { status: 404 })

    const body = (await req.json()) as { title?: string; content: string }
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
    const { data: rows } = await knowledge.readMany(
      { agent_id: agentId },
      { orderBy: { created_at: 'desc' }, select: ['id', 'title', 'created_at'] },
    )
    return Response.json(rows)
  })

  r.delete('/agents/:id/knowledge/:docId', async (_req, ctx) => {
    const agentId = parseInt(ctx.params.id, 10)
    const docId = parseInt(ctx.params.docId, 10)
    await knowledge.deleteMany([eq('agent_id', agentId), eq('id', docId)])
    return Response.json({ ok: true })
  })

  return r
}
