/**
 * 运营报表页（P0 从 Dashboard 拆出——工作台聚焦「项目空间」，报表归管理面）
 * 管理员/运营视角：统计卡 / 趋势 / 成本 / 活跃成员 / 激活漏斗
 */
import type { UIContext, Component } from 'weifuwu/vdom'
import { Button, Card, Chart, Icon, Skeleton, StatCard } from 'weifuwu/components'
import { Ava, PageHeader } from '../components/ui'
import type { AgentListResponse, CostAgentRow, FunnelData, StatsData } from '../lib/types'

interface ReportsState {
  loading: boolean
  stats: StatsData
  agents: Array<{ id: string; type: string; name: string }>
  costAgents: CostAgentRow[]
  funnel: FunnelData | null
  // P3-1 部门维度（三层模型计量单元）
  deptStats: Array<{ id: string; name: string; is_dm: boolean; messages: number; runs: number; runs_ok: number; tokens: number; envStatus: string | null; envLabel: string | null }>
  quotaPressure: boolean
}

export const Reports: Component = async (_props, ctx) => {
  const $ = {} as ReportsState
  const rerender = () => ctx.render()
  $.loading = true; $.stats = {}; $.agents = []; $.costAgents = []; $.funnel = null
  $.deptStats = []; $.quotaPressure = false
  Promise.all([
    ctx.api!.get<StatsData>('/api/stats').catch(() => ({})),
    ctx.api!.get<AgentListResponse>('/api/agents').catch(() => ({ agents: [] })),
    ctx.api!.get<{ agents: CostAgentRow[] }>('/api/stats/tokens-by-agent').catch(() => ({ agents: [] })),
    ctx.api!.get<FunnelData>('/api/stats/funnel').catch(() => ({ mine: { register_complete: false, agent_created: false, first_message: false }, platform: {} })),
    ctx.api!.get<{ departments: ReportsState['deptStats']; quotaPressure: boolean }>('/api/stats/departments').catch(() => ({ departments: [], quotaPressure: false })),
  ]).then(([stats, agents, cost, funnel, depts]) => {
    $.stats = stats; $.agents = agents.agents ?? []; $.costAgents = cost.agents ?? []
    $.funnel = funnel; $.deptStats = depts.departments ?? []; $.quotaPressure = depts.quotaPressure ?? false
    $.loading = false
    rerender()
  })

  return async () => {
    if ($.loading) {
      return (
        <div class="wf-stack wf-gap-lg">
          <PageHeader key="loading-header" title="运营报表" sub="AI 团队使用量 / 成本 / 活跃度" />
          <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(180px, 1fr))">
            {[1, 2, 3, 4, 5, 6].map(i => <Card key={i}><Skeleton variant="text" width="70%" /><Skeleton variant="text" width="40%" height="24px" className="wf-mt-sm" /></Card>)}
          </div>
          <Skeleton variant="table" lines={4} cols={3} />
        </div>
      )
    }
    const s = $.stats ?? {}
    const msgCount = s.messages?.total ?? 0
    const totalTokens = s.tokens?.total_tokens ?? 0
    const agentCount = s.agents?.total ?? $.agents.length
    const aiCount = s.agents?.ai_count ?? $.agents.filter((a) => a.type === 'ai').length
    const trend: { day: string; count: number; active_agents: number }[] = (s.trend ?? []).map((t) => ({
      day: String(t.day ?? '').slice(5, 10),
      count: Number(t.count ?? 0),
      active_agents: Number((t as any).active_agents ?? 0),
    }))
    const roi = (s as any).roi ?? null
    const estCostYuan = Number((s as any).estCostYuan ?? 0)
    const costTrend = ((s as any).costTrend ?? []) as Array<{ day: string; costYuan: number }>
    const costTotalYuan = costTrend.reduce((sum: number, t) => sum + (t.costYuan ?? 0), 0)
    const trendTotal = trend.reduce((sum: number, t) => sum + t.count, 0)
    const activeAgentCount = trend.reduce((sum: number, t) => sum + Number(t.active_agents ?? 0), 0)
    const peak = trend.reduce((m, t, i) => (t.count > (m?.count ?? -1) ? { i, count: t.count } : m), null as { i: number; count: number } | null)

    return (
    <div class="wf-stack wf-gap-lg">
      <PageHeader key="reports-header" title="运营报表" sub="AI 团队使用量 · 成本 · 活跃度（管理员视角）">
        <Button variant="ghost" onClick={() => ctx.app?.navigate('/')}><Icon name="arrow-left" size={14} /> 返回工作台</Button>
      </PageHeader>

      {/* P3-1：部门维度看板（三层模型计量单元）+ 配额告警黄条 */}
      {$.quotaPressure && (
        <div class="wf-bg-warning wf-p-sm wf-rounded wf-text-sm wf-text-on-warning">⚠️ 沙盒配额接近上限（≥80%）——终止不用的环境释放配额</div>
      )}
      <Card key="usage-card">
        <div class="wf-row wf-gap-sm wf-mb-sm">
          <div class="wf-fill wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary"><Icon name="users" size={14} /> 项目空间用量（按部门）</div>
          <span class="wf-text-xs wf-text-tertiary">消息 · AI 运行 · Token · 环境状态</span>
        </div>
        {$.deptStats.length === 0 ? (
          <div class="wf-text-sm wf-text-tertiary">暂无项目空间使用数据</div>
        ) : (
          <div class="wf-stack wf-gap-none">
            {$.deptStats.map((d) => (
              <div key={d.id} class="wf-row wf-gap-sm wf-py-sm wf-border-b wf-items-center">
                <Ava name={d.is_dm ? '💬' : '👥'} type={d.is_dm ? 'user' : 'knowledge_base'} small />
                <span class="wf-text-sm wf-text-medium wf-fill wf-truncate">{d.name}</span>
                {d.envLabel && <span class={`wf-text-xs wf-px-sm wf-py-xs wf-rounded ${d.envStatus === 'error' ? 'wf-bg-error wf-text-on-brand' : 'wf-bg-tertiary'}`}>{d.envLabel}</span>}
                <span class="wf-text-xs wf-text-tertiary wf-nums">{d.messages} 消息</span>
                <span class="wf-text-xs wf-text-tertiary wf-nums">{d.runs} 次运行</span>
                <span class="wf-text-sm wf-text-semibold wf-nums">{((d.tokens ?? 0) / 1000).toFixed(1)}k</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(180px, 1fr))">
        <StatCard key="agents" label="Agent 总数" value={agentCount} icon={<Icon name="cpu" />} animate onClick={() => ctx.app?.navigate('/agents')} />
        <StatCard key="ai" label="AI 机器人" value={aiCount} icon={<Icon name="zap" />} animate onClick={() => ctx.app?.navigate('/agents?type=ai')} />
        <StatCard key="msgs" label="总消息数" value={msgCount} icon={<Icon name="message" />} animate />
        <StatCard key="tokens" label="Token 消耗" value={totalTokens > 1000 ? (totalTokens / 1000).toFixed(1) + 'k' : totalTokens} icon={<Icon name="zap" />} animate />
        <StatCard key="cost" label="预估 AI 成本" value={`¥${estCostYuan.toFixed(2)}`} icon={<Icon name="database" />} animate onClick={() => ctx.app?.navigate('/settings')} />
        {roi && (
          <Card style={{ gridColumn: 'span 2' }}>
            <div class="wf-row wf-between wf-gap-md">
              <div class="wf-stack wf-gap-none">
                <span class="wf-text-xs wf-text-tertiary">本月 AI 节省估算（ROI）</span>
                <span class="wf-text-2xl wf-text-semibold" style="color: var(--wf-color-success)">¥{roi.savedYuan}</span>
                <span class="wf-text-xs wf-text-secondary">{roi.aiRepliesMonth} 条 AI 回复 × ¥{roi.costPerReply}/条（人工处理成本）− AI 成本 ¥{roi.estCostYuan}</span>
              </div>
              <Icon name="trending-up" size={28} className="wf-text-success" />
            </div>
          </Card>
        )}
      </div>

      <div class="wf-stretch wf-gap-md" style="flex-wrap: wrap">
        <Card style={{ flex: '3', minWidth: '320px' }}>
          <div class="wf-row wf-gap-sm wf-text-sm wf-text-tertiary"><Icon name="bar-chart" size={14} /> 近 14 天消息</div>
          <div class="wf-row wf-bottom wf-gap-md">
            <div class="wf-text-2xl wf-text-semibold wf-nums">{trendTotal}</div>
            <div class="wf-text-xs wf-text-tertiary">峰值 {peak?.count ?? 0} · {activeAgentCount} 活跃 · 14 天成本 ¥{costTotalYuan.toFixed(2)}</div>
          </div>
          <div style="margin-top: 6px">{trend.length > 0 && <Chart type="line" area data={trend.map((t) => ({ label: t.day, value: t.count }))} options={{ height: 130 }} title="近 14 天消息" />}</div>
        </Card>
      </div>

      <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary">活跃 Agent（近 14 天消息 · {activeAgentCount} 个活跃）</div>
      {(s.active_agents ?? []).length > 0 ? (
        <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(200px, 1fr))">
          {(s.active_agents ?? []).slice(0, 4).map((a: { id: string; name: string; type: string; message_count: number }) => (
            <Card key={a.id} clickable hover onClick={() => ctx.app?.navigate(`/agents/${a.id}`)}>
              <div class="wf-row wf-gap-sm wf-items-center">
                <Ava name={a.name} type={a.type} small />
                <div class="wf-fill wf-truncate wf-text-base wf-text-semibold">{a.name}</div>
              </div>
              <div class="wf-text-2xl wf-text-semibold wf-mt-xs wf-nums">{a.message_count}</div>
              <div class="wf-text-xs wf-text-tertiary">条消息 · 本周</div>
            </Card>
          ))}
        </div>
      ) : (
        <div class="wf-text-sm wf-text-tertiary">近 7 天暂无活跃——聊天中 @ AI 成员后这里会显示排行</div>
      )}

      <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary">Token 成本排行（按 Agent）</div>
      {$.costAgents.length > 0 ? (
        <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(200px, 1fr))">
          {$.costAgents.slice(0, 4).map((a: CostAgentRow) => (
            <Card key={a.id} clickable hover onClick={() => ctx.app?.navigate(`/agents/${a.id}`)}>
              <div class="wf-row wf-gap-sm wf-items-center">
                <Ava name={a.name} type={a.type} small />
                <div class="wf-fill wf-truncate wf-text-base wf-text-semibold">{a.name}</div>
              </div>
              <div class="wf-text-2xl wf-text-semibold wf-mt-xs wf-nums">{((a.tokens_total ?? 0) / 1000).toFixed(1)}k</div>
              <div class="wf-text-xs wf-text-tertiary">tokens · {a.run_count} 次运行</div>
            </Card>
          ))}
        </div>
      ) : (
        <div class="wf-text-sm wf-text-tertiary">暂无 token 消耗——AI 对话后这里会显示成本排行</div>
      )}

      {$.funnel && (
        <div class="wf-surface wf-p-md wf-rounded wf-border">
          <div class="wf-row wf-gap-sm wf-mb-sm">
            <div class="wf-fill wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary">激活漏斗</div>
            <span class="wf-text-xs wf-text-tertiary">注册 → 建 Agent → 首次对话</span>
          </div>
          <div class="wf-row wf-gap-md">
            {(['register_complete', 'agent_created', 'first_message'] as const).map((ev) => {
              const labels: Record<string, string> = { register_complete: '注册', agent_created: '创建 Agent', first_message: '首次对话' }
              const done = $.funnel!.mine[ev]
              const platformCount = $.funnel!.platform[ev] ?? 0
              const platformTotal = Math.max(1, $.funnel!.platform.register_complete ?? 0)
              const rate = Math.round((platformCount / platformTotal) * 100)
              return (
                <div key={ev} class="wf-fill wf-stack wf-gap-xs">
                  <div class="wf-row wf-gap-xs wf-items-center">
                    <Icon name={done ? 'check-circle' : 'target'} size={14} />
                    <span class={`wf-text-sm${done ? ' wf-text-brand wf-text-semibold' : ' wf-text-secondary'}`}>{labels[ev]}</span>
                  </div>
                  <div class="wf-text-xs wf-text-tertiary">{done ? '已完成' : '未完成'} · 全平台 {rate}%</div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
    )
  }
}
