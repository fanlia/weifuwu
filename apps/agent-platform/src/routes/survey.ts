/**
 * 问卷批量化路由（S1——2027-09）——Campaign API（agent 工具面——S2 包装）
 */
import type { AppCtx } from '../middleware/ctx.ts'

export function registerSurveyRoutes(app: any): void {
  // W2 开箱：一键角色池 + 活动（替代手工 seed-survey-agents.mjs）
  app.post('/api/survey/setup', async (req: Request, ctx: AppCtx): Promise<Response> => {
    try {
      const body = await req.json()
      const personas = (body.personas ?? []).slice(0, 10)
      if (!body.url || personas.length === 0) {
        return Response.json({ error: 'url 和 personas 为必填' }, { status: 400 })
      }
      const { setupSurveyRoster } = await import('../services/survey-setup.ts')
      const out = await setupSurveyRoster(ctx, {
        url: String(body.url),
        personas,
        total: personas.length,
        concurrency: Number(body.concurrency ?? 0),
      })
      return Response.json({ success: true, ...out }, { status: 201 })
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '创建失败' }, { status: 400 })
    }
  })

  app.get('/api/survey/campaigns', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    try {
      const { orm, appId } = ctx
      const rows = await orm.query.from('survey_campaigns')
        .select('id', 'status', 'total', 'completed', 'failed', 'url', 'retry', 'concurrency', 'created_at')
        .where({ app_id: { eq: String(appId) } })
        .orderBy('created_at', 'desc')
        .limit(50)
        .run()
      return Response.json({ campaigns: rows ?? [] })
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '查询失败' }, { status: 400 })
    }
  })

  app.post('/api/survey/campaigns', async (req: Request, ctx: AppCtx): Promise<Response> => {
    try {
      const body = await req.json().catch(() => ({}))
      const { createCampaign } = await import('../services/survey-campaign.ts')
      const out = await createCampaign(ctx, body)
      return Response.json({ success: true, campaign: out.campaign, runs: out.runs.map((r) => ({ agentName: r.agent_name })) })
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '创建失败' }, { status: 400 })
    }
  })

  app.get('/api/survey/campaigns/:id', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    try {
      const { getCampaign } = await import('../services/survey-campaign.ts')
      const out = await getCampaign(ctx, String(ctx.params.id))
      if (!out) return Response.json({ error: 'campaign 不存在' }, { status: 404 })
      const { campaign, runs } = out
      return Response.json({
        campaign,
        progress: {
          completed: campaign.completed,
          failed: campaign.failed,
          total: campaign.total,
          active: runs.filter((r) => r.status === 'running').length,
          queued: runs.filter((r) => r.status === 'queued').length,
        },
        failures: runs.filter((r) => r.status === 'failed').map((r) => ({ agentName: r.agent_name, error: r.error, attempts: r.attempts })),
      })
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '查询失败' }, { status: 500 })
    }
  })

  app.post('/api/survey/campaigns/:id/retry', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    try {
      const { retryCampaign } = await import('../services/survey-campaign.ts')
      await retryCampaign(ctx, String(ctx.params.id))
      return Response.json({ success: true })
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '重跑失败' }, { status: 400 })
    }
  })

  app.post('/api/survey/campaigns/:id/cancel', async (_req: Request, ctx: AppCtx): Promise<Response> => {
    try {
      const { cancelCampaign } = await import('../services/survey-campaign.ts')
      await cancelCampaign(ctx, String(ctx.params.id))
      return Response.json({ success: true })
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '取消失败' }, { status: 400 })
    }
  })
}
