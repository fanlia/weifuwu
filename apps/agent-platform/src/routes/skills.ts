/**
 * Skills 路由 — 管理 Agent 技能绑定
 */

import type { Router, Context } from 'weifuwu'

export function registerSkillRoutes(app: Router): void {
  // ── 获取 Agent 已绑定的技能 ─────────────────────────
  app.get('/api/agents/:id/skills', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, params, tenantId } = ctx
    const [agent] = await sql`
      SELECT id, tenant_id FROM agents WHERE id = ${params.id} AND tenant_id = ${tenantId}
    `
    if (!agent) return Response.json({ error: 'Agent 不存在' }, { status: 404 })

    const skills = await sql`
      SELECT id, skill_name, skill_dir, enabled, created_at
      FROM agent_skills
      WHERE agent_id = ${params.id}
      ORDER BY created_at
    `
    return Response.json({ skills })
  })

  // ── 为 Agent 绑定技能 ───────────────────────────────
  app.post('/api/agents/:id/skills', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, params, tenantId } = ctx
    const body = await req.json() as { skill_name: string; skill_dir: string }

    if (!body.skill_name || !body.skill_dir) {
      return Response.json({ error: 'skill_name 和 skill_dir 为必填' }, { status: 400 })
    }

    const [agent] = await sql`
      SELECT id, tenant_id FROM agents WHERE id = ${params.id} AND tenant_id = ${tenantId}
    `
    if (!agent) return Response.json({ error: 'Agent 不存在' }, { status: 404 })

    const [existing] = await sql`
      SELECT id FROM agent_skills WHERE agent_id = ${params.id} AND skill_name = ${body.skill_name}
    `
    if (existing) {
      return Response.json({ error: '该技能已经绑定到此 Agent' }, { status: 409 })
    }

    const [skill] = await sql`
      INSERT INTO agent_skills (agent_id, skill_name, skill_dir)
      VALUES (${params.id}, ${body.skill_name}, ${body.skill_dir})
      RETURNING id, skill_name, skill_dir, enabled, created_at
    `
    return Response.json({ skill }, { status: 201 })
  })

  // ── 更新技能状态 ───────────────────────────────────
  app.put('/api/agents/:id/skills/:skillId', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, params, tenantId } = ctx
    const body = await req.json() as { enabled?: boolean }

    const [agent] = await sql`
      SELECT id FROM agents WHERE id = ${params.id} AND tenant_id = ${tenantId}
    `
    if (!agent) return Response.json({ error: 'Agent 不存在' }, { status: 404 })

    const [skill] = await sql`
      SELECT ask.id FROM agent_skills ask
      JOIN agents a ON a.id = ask.agent_id
      WHERE ask.id = ${params.skillId} AND ask.agent_id = ${params.id}
    `
    if (!skill) return Response.json({ error: '技能绑定不存在' }, { status: 404 })

    const [updated] = await sql`
      UPDATE agent_skills SET enabled = ${body.enabled ?? true}
      WHERE id = ${params.skillId}
      RETURNING id, skill_name, skill_dir, enabled, created_at
    `
    return Response.json({ skill: updated })
  })

  // ── 移除 Agent 技能 ─────────────────────────────────
  app.delete('/api/agents/:id/skills/:skillId', async (req: Request, ctx: Context): Promise<Response> => {
    const { sql, params, tenantId } = ctx

    const [agent] = await sql`
      SELECT id FROM agents WHERE id = ${params.id} AND tenant_id = ${tenantId}
    `
    if (!agent) return Response.json({ error: 'Agent 不存在' }, { status: 404 })

    const result = await sql`
      DELETE FROM agent_skills WHERE id = ${params.skillId} AND agent_id = ${params.id}
    `
    if (result.count === 0) {
      return Response.json({ error: '技能绑定不存在' }, { status: 404 })
    }
    return Response.json({ success: true })
  })
}
