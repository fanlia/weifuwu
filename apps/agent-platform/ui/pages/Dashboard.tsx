import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { Card, StatCard } from 'weifuwu/components'

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
  const $: Record<string, any> = {}
  const rerender = () => ctx.ui.render()
  $.loading = true; $.stats = {}; $.agents = []; $.deptCount = 0
  Promise.all([
    ctx.api!.get('/api/stats').catch(() => ({})),
    ctx.api!.get('/api/agents').catch(() => ({ agents: [] })),
    ctx.api!.get('/api/departments').catch(() => ({ departments: [] })),
  ]).then(([stats, agents, depts]) => {
    $.stats = stats; $.agents = agents.agents ?? []; $.deptCount = depts.departments?.length ?? 0
    $.loading = false
    rerender()
  })

  return (props) => {
    const s = $.stats ?? {}
    const msgCount = s.messages?.total ?? 0
    const totalTokens = s.tokens?.total_tokens ?? 0
    const agentCount = s.agents?.total ?? ($.agents ?? []).length
    const aiCount = s.agents?.ai_count ?? ($.agents ?? []).filter((a: any) => a.type === 'ai' || a.type === 'robot').length

    return (
    <div class="wf-stack wf-gap-lg">
      <div class="wf-stack wf-gap-xs">
        <h1 class="wf-text-2xl">{greeting()}，{ctx.auth?.user?.name ?? '用户'}</h1>
        <p class="wf-text-base wf-text-secondary wf-m-0">这是你的 AI 团队工作台，从这里管理 Agent、部门和对话。</p>
      </div>

      <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(180px, 1fr))">
        <StatCard label="Agent 总数" value={agentCount} icon="🤖" animate onClick={() => ctx.app?.navigate('/agents')} />
        <StatCard label="AI 机器人" value={aiCount} icon="✨" animate onClick={() => ctx.app?.navigate('/agents?type=ai')} />
        <StatCard label="部门群组" value={$.deptCount ?? 0} icon="👥" animate onClick={() => ctx.app?.navigate('/departments')} />
        <StatCard label="总消息数" value={msgCount} icon="💬" animate />
        <StatCard label="Token 消耗" value={totalTokens > 1000 ? (totalTokens / 1000).toFixed(1) + 'k' : totalTokens} icon="⚡" animate />
        <StatCard label="消息趋势" value={`${s.days ?? 1}天`} icon="📊" />
      </div>

      <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary">快捷操作</div>
      <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(220px, 1fr))">
        <Card clickable hover onClick={() => ctx.app?.navigate('/agents/new')}>
          <div class="wf-text-2xl wf-mb-xs">🤖</div>
          <div class="wf-text-base wf-text-semibold">创建 Agent</div>
          <div class="wf-text-sm wf-text-secondary">AI 机器人、Webhook 或知识库</div>
        </Card>
        <Card clickable hover onClick={() => ctx.app?.navigate('/departments/new')}>
          <div class="wf-text-2xl wf-mb-xs">👥</div>
          <div class="wf-text-base wf-text-semibold">创建部门</div>
          <div class="wf-text-sm wf-text-secondary">组建人机协作的群组</div>
        </Card>
        <Card clickable hover onClick={() => ctx.app?.navigate('/chat/new')}>
          <div class="wf-text-2xl wf-mb-xs">💬</div>
          <div class="wf-text-base wf-text-semibold">发起聊天</div>
          <div class="wf-text-sm wf-text-secondary">与部门里的 AI 直接对话</div>
        </Card>
      </div>
    </div>
    )
  }
}
