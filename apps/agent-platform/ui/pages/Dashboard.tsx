import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { Button, Card, Icon, StatCard } from 'weifuwu/components'
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
    const s = $.stats ?? {}
    const msgCount = s.messages?.total ?? 0
    const totalTokens = s.tokens?.total_tokens ?? 0
    const agentCount = s.agents?.total ?? $.agents.length
    const aiCount = s.agents?.ai_count ?? $.agents.filter((a) => a.type === 'ai').length
    // 近 7 天消息趋势：真实数据 + CSS 柱条（框架无 Chart——诚实裁剪）
    const trend: { day: string; count: number }[] = (s.trend ?? []).map((t) => ({
      day: String(t.day ?? '').slice(5, 10),
      count: Number(t.count ?? 0),
    }))
    const trendTotal = trend.reduce((sum: number, t) => sum + t.count, 0)
    const maxTrend = Math.max(1, ...trend.map((t) => t.count))
    const trendBars = trend.map((t, i) => (
      <div key={i} class="wf-fill wf-stack wf-gap-none wf-items-center" title={`${t.day}：${t.count} 条`}>
        <div style={`width: 100%; max-width: 14px; height: ${Math.max(2, Math.round((t.count / maxTrend) * 24))}px; background: var(--wf-color-primary); border-radius: 2px 2px 0 0; opacity: ${t.count === 0 ? 0.25 : 1}`} />
        <span class="wf-text-[10px] wf-text-tertiary" style="font-size: 9px">{t.day.slice(5) ?? ''}</span>
      </div>
    ))

    return (
    <div class="wf-stack wf-gap-lg">
      <div class="wf-stack wf-gap-xs">
        <h1 class="wf-text-2xl">{greeting()}，{ctx.auth?.user?.name ?? '用户'}</h1>
        <p class="wf-text-base wf-text-secondary wf-m-0">这是你的 AI 团队工作台，从这里管理 Agent、部门和对话。</p>
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
        <Card clickable hover onClick={() => ctx.app?.navigate('/approvals')}>
          <div class="wf-row wf-gap-sm wf-text-sm wf-text-tertiary"><Icon name="clock" size={14} /> 审批待办</div>
          <div class="wf-text-2xl wf-text-semibold wf-mt-xs">{$.pendingCount}</div>
          <div class="wf-text-xs wf-text-secondary wf-mt-xs">{$.pendingCount > 0 ? 'AI 草稿待批准发布' : '没有待审批草稿'}</div>
        </Card>
        <Card clickable hover onClick={() => ctx.app?.navigate('/agents')}>
          <div class="wf-row wf-gap-sm wf-text-sm wf-text-tertiary"><Icon name="bar-chart" size={14} /> 近 7 天消息</div>
          <div class="wf-text-2xl wf-text-semibold wf-mt-xs">{trendTotal}</div>
          <div class="wf-row wf-gap-xs wf-items-end" style="height: 32px; margin-top: 6px">{trendBars}</div>
        </Card>
      </div>

      <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary">Token 成本排行（按 Agent）</div>
      {$.costAgents.length > 0 ? (
        <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(200px, 1fr))">
          {$.costAgents.slice(0, 4).map((a: CostAgentRow) => (
            <Card key={a.id} clickable hover onClick={() => ctx.app?.navigate(`/agents/${a.id}`)}>
              <div class="wf-row wf-gap-sm wf-items-center">
                <Ava name={a.name} type={a.type} small />
                <div class="wf-fill wf-truncate wf-text-base wf-text-semibold">{a.name}</div>
              </div>
              <div class="wf-text-2xl wf-text-semibold wf-mt-xs">{((a.tokens_total ?? 0) / 1000).toFixed(1)}k</div>
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
