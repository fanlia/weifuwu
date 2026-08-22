/**
 * agent-builder 世界 API——worlds/agents/relations/events CRUD
 *
 * Phase 1（世界数据模型）：四个表 + CRUD——纯框架（serve/Router/postgres）
 * Phase 2 起：events POST 触发回合引擎（叙事/批处理调度）
 */
import type { Router } from 'weifuwu'
import { runEventTurns } from '../services/engine.ts'

export interface WorldCtx {
  sql: {
    unsafe<T = Record<string, unknown>>(q: string, params?: unknown[]): Promise<T[]>
  }
  ai: {
    chat(params: { model?: string; messages: Array<{ role: string; content: string }>; temperature?: number; max_tokens?: number }): Promise<{
      choices: Array<{ message: { content?: string } }>
    }>
  }
}

// ── schema（CREATE IF NOT EXISTS——绝不 DROP） ──
export const WORLD_SCHEMA = `
CREATE TABLE IF NOT EXISTS ab_worlds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'narrative',
  status text NOT NULL DEFAULT 'active',
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ab_agents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES ab_worlds(id) ON DELETE CASCADE,
  name text NOT NULL,
  persona text NOT NULL DEFAULT '',
  capabilities jsonb NOT NULL DEFAULT '["speak"]',
  status text NOT NULL DEFAULT 'idle',
  weight int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ab_agents_world ON ab_agents(world_id);
CREATE TABLE IF NOT EXISTS ab_relations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES ab_worlds(id) ON DELETE CASCADE,
  from_agent uuid NOT NULL REFERENCES ab_agents(id) ON DELETE CASCADE,
  to_agent uuid NOT NULL REFERENCES ab_agents(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT '关联',
  strength int NOT NULL DEFAULT 1,
  directed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ab_relations_world ON ab_relations(world_id);
CREATE TABLE IF NOT EXISTS ab_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL REFERENCES ab_worlds(id) ON DELETE CASCADE,
  type text NOT NULL DEFAULT 'action',
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ab_events_world ON ab_events(world_id);
CREATE TABLE IF NOT EXISTS ab_turns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES ab_events(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL REFERENCES ab_agents(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'dialogue',
  input text NOT NULL DEFAULT '',
  output text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'running',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ab_turns_event ON ab_turns(event_id);
CREATE TABLE IF NOT EXISTS ab_chats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES ab_agents(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'consult',
  input text NOT NULL DEFAULT '',
  output text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ab_chats_agent ON ab_chats(agent_id);
`

const row = (r: any) => r
const json = (v: unknown): string => JSON.stringify(v ?? {})

