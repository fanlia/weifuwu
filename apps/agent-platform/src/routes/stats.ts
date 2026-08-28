/**
 * 统计/报表/埋点路由（G3——server.ts 单体瘦身第三波——纯迁移零行为变化）
 *
 * 迁出 server.ts 内联块（2026-08）：/api/stats（+buildStats 聚合）/
 * /api/stats/report（价值报告 HTML）/ tokens-by-agent / departments /
 * track 埋点 / funnel / agent 执行日志 / webhook 日志。
 * 全部经 ctx.sql 参数化 + app_id 隔离（隔离审计登记在 tenant-isolation.test.ts）。
 */
import type { Router } from 'weifuwu'
import type { AppCtx } from '../middleware/ctx.ts'

export function registerStatsRoutes(app: Router<AppCtx>): void {
  // ── 完整统计数据 ───────────────────────────────────────
  app.get('/api/stats', async (req: Request, ctx: AppCtx): Promise<Response> => {
    return Response.json(await buildStats(ctx))
  })

  /** 应用统计聚合（/api/stats 与价值报告共用） */
  async function buildStats(ctx: AppCtx): Promise<Record<string, unknown>> {
    const { sql, appId } = ctx

    const [agentStats] = await sql`
      SELECT
        COUNT(*)::int as total,
        COUNT(*) FILTER (WHERE type = 'ai')::int as ai_count,
        COUNT(*) FILTER (WHERE type = 'webhook')::int as webhook_count,
        COUNT(*) FILTER (WHERE type = 'knowledge_base')::int as kb_count,
        COUNT(*) FILTER (WHERE type = 'user')::int as user_count
      FROM agents WHERE app_id = ${appId}
    `

    const [deptStats] = await sql`
      SELECT COUNT(*)::int as total FROM departments d
      WHERE d.app_id = ${appId}
    `

    const [msgStats] = await sql`
      SELECT COUNT(*)::int as total FROM messages m
      JOIN agents a ON a.id = m.sender_id
      WHERE a.app_id = ${appId}
    `

    const [tokenStats] = await sql`
      SELECT
        COALESCE(SUM(tokens_prompt), 0)::int as total_prompt,
        COALESCE(SUM(tokens_completion), 0)::int as total_completion,
        COALESCE(SUM(tokens_total), 0)::int as total_tokens
      FROM agent_logs WHERE app_id = ${appId}
    `

    // 近 14 天成本趋势（agent_logs 按天聚合——老板看运营成本走势）
    const costTrend = await sql`
      SELECT DATE(created_at) as day,
        COALESCE(SUM(tokens_prompt), 0)::int as prompt,
        COALESCE(SUM(tokens_completion), 0)::int as completion,
        COALESCE(SUM(tokens_total), 0)::int as total
      FROM agent_logs
      WHERE app_id = ${appId} AND created_at >= NOW() - INTERVAL '14 days'
      GROUP BY DATE(created_at) ORDER BY day
    `

    // 近 14 天消息趋势 + 活跃 Agent 数（留存维度——运营看活跃）
    const trend = await sql`
      SELECT
        DATE(m.created_at) as day,
        COUNT(*)::int as count,
        COUNT(DISTINCT m.sender_id)::int as active_agents
      FROM messages m
      JOIN agents a ON a.id = m.sender_id
      WHERE a.app_id = ${appId}
        AND m.created_at >= NOW() - INTERVAL '14 days'
      GROUP BY DATE(m.created_at)
      ORDER BY day
    `

    // 活跃 Agent 排行（近 7 天发消息数——统计面板「活跃度」）
    const activeAgents = await sql`
      SELECT a.id, a.name, a.type,
        COUNT(m.id)::int as message_count,
        MAX(m.created_at) as last_active_at
      FROM agents a
      JOIN messages m ON m.sender_id = a.id
      WHERE a.app_id = ${appId}
        AND m.created_at >= NOW() - INTERVAL '7 days'
      GROUP BY a.id, a.name, a.type
      ORDER BY message_count DESC
      LIMIT 8
    `

    // 预估成本（DeepSeek 参考价：输入 ¥2/百万 tokens · 输出 ¥8/百万——估算，非计费）
    const ts = tokenStats as any
    const PRICE_IN = 2 / 1_000_000
    const PRICE_OUT = 8 / 1_000_000
    const estCostYuan = Number(((ts?.total_prompt ?? 0) * PRICE_IN + (ts?.total_completion ?? 0) * PRICE_OUT).toFixed(2))
    const costTrendYuan = (costTrend as Array<Record<string, any>>).map((d) => ({
      day: String(d.day).slice(5, 10),
      total: Number(d.total ?? 0),
      costYuan: Number(((Number(d.prompt ?? 0) * PRICE_IN + Number(d.completion ?? 0) * PRICE_OUT)).toFixed(2)),
    }))

    // ── 商业化 G10 ROI 估算：AI 回复数 × 单条人工成本 − AI 成本 = 节省 ──
    // 假设：人工处理一条消息/任务平均 3 分钟 × 时薪 40 元 ≈ ¥2/条（可配置常量）
    const COST_PER_AI_REPLY = 2
    // R6-3 质量指标：工具执行成功率（agent_logs success）+ AI 消息反馈汇总（分查——防 JOIN 膨胀）
    const [quality] = await sql`
      SELECT COUNT(*)::int AS runs, COUNT(*) FILTER (WHERE success)::int AS ok_runs
      FROM agent_logs WHERE app_id = ${appId}
    `
    const [feedback] = await sql`
      SELECT
        COALESCE(COUNT(*) FILTER (WHERE feedback = 'like'), 0)::int AS likes,
        COALESCE(COUNT(*) FILTER (WHERE feedback = 'dislike'), 0)::int AS dislikes
      FROM messages m JOIN agents a ON a.id = m.sender_id
      WHERE a.app_id = ${appId} AND m.feedback IS NOT NULL
    `
    const toolSuccessRate = Number((quality as any)?.runs ?? 0) > 0
      ? Math.round(Number((quality as any)?.ok_runs ?? 0) / Number((quality as any)?.runs ?? 0) * 100)
      : null

    const [aiMsgRow] = await sql`
      SELECT COUNT(*)::int AS cnt FROM messages m
      JOIN agents a ON a.id = m.sender_id
      WHERE a.app_id = ${appId} AND a.type = 'ai' AND m.ai_approved IS NOT NULL
        AND m.created_at >= DATE_TRUNC('month', NOW())
    `
    const aiRepliesMonth = Number((aiMsgRow as any)?.cnt ?? 0)
    const savedYuan = Math.max(0, aiRepliesMonth * COST_PER_AI_REPLY - estCostYuan).toFixed(2)

    return {
      agents: agentStats,
      departments: deptStats,
      messages: msgStats,
      tokens: tokenStats,
      estCostYuan,
      costTrend: costTrendYuan,
      trend,
      active_agents: activeAgents,
      roi: { aiRepliesMonth, costPerReply: COST_PER_AI_REPLY, estCostYuan, savedYuan: Number(savedYuan) },
      quality: { toolSuccessRate, likes: Number((feedback as any)?.likes ?? 0), dislikes: Number((feedback as any)?.dislikes ?? 0) },
    }
  }

  // ── 试用期价值报告（销售转化物料：ROI/使用量/质量 → HTML 可打印 PDF） ──
  app.get('/api/stats/report', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const s = await buildStats(ctx) as any
    const [app] = await ctx.sql`SELECT name, plan, trial_ends_at FROM _weifuwu_apps WHERE id = ${ctx.appId}`
    const [used] = await ctx.sql`
      SELECT COALESCE(SUM(tokens_total), 0)::int AS used FROM agent_logs WHERE app_id = ${ctx.appId} AND created_at >= DATE_TRUNC('month', NOW())
    `
    const appName = String(app?.name ?? '本应用')
    const planLabel = String(app?.plan ?? 'free') === 'pro' ? '专业版' : '免费试用'
    const roi = s.roi ?? { aiRepliesMonth: 0, costPerReply: 2, estCostYuan: 0, savedYuan: 0 }
    const quality = s.quality ?? { toolSuccessRate: null, likes: 0, dislikes: 0 }
    const msgTotal = s.messages?.total ?? 0
    const aiCount = s.agents?.ai_count ?? 0
    const tokens = s.tokens ?? { total_tokens: 0 }
    const costTrend = (s.costTrend ?? []) as Array<{ day: string; costYuan: number }>
    const active = (s.active_agents ?? []) as Array<{ name: string; type: string; message_count: number }>
    const quota = Number((used as any)?.used ?? 0)
    const trendLine = costTrend.map((d) => `${d.day}:¥${d.costYuan}`).join(' → ')

    const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>AI 价值报告 — ${appName}</title>
<style>
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; max-width: 720px; margin: 40px auto; padding: 0 24px; color: #1f2937; }
  h1 { font-size: 24px; margin-bottom: 4px; } .sub { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
  .hero { background: #f3f4f6; border-radius: 12px; padding: 20px 24px; margin-bottom: 24px; }
  .hero .big { font-size: 36px; font-weight: 700; color: #059669; }
  .hero .cap { color: #6b7280; font-size: 13px; margin-top: 4px; }
  h2 { font-size: 16px; border-left: 3px solid #2563eb; padding-left: 10px; margin: 28px 0 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  td, th { padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: left; }
  th { color: #6b7280; font-weight: 500; }
  .muted { color: #6b7280; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px; }
  @media print { body { margin: 0; } }
</style></head><body>
  <h1>AI 价值报告</h1>
  <div class="sub">${appName} · ${planLabel} · 生成于 ${new Date().toLocaleString('zh-CN')} · 统计范围：全部历史 + 近 14 天趋势</div>

  <div class="hero">
    <div class="big">¥${roi.savedYuan}</div>
    <div class="cap">本月预计节省（${roi.aiRepliesMonth} 条 AI 处理 × ¥${roi.costPerReply}/条人工成本 − AI 成本 ¥${roi.estCostYuan}）</div>
  </div>

  <h2>使用概况</h2>
  <table>
    <tr><td>总消息数</td><td>${msgTotal} 条</td><td>AI 成员</td><td>${aiCount} 个</td></tr>
    <tr><td>本月 token 消耗</td><td>${quota.toLocaleString()}</td><td>工具执行成功率</td><td>${quality.toolSuccessRate === null ? '—' : quality.toolSuccessRate + '%'}</td></tr>
    <tr><td>质量反馈</td><td>👍 ${quality.likes} · 👎 ${quality.dislikes}</td><td>AI 回复数（本月）</td><td>${roi.aiRepliesMonth} 条</td></tr>
  </table>

  <h2>近 14 天成本趋势</h2>
  <p class="muted">${trendLine || '暂无数据'}</p>

  <h2>活跃成员排行（近 7 天）</h2>
  <table>
    <tr><th>成员</th><th>类型</th><th>消息数</th></tr>
    ${active.map((a: any) => `<tr><td>${a.name}</td><td>${a.type === 'ai' ? 'AI' : a.type}</td><td>${a.message_count}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">暂无活跃数据</td></tr>'}
  </table>

  <h2>价值总结</h2>
  <p>${msgTotal > 0
    ? `过去 ${msgTotal > 100 ? '30' : '14'} 天里，${aiCount} 个 AI 成员处理了 ${msgTotal} 条消息，工具执行成功率 ${quality.toolSuccessRate === null ? '—' : quality.toolSuccessRate + '%'}，为您节省约 ¥${roi.savedYuan}。AI 正在成为您团队里干活最勤快的同事。`
    : '开始使用：在群里 @AI 成员下达第一个任务，两周后这里会有一份属于您的价值报告。'}</p>

  <div class="footer">agent-platform · AI 价值报告 · 数据来自您自己的私有化部署</div>
</body></html>`

    return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  })

  // ── Token 成本排行（按 Agent，老板视角成本视图） ─────────────
  app.get('/api/stats/tokens-by-agent', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId } = ctx
    const rows = await sql`
      SELECT a.id, a.name, a.type,
        COUNT(al.id)::int as run_count,
        COALESCE(SUM(al.tokens_total), 0)::int as tokens_total,
        COALESCE(SUM(al.tokens_prompt), 0)::int as tokens_prompt,
        COALESCE(SUM(al.tokens_completion), 0)::int as tokens_completion
      FROM agents a
      LEFT JOIN agent_logs al ON al.agent_id = a.id AND al.app_id = ${appId}
      WHERE a.app_id = ${appId}
      GROUP BY a.id
      HAVING COUNT(al.id) > 0
      ORDER BY tokens_total DESC
      LIMIT 10
    `
    return Response.json({ agents: rows })
  })

  // ── P3-1 运营看板：部门维度活跃/成本/配额（三层模型计量单元 = 部门） ──
  app.get('/api/stats/departments', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId } = ctx
    const rows = await sql`
      SELECT d.id, d.name, d.is_dm,
        COUNT(m.id)::int as messages,
        COUNT(al.id)::int as runs,
        COUNT(al.id) FILTER (WHERE al.success)::int as runs_ok,
        COALESCE(SUM(al.tokens_total), 0)::int as tokens,
        MAX(m.created_at) as last_active
      FROM departments d
      LEFT JOIN messages m ON m.department_id = d.id AND m.ai_approved != FALSE
      LEFT JOIN agent_logs al ON al.department_id = d.id AND al.app_id = ${appId}
      WHERE d.app_id = ${appId}
      GROUP BY d.id
      ORDER BY tokens DESC, messages DESC
    `
    // 配额用量 + 环境状态（per 部门）
    const { manager } = await import('../sandbox/manager.ts')
    manager.init(sql)
    const deptRows = (rows ?? []) as Array<Record<string, any>>
    let quotaPressure = false
    const withEnv: Array<Record<string, any>> = []
    for (const d of deptRows) {
      const sb = await manager.byDepartment(String(d.id))
      withEnv.push({
        ...d,
        envStatus: sb?.status ?? null,
        envLabel: sb ? (sb.status === 'running' ? '运行中' : sb.status === 'stopped' ? '已停止' : sb.status === 'error' ? '错误' : '待启动') : null,
      })
    }
    // P3-2 告警：配额压力（active sandbox / quota ≥ 80%）
    try {
      const [q] = await sql`SELECT sandbox_quota FROM _weifuwu_apps WHERE id = ${appId}`
      const limit = Number(q?.sandbox_quota ?? 5)
      const [c] = await sql`SELECT COUNT(*)::int as n FROM sandboxes WHERE app_id = ${appId} AND status != 'terminated'`
      quotaPressure = limit > 0 && Number(c?.n ?? 0) / limit >= 0.8
      if (quotaPressure) {
        console.warn(`[agent-platform] 沙盒配额压力：${c?.n}/${limit}（≥80%）——app ${appId}`)
      }
    } catch { /* 告警尽力 */ }
    return Response.json({ departments: withEnv, quotaPressure })
  })

  // ── 激活漏斗埋点 ──────────────────────────────────────────
  // 埋点：POST /api/track { event: 'register_complete'|'agent_created'|'first_message' }
  // first_message 每租户唯一（部分唯一索引）——首次消息只记一次
  const TRACKABLE = new Set(['register_complete', 'agent_created', 'first_message'])
  app.post('/api/track', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId } = ctx
    const body = await req.json().catch(() => ({})) as { event?: string }
    if (!body.event || !TRACKABLE.has(body.event)) {
      return Response.json({ error: 'event 必须是 register_complete/agent_created/first_message 之一' }, { status: 400 })
    }
    try {
      await sql`INSERT INTO events (app_id, event) VALUES (${appId}, ${body.event})`
    } catch {
      // 部分唯一索引冲突（first_message 已记）——幂等，忽略
    }
    return Response.json({ ok: true })
  })

  // 漏斗：本租户进度 + 全平台转化（去重租户）
  app.get('/api/stats/funnel', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId } = ctx
    const rows = await sql`
      SELECT
        COUNT(*) FILTER (WHERE event = 'register_complete')::int as register_complete,
        COUNT(*) FILTER (WHERE event = 'agent_created')::int as agent_created,
        COUNT(*) FILTER (WHERE event = 'first_message')::int as first_message
      FROM events WHERE app_id = ${appId}
    `
    const mine = rows[0] as { register_complete: number; agent_created: number; first_message: number } | undefined
    const platform = await sql`
      SELECT event, COUNT(*)::int as count
      FROM (
        SELECT DISTINCT app_id, event FROM events
      ) t GROUP BY event
    `
    return Response.json({
      mine: { register_complete: (mine?.register_complete ?? 0) > 0, agent_created: (mine?.agent_created ?? 0) > 0, first_message: (mine?.first_message ?? 0) > 0 },
      platform: Object.fromEntries(platform.map((p: any) => [p.event, p.count])),
    })
  })

  // ── Agent 执行日志 ───────────────────────────────────────
  app.get('/api/stats/agents/:agentId/logs', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const logs = await sql`
      SELECT id, messages_count, steps_count,
        tokens_prompt, tokens_completion, tokens_total,
        elapsed_ms, success, created_at
      FROM agent_logs
      WHERE agent_id = ${params.agentId} AND app_id = ${appId}
      ORDER BY created_at DESC
      LIMIT 50
    `
    return Response.json({ logs })
  })

  // ── Webhook 调用日志 ─────────────────────────────────────
  app.get('/api/stats/agents/:agentId/webhook-logs', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId, params } = ctx
    const logs = await sql`
      SELECT id, request_body, response_body, response_status,
        elapsed_ms, success, created_at
      FROM webhook_logs
      WHERE agent_id = ${params.agentId} AND app_id = ${appId}
      ORDER BY created_at DESC
      LIMIT 30
    `
    return Response.json({ logs })
  })

  // ── O12 编排任务链（Wave 3）：租户内 agent_runs 列表——审计/ROI 面 ──
  app.get('/api/stats/runs', async (req: Request, ctx: AppCtx): Promise<Response> => {
    const { sql, appId } = ctx
    const url = new URL(req.url ?? '', 'http://localhost')
    const limit = Math.min(50, Math.max(1, Number(url.searchParams.get('limit') ?? 20)))
    const rows = await sql`
      SELECT r.id, r.kind, r.status, r.plan_json, r.worker_results, r.request_id,
        r.created_at, r.updated_at,
        a.name AS orchestrator_name
      FROM agent_runs r
      LEFT JOIN agents a ON a.id = r.orchestrator_id
      WHERE r.app_id = ${appId}
      ORDER BY r.created_at DESC
      LIMIT ${limit}
    `
    return Response.json({ runs: rows ?? [] })
  })
}
