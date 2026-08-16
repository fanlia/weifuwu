/**
 * AI 事件流路由——/api/ai/events（三端打通：vdom + ai + sandbox——
 * AI 调用事件可查——按 agentId/action/messageId 过滤——与沙盒事件流同风格）
 */
import type { Router } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'

export function registerAiEventRoutes(app: Router): void {
  app.get('/api/ai/events', async (req: Request, _ctx: AppCtx): Promise<Response> => {
    try {
      const { aiEvents } = await import('../services/ai-events.ts')
      const url = new URL(req.url)
      const n = Number(url.searchParams.get('n') ?? 100)
      const agentId = url.searchParams.get('agentId') ?? undefined
      const action = url.searchParams.get('action') ?? undefined
      const messageId = url.searchParams.get('messageId') ?? undefined
      return Response.json({ events: aiEvents(Math.min(n, 500), { agentId, action, messageId }) })
    } catch (e: any) {
      return Response.json({ error: e?.message ?? 'AI 事件流查询失败' }, { status: 500 })
    }
  })
}
