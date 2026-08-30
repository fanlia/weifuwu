/**
 * 问卷批量化路由（S1——2027-09）——Campaign API（agent 工具面——S2 包装）
 */
import type { AppCtx } from '../middleware/ctx.ts'

export function registerSurveyRoutes(app: any): void {
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