export function registerWorldRoutes(app: Router<WorldCtx>): void {
  // ── worlds ────────────────────────────────────────────
  app.get('/api/worlds', async (_req, ctx) => {
    const rows = await ctx.sql.unsafe(
      `SELECT w.*, (SELECT COUNT(*)::int FROM ab_agents a WHERE a.world_id = w.id) AS agent_count,
              (SELECT COUNT(*)::int FROM ab_events e WHERE e.world_id = w.id) AS event_count
       FROM ab_worlds w ORDER BY w.created_at DESC`)
    return Response.json({ worlds: rows })
  })

  app.post('/api/worlds', async (req, ctx) => {
    const body = await req.json().catch(() => ({}))
    if (!body.name?.trim()) return Response.json({ error: '世界名称必填' }, { status: 400 })
    const [w] = await ctx.sql.unsafe(
      `INSERT INTO ab_worlds (name, type, config) VALUES ($1, $2, $3) RETURNING *`,
      [String(body.name).trim(), body.type ?? 'narrative', json(body.config)],
    )
    return Response.json({ world: row(w) }, { status: 201 })
  })

  app.get('/api/worlds/:id', async (req, ctx) => {
    const id = String(ctx.params?.id ?? '')
    const [w] = await ctx.sql.unsafe(`SELECT * FROM ab_worlds WHERE id = $1`, [id])
    if (!w) return Response.json({ error: '世界不存在' }, { status: 404 })
    const agents = await ctx.sql.unsafe(
      `SELECT a.*, (SELECT COUNT(*)::int FROM ab_relations r WHERE r.from_agent = a.id) AS out_degree
       FROM ab_agents a WHERE a.world_id = $1 ORDER BY a.created_at`, [id])
    const relations = await ctx.sql.unsafe(
      `SELECT r.*, r.from_agent AS from, r.to_agent AS to, fa.name AS from_name, ta.name AS to_name
       FROM ab_relations r JOIN ab_agents fa ON fa.id = r.from_agent JOIN ab_agents ta ON ta.id = r.to_agent
       WHERE r.world_id = $1 ORDER BY r.created_at`, [id])
    const events = await ctx.sql.unsafe(`SELECT * FROM ab_events WHERE world_id = $1 ORDER BY created_at DESC LIMIT 50`, [id])
    // 最近 50 事件的回合（子查询——无数组参数——协议层数组编码问题绕开）
    const turns = await ctx.sql.unsafe(
      `SELECT t.*, a.name AS agent_name FROM ab_turns t JOIN ab_agents a ON a.id = t.agent_id
       WHERE t.event_id IN (SELECT id FROM ab_events WHERE world_id = $1 ORDER BY created_at DESC LIMIT 50)
       ORDER BY t.created_at`, [id])
    return Response.json({ world: row(w), agents, relations, events, turns })
  })

  app.patch('/api/worlds/:id', async (req, ctx) => {
    const id = String(ctx.params?.id ?? '')
    const body = await req.json().catch(() => ({}))
    const [w] = await ctx.sql.unsafe(
      `UPDATE ab_worlds SET name = COALESCE($2, name), type = COALESCE($3, type), config = COALESCE($4, config)
       WHERE id = $1 RETURNING *`,
      [id, body.name ?? null, body.type ?? null, body.config !== undefined ? json(body.config) : null],
    )
    if (!w) return Response.json({ error: '世界不存在' }, { status: 404 })
    return Response.json({ world: row(w) })
  })

  app.delete('/api/worlds/:id', async (req, ctx) => {
    const id = String(ctx.params?.id ?? '')
    await ctx.sql.unsafe(`DELETE FROM ab_worlds WHERE id = $1`, [id])
    return Response.json({ ok: true })
  })

  // ── agents（世界角色） ─────────────────────────────────
  app.post('/api/worlds/:id/agents', async (req, ctx) => {
    const worldId = String(ctx.params?.id ?? '')
    const body = await req.json().catch(() => ({}))
    if (!body.name?.trim()) return Response.json({ error: '角色名称必填' }, { status: 400 })
    const [a] = await ctx.sql.unsafe(
      `INSERT INTO ab_agents (world_id, name, persona, capabilities, weight)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [worldId, String(body.name).trim(), body.persona ?? '', json(body.capabilities ?? ['speak']), body.weight ?? 1],
    )
    return Response.json({ agent: row(a) }, { status: 201 })
  })

  app.patch('/api/agents/:id', async (req, ctx) => {
    const id = String(ctx.params?.id ?? '')
    const body = await req.json().catch(() => ({}))
    const [a] = await ctx.sql.unsafe(
      `UPDATE ab_agents SET name = COALESCE($2, name), persona = COALESCE($3, persona),
        capabilities = COALESCE($4, capabilities), weight = COALESCE($5, weight)
       WHERE id = $1 RETURNING *`,
      [id, body.name ?? null, body.persona ?? null,
       body.capabilities !== undefined ? json(body.capabilities) : null, body.weight ?? null],
    )
    if (!a) return Response.json({ error: '角色不存在' }, { status: 404 })
    return Response.json({ agent: row(a) })
  })

  app.delete('/api/agents/:id', async (req, ctx) => {
    const id = String(ctx.params?.id ?? '')
    await ctx.sql.unsafe(`DELETE FROM ab_agents WHERE id = $1`, [id])
    return Response.json({ ok: true })
  })

  // ── 定向对话（Phase 3——与任一角色随时对话——咨询/干预） ──
  app.post('/api/agents/:id/chat', async (req, ctx) => {
    const agentId = String(ctx.params?.id ?? '')
    const body = await req.json().catch(() => ({}))
    const message = String(body.message ?? '').trim()
    if (!message) return Response.json({ error: '消息必填' }, { status: 400 })
    const mode = body.mode === 'intervene' ? 'intervene' : 'consult'
    const [agent] = await ctx.sql.unsafe<{ id: string; name: string; persona: string; world_id: string }>(
      'SELECT * FROM ab_agents WHERE id = $1', [agentId])
    if (!agent) return Response.json({ error: '角色不存在' }, { status: 404 })
    const [world] = await ctx.sql.unsafe<{ name: string }>('SELECT name FROM ab_worlds WHERE id = $1', [agent.world_id])
    const relations = await ctx.sql.unsafe(
      `SELECT r.*, fa.name AS from_name, ta.name AS to_name
       FROM ab_relations r JOIN ab_agents fa ON fa.id = r.from_agent JOIN ab_agents ta ON ta.id = r.to_agent
       WHERE r.world_id = $1`, [agent.world_id])
    const memory = await ctx.sql.unsafe<{ input: string; output: string }>(
      'SELECT c.input, c.output FROM ab_chats c WHERE c.agent_id = $1 ORDER BY c.created_at DESC LIMIT 6', [agentId])
    const sys = [
      `你在世界「${world?.name ?? ''}」中扮演：${agent.name}。`,
      `人设：${agent.persona || '（未设定——请保持中立自然）'}`,
      relations.length ? `你与世界其他角色的关系：\n${relations
        .filter((r: any) => r.from_agent === agentId || r.to_agent === agentId)
        .map((r: any) => `- ${r.from_agent === agentId ? (r.to_name ?? r.to_agent) : (r.from_name ?? r.from_agent)}（${r.type}·强度 ${r.strength}）`).join('\n')}` : '',
      memory.length ? `你最近的对话记忆：\n${memory.map((m: any) => `- 你曾说：「${m.output.slice(0, 100)}」`).join('\n')}` : '',
      '用第一人称回答，符合你的性格与立场，2-4 句话。',
    ].filter(Boolean).join('\n\n')
    let output = ''
    try {
      const res = await ctx.ai.chat({
        model: process.env.DEEPSEEK_MODEL ?? 'deepseek-v4-flash',
        messages: [
          { role: 'system', content: sys },
          { role: 'user', content: `用户对你说：${message}` },
        ],
        temperature: 0.8,
        max_tokens: 500,
      })
      output = res.choices?.[0]?.message?.content ?? ''
    } catch (e) {
      return Response.json({ error: `对话失败：${(e as Error).message}` }, { status: 500 })
    }
    const [chat] = await ctx.sql.unsafe(
      'INSERT INTO ab_chats (agent_id, mode, input, output) VALUES ($1, $2, $3, $4) RETURNING *',
      [agentId, mode, message, output])
    // 干预模式：你的话成为世界事件（全员回合——世界响应你的意见）
    let event: unknown = null
    if (mode === 'intervene') {
      const [ev] = await ctx.sql.unsafe(
        `INSERT INTO ab_events (world_id, type, payload) VALUES ($1, 'directive', $2) RETURNING *`,
        [agent.world_id, json({ description: `用户对 ${agent.name} 说：「${message}」——请全体回应你的立场。` })])
      event = ev
      void runEventTurns(ctx, String(ev.id))
    }
    return Response.json({ chat: { ...row(chat), agent_name: agent.name }, event })
  })

  // ── chats（角色对话历史——Phase 3 定向对话） ──────────────
  app.get('/api/agents/:id/chats', async (req, ctx) => {
    const agentId = String(ctx.params?.id ?? '')
    const rows = await ctx.sql.unsafe(
      `SELECT c.*, a.name AS agent_name FROM ab_chats c JOIN ab_agents a ON a.id = c.agent_id
       WHERE c.agent_id = $1 ORDER BY c.created_at DESC LIMIT 20`, [agentId])
    return Response.json({ chats: rows.reverse() })
  })

  // ── relations（关系） ─────────────────────────────────
  app.post('/api/worlds/:id/relations', async (req, ctx) => {
    const worldId = String(ctx.params?.id ?? '')
    const body = await req.json().catch(() => ({}))
    if (!body.from || !body.to) return Response.json({ error: 'from/to 必填' }, { status: 400 })
    const [r] = await ctx.sql.unsafe(
      `INSERT INTO ab_relations (world_id, from_agent, to_agent, type, strength, directed)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [worldId, body.from, body.to, body.type ?? '关联', body.strength ?? 1, !!body.directed],
    )
    return Response.json({ relation: row(r) }, { status: 201 })
  })

  app.delete('/api/relations/:id', async (req, ctx) => {
    const id = String(ctx.params?.id ?? '')
    await ctx.sql.unsafe(`DELETE FROM ab_relations WHERE id = $1`, [id])
    return Response.json({ ok: true })
  })

  // ── events（事件——Phase 2 触发回合） ──────────────────
  app.get('/api/worlds/:id/events', async (req, ctx) => {
    const id = String(ctx.params?.id ?? '')
    const rows = await ctx.sql.unsafe(`SELECT * FROM ab_events WHERE world_id = $1 ORDER BY created_at DESC LIMIT 50`, [id])
    return Response.json({ events: rows })
  })

  app.post('/api/worlds/:id/events', async (req, ctx) => {
    const worldId = String(ctx.params?.id ?? '')
    const body = await req.json().catch(() => ({}))
    const [e] = await ctx.sql.unsafe(
      `INSERT INTO ab_events (world_id, type, payload) VALUES ($1, $2, $3) RETURNING *`,
      [worldId, body.type ?? 'action', json(body.payload)],
    )
    // 触发回合引擎（异步——POST 不阻塞——叙事流轮询可见）
    void runEventTurns(ctx, String(e.id))
    return Response.json({ event: row(e) }, { status: 201 })
  })
}
