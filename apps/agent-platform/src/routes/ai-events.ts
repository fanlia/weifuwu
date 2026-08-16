/**
 * AI 事件流路由——/api/ai/events（三端打通：vdom + ai + sandbox——
 * AI 调用事件可查——按 agentId/action/messageId 过滤——与沙盒事件流同风格）
 */
import type { Router } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'

export function registerAiEventRoutes(app: Router): void {
  // ── 三端统一事件查询（阶段 4）：聚合 ai + sandbox——按 requestId 一条链 ──
  app.get('/api/events', async (req: Request, _ctx: AppCtx): Promise<Response> => {
    try {
      const { aiEvents } = await import('../services/ai-events.ts')
      const { sandboxEvents } = await import('../sandbox/events.ts')
      const url = new URL(req.url)
      const n = Number(url.searchParams.get('n') ?? 200)
      const requestId = url.searchParams.get('requestId') ?? undefined
      const entity = url.searchParams.get('entity') ?? undefined
      const action = url.searchParams.get('action') ?? undefined
      // 按 requestId 过滤（精确因果——一次用户操作的三端事件链）
      const aiEvs = entity === 'sandbox' ? [] : aiEvents(n, { action })
      const sbEvs = entity === 'ai' ? [] : sandboxEvents(n, { action })
      let events = [
        ...aiEvs.map((e) => ({ ...e, _tier: 'ai' })),
        ...sbEvs.map((e) => ({ ...e, _tier: 'sandbox' })),
      ]
      if (requestId) {
        events = events.filter((e) => (e.payload as any)?.requestId === requestId)
      }
      // 时间序（三端统一 timeline）
      events.sort((a, b) => a.ts - b.ts)
      return Response.json({ events: events.slice(-Math.min(n, 500)), requestId: requestId ?? null })
    } catch (e: any) {
      return Response.json({ error: e?.message ?? '统一事件查询失败' }, { status: 500 })
    }
  })

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
