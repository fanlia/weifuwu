import type { WfuiContext } from 'weifuwu/client'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 9) return '早上好'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

export function Dashboard(_props: {}, ctx: WfuiContext) {
  const $ = ctx.ui.$
  if (!ctx.ui.ready) {
    $.loading = true; $.stats = {}; $.agents = []; $.deptCount = 0
    Promise.all([
      fetch('/api/stats', { headers: { Authorization: `Bearer ${ctx.auth?.token}` } }).then(r => r.json()).catch(() => ({})),
      fetch('/api/agents', { headers: { Authorization: `Bearer ${ctx.auth?.token}` } }).then(r => r.json()).catch(() => ({ agents: [] })),
      fetch('/api/departments', { headers: { Authorization: `Bearer ${ctx.auth?.token}` } }).then(r => r.json()).catch(() => ({ departments: [] })),
    ]).then(([stats, agents, depts]) => {
      $.stats = stats; $.agents = agents.agents ?? []; $.deptCount = depts.departments?.length ?? 0
      $.loading = false
    })
  }

  const s = $.stats ?? {}
  const msgCount = s.messages?.total ?? 0
  const totalTokens = s.tokens?.total_tokens ?? 0
  const agentCount = s.agents?.total ?? ($.agents ?? []).length
  const aiCount = s.agents?.ai_count ?? ($.agents ?? []).filter((a: any) => a.type === 'ai' || a.type === 'robot').length

  return (
    <div class="page page-narrow">
      <div class="dash-hello">
        <h1>{greeting()}，{ctx.auth?.user?.name ?? '用户'}</h1>
        <p>这是你的 AI 团队工作台，从这里管理 Agent、部门和对话。</p>
      </div>

      <div class="stat-grid">
        <div class="stat-card" onClick={() => ctx.app?.navigate('/agents')}>
          <div class="stat-ico" style="background:#ede9fe;color:#7c3aed">🤖</div>
          <div class="stat-num">{agentCount}</div>
          <div class="stat-label">Agent 总数</div>
        </div>
        <div class="stat-card" onClick={() => ctx.app?.navigate('/agents?type=ai')}>
          <div class="stat-ico" style="background:#e0f2fe;color:#0369a1">✨</div>
          <div class="stat-num">{aiCount}</div>
          <div class="stat-label">AI 机器人</div>
        </div>
        <div class="stat-card" onClick={() => ctx.app?.navigate('/departments')}>
          <div class="stat-ico" style="background:#d1fae5;color:#047857">👥</div>
          <div class="stat-num">{$.deptCount ?? 0}</div>
          <div class="stat-label">部门群组</div>
        </div>
        <div class="stat-card">
          <div class="stat-ico" style="background:#fef3c7;color:#b45309">💬</div>
          <div class="stat-num">{msgCount}</div>
          <div class="stat-label">总消息数</div>
        </div>
        <div class="stat-card">
          <div class="stat-ico" style="background:#fce7f3;color:#be185d">⚡</div>
          <div class="stat-num">{totalTokens > 1000 ? (totalTokens / 1000).toFixed(1) + 'k' : totalTokens}</div>
          <div class="stat-label">Token 消耗</div>
        </div>
        <div class="stat-card">
          <div class="stat-ico" style="background:#e0e7ff;color:#4338ca">📊</div>
          <div class="stat-num">{s.days ?? 1}天</div>
          <div class="stat-label">消息趋势</div>
        </div>
      </div>

      <div class="sect-title">快捷操作</div>
      <div class="quick-grid">
        <div class="quick-card" onClick={() => ctx.app?.navigate('/agents/new')}>
          <div class="q-ico">🤖</div>
          <div class="q-t">创建 Agent</div>
          <div class="q-d">AI 机器人、Webhook 或知识库</div>
        </div>
        <div class="quick-card" onClick={() => ctx.app?.navigate('/departments/new')}>
          <div class="q-ico">👥</div>
          <div class="q-t">创建部门</div>
          <div class="q-d">组建人机协作的群组</div>
        </div>
        <div class="quick-card" onClick={() => ctx.app?.navigate('/chat/new')}>
          <div class="q-ico">💬</div>
          <div class="q-t">发起聊天</div>
          <div class="q-d">与部门里的 AI 直接对话</div>
        </div>
      </div>
    </div>
  )
}
