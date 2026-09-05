/**
 * Skills 路由 — 管理 Agent 技能绑定
 */

import type { Router, Context } from 'weifuwu'
import { HttpError } from 'weifuwu'
import { and, eq } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'
import { tables } from '../db/orm.ts'

export function registerSkillRoutes(app: Router<AppCtx>): void {
  // ── 获取 Agent 已绑定的技能 ─────────────────────────
  app.get('/api/agents/:id/skills', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, params, appId } = ctx
    const T = tables(orm)
    const [agent] = await T.agents
      .select('id')
      .where(and(eq(T.agents.c.id, params.id), eq(T.agents.c.app_id, appId)))
      .run()
    if (!agent) throw new HttpError('Agent 不存在', 404)

    const skills = await T.agent_skills
      .select('id', 'skill_name', 'skill_dir', 'enabled', 'created_at')
      .where(eq(T.agent_skills.c.agent_id, params.id))
      .orderBy('created_at', 'asc')
      .run()
    return Response.json({ skills })
  })

  // ── 为 Agent 绑定技能 ───────────────────────────────
  app.post('/api/agents/:id/skills', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, params, appId } = ctx
    const body = await req.json() as { skill_name: string; skill_dir: string }

    if (!body.skill_name || !body.skill_dir) {
      throw new HttpError('skill_name 和 skill_dir 为必填', 400)
    }

    const T = tables(orm)
    const [agent] = await T.agents
      .select('id')
      .where(and(eq(T.agents.c.id, params.id), eq(T.agents.c.app_id, appId)))
      .run()
    if (!agent) throw new HttpError('Agent 不存在', 404)

    const [existing] = await T.agent_skills
      .select('id')
      .where(and(eq(T.agent_skills.c.agent_id, params.id), eq(T.agent_skills.c.skill_name, body.skill_name)))
      .run()
    if (existing) {
      throw new HttpError('该技能已经绑定到此 Agent', 409)
    }

    const [skill] = await T.agent_skills
      .insert({ agent_id: params.id, skill_name: body.skill_name, skill_dir: body.skill_dir })
      .returning('id', 'skill_name', 'skill_dir', 'enabled', 'created_at')
      .run()
    return Response.json({ skill }, { status: 201 })
  })

  // ── 更新技能状态 ───────────────────────────────────
  app.put('/api/agents/:id/skills/:skillId', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, params, appId } = ctx
    const body = await req.json() as { enabled?: boolean }

    const T = tables(orm)
    const [agent] = await T.agents.select('id').where(and(eq(T.agents.c.id, params.id), eq(T.agents.c.app_id, appId))).run()
    if (!agent) throw new HttpError('Agent 不存在', 404)

    const [skill] = await T.agent_skills
      .select('id')
      .where(and(eq(T.agent_skills.c.id, params.skillId), eq(T.agent_skills.c.agent_id, params.id)))
      .run()
    if (!skill) throw new HttpError('技能绑定不存在', 404)

    const [updated] = await T.agent_skills
      .update({ enabled: body.enabled ?? true })
      .where(eq(T.agent_skills.c.id, params.skillId))
      .returning('id', 'skill_name', 'skill_dir', 'enabled', 'created_at')
      .run()
    return Response.json({ skill: updated })
  })

  // ── 移除 Agent 技能 ─────────────────────────────────
  app.delete('/api/agents/:id/skills/:skillId', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { orm, params, appId } = ctx

    const T = tables(orm)
    const [agent] = await T.agents.select('id').where(and(eq(T.agents.c.id, params.id), eq(T.agents.c.app_id, appId))).run()
    if (!agent) throw new HttpError('Agent 不存在', 404)

    const result = await T.agent_skills
      .delete()
      .where(and(eq(T.agent_skills.c.id, params.skillId), eq(T.agent_skills.c.agent_id, params.id)))
      .returning('id')
      .run()
    if (result.length === 0) {
      throw new HttpError('技能绑定不存在', 404)
    }
    return Response.json({ success: true })
  })
}
