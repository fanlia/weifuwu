import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { Button, Card, Chart, Icon, Skeleton, StatCard } from 'weifuwu/components'
import { Ava } from '../components/ui'
import type { Agent, AgentListResponse, CostAgentRow, DepartmentListResponse, FunnelData, PendingApproval, StatsData } from '../lib/types'

interface DashboardState {
  loading: boolean
  stats: StatsData
  agents: Agent[]
  deptCount: number
  pendingCount: number
  costAgents: CostAgentRow[]
  funnel: FunnelData | null
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 9) return '早上好'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

export const Dashboard: Component = async (_props, ctx) => {
  const $ = {} as DashboardState
  const rerender = () => ctx.ui.render()
  $.loading = true; $.stats = {}; $.agents = []; $.deptCount = 0; $.pendingCount = 0; $.costAgents = []; $.funnel = null
  Promise.all([
    ctx.api!.get<StatsData>('/api/stats').catch(() => ({})),
    ctx.api!.get<AgentListResponse>('/api/agents').catch(() => ({ agents: [] })),
    ctx.api!.get<DepartmentListResponse>('/api/departments').catch(() => ({ departments: [] })),
    ctx.api!.get<{ pending: PendingApproval[] }>('/api/messages/pending-approvals').catch(() => ({ pending: [] })),
    ctx.api!.get<{ agents: CostAgentRow[] }>('/api/stats/tokens-by-agent').catch(() => ({ agents: [] })),
    ctx.api!.get<FunnelData>('/api/stats/funnel').catch(() => ({ mine: { register_complete: false, agent_created: false, first_message: false }, platform: {} })),
  ]).then(([stats, agents, depts, pend, cost, funnel]) => {
    $.stats = stats; $.agents = agents.agents ?? []; $.deptCount = depts.departments?.length ?? 0
    $.pendingCount = pend.pending?.length ?? 0
    $.costAgents = cost.agents ?? []
    $.funnel = funnel
    $.loading = false
    rerender()
  })

  return async (props) => {
    // 骨架屏（加载中——Wave 8 视觉优化）：统计卡片网格 + 列表骨架
    if ($.loading) {
      return (
        <div class="wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto" style="--wf-max: 960px">
          <div class="wf-stack wf-gap-xs">
            <Skeleton variant="text" width="200px" height="28px" />
            <Skeleton variant="text" width="340px" />
          </div>
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
    // 近 7 天消息趋势：真实数据 + CSS 柱条（框架无 Chart——诚实裁剪）
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
    const maxTrend = Math.max(1, ...trend.map((t) => t.count))
    const peak = trend.reduce((m, t, i) => (t.count > (m?.count ?? -1) ? { i, count: t.count } : m), null as { i: number; count: number } | null)

    return (
    <div class="wf-stack wf-gap-lg">
      <div class="wf-stack wf-gap-xs">
        <div class="wf-row wf-between wf-gap-md wf-items-center">
          <div class="wf-stack wf-gap-xs">
            <h1 class="wf-text-2xl wf-m-0">{greeting()}，{ctx.auth?.user?.name ?? '用户'}</h1>
            <p class="wf-text-base wf-text-secondary wf-m-0">这是你的 AI 团队工作台，从这里管理 Agent、部门和对话。</p>
          </div>
          <a class="wf-btn wf-btn--primary wf-btn--sm" href="/api/stats/report" target="_blank" title="ROI/使用量/质量 → HTML 报告（可打印为 PDF）">
            <Icon name="file-text" size={13} /> 导出价值报告
          </a>
        </div>
      </div>

      {aiCount === 0 && (
        <div class="wf-surface wf-row wf-gap-md wf-p-md wf-rounded wf-border">
          <div class="wf-text-3xl">🤖</div>
          <div class="wf-fill wf-stack wf-gap-xs">
            <div class="wf-text-base wf-text-semibold">创建你的第一个 AI 同事</div>
            <div class="wf-text-sm wf-text-secondary">3 步搞定：选角色模板 → 起个名字 → 创建后加入部门聊天</div>
          </div>
          <Button variant="primary" onClick={() => ctx.app?.navigate('/agents/new')}>开始创建</Button>
        </div>
      )}

      <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(180px, 1fr))">
        <StatCard label="Agent 总数" value={agentCount} icon={<Icon name="cpu" />} animate onClick={() => ctx.app?.navigate('/agents')} />
        <StatCard label="AI 机器人" value={aiCount} icon={<Icon name="zap" />} animate onClick={() => ctx.app?.navigate('/agents?type=ai')} />
        <StatCard label="部门群组" value={$.deptCount} icon={<Icon name="users" />} animate onClick={() => ctx.app?.navigate('/departments')} />
        <StatCard label="总消息数" value={msgCount} icon={<Icon name="message" />} animate />
        <StatCard label="Token 消耗" value={totalTokens > 1000 ? (totalTokens / 1000).toFixed(1) + 'k' : totalTokens} icon={<Icon name="zap" />} animate />
        <StatCard label="预估 AI 成本" value={`¥${estCostYuan.toFixed(2)}`} icon={<Icon name="database" />} animate onClick={() => ctx.app?.navigate('/settings')} />
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
        <Card clickable hover onClick={() => ctx.app?.navigate('/approvals')} style={{ minWidth: '200px', maxWidth: '280px', flex: '1' }}>
          <div class="wf-row wf-gap-sm wf-text-sm wf-text-tertiary"><Icon name="clock" size={14} /> 审批待办</div>
          <div class="wf-text-2xl wf-text-semibold wf-mt-xs wf-nums">{$.pendingCount}</div>
          <div class="wf-text-xs wf-text-secondary wf-mt-xs">{$.pendingCount > 0 ? 'AI 草稿待批准发布' : '没有待审批草稿'}</div>
        </Card>
        <Card clickable hover onClick={() => ctx.app?.navigate('/agents')} style={{ flex: '3', minWidth: '320px' }}>
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
            {(['register_complete', 'agent_created', 'first_message'] as const).map((ev, i) => {
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

      <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary">快捷操作</div>
      <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(220px, 1fr))">
        <Card clickable hover onClick={() => ctx.app?.navigate('/agents/new')}>
          <div class="wf-text-2xl wf-mb-xs"><Icon name="cpu" size={28} /></div>
          <div class="wf-text-base wf-text-semibold">创建 Agent</div>
          <div class="wf-text-sm wf-text-secondary">AI 机器人、Webhook 或知识库</div>
        </Card>
        <Card clickable hover onClick={() => ctx.app?.navigate('/departments/new')}>
          <div class="wf-text-2xl wf-mb-xs"><Icon name="users" size={28} /></div>
          <div class="wf-text-base wf-text-semibold">创建部门</div>
          <div class="wf-text-sm wf-text-secondary">组建人机协作的群组</div>
        </Card>
        <Card clickable hover onClick={() => ctx.app?.navigate('/chat/new')}>
          <div class="wf-text-2xl wf-mb-xs"><Icon name="message" size={28} /></div>
          <div class="wf-text-base wf-text-semibold">发起聊天</div>
          <div class="wf-text-sm wf-text-secondary">与部门里的 AI 直接对话</div>
        </Card>
      </div>
    </div>
    )
  }
}
