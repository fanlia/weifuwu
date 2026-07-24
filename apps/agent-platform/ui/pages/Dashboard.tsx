/**
 * Dashboard — 概览页：问候 + 实时统计 + 快捷操作
 */

import { computed, createResource } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'

function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

export function Dashboard(_props: {}, ctx: WfuiContext) {
  const token = ctx.auth?.token?.value ?? ctx.auth?.token
  const headers = { Authorization: `Bearer ${token}` }

  // 使用统一统计端点
  const [stats] = createResource<any>(
    () => fetch('/api/stats', { headers }).then(r => r.json()),
    { initialValue: {} },
  )

  const user = ctx.auth?.user
  const userName = computed(() => (user?.value ?? user)?.name ?? '用户')

  const agentStats = computed(() => stats.value?.agents ?? { total: 0, ai_count: 0, webhook_count: 0, kb_count: 0, user_count: 0 })
  const deptTotal = computed(() => stats.value?.departments?.total ?? 0)
  const msgTotal = computed(() => stats.value?.messages?.total ?? 0)
  const tokenTotal = computed(() => stats.value?.tokens?.total_tokens ?? 0)
  const trend = computed(() => stats.value?.trend ?? [])

  function go(to: string) {
    ctx.app.navigate(to)
  }

  return (
    <div class="page">
      <div class="dash-hello">
        <h1>{computed(() => `${greeting()}，${userName.value}`)}</h1>
        <p>这是你的 AI 团队工作台，从这里管理 Agent、部门和对话。</p>
      </div>

      <div class="stat-grid">
        <div class="stat-card" onClick={() => go('/agents')}>
          <div class="stat-ico" style={{ background: '#ede9fe' }}>🤖</div>
          <div class="stat-num">{computed(() => agentStats.value.total)}</div>
          <div class="stat-label">Agent 总数</div>
        </div>
        <div class="stat-card" onClick={() => go('/agents')}>
          <div class="stat-ico" style={{ background: '#e0f2fe' }}>✨</div>
          <div class="stat-num">{computed(() => agentStats.value.ai_count)}</div>
          <div class="stat-label">AI 机器人</div>
        </div>
        <div class="stat-card" onClick={() => go('/departments')}>
          <div class="stat-ico" style={{ background: '#d1fae5' }}>👥</div>
          <div class="stat-num">{deptTotal}</div>
          <div class="stat-label">部门群组</div>
        </div>
        <div class="stat-card">
          <div class="stat-ico" style={{ background: '#fef3c7' }}>💬</div>
          <div class="stat-num">{msgTotal}</div>
          <div class="stat-label">总消息数</div>
        </div>
        <div class="stat-card">
          <div class="stat-ico" style={{ background: '#ecfdf5' }}>⚡</div>
          <div class="stat-num">{computed(() => (tokenTotal.value / 1000).toFixed(1))}k</div>
          <div class="stat-label">Token 消耗</div>
        </div>
        <div class="stat-card" onClick={() => go('/departments')}>
          <div class="stat-ico" style={{ background: '#e0f2fe' }}>📊</div>
          <div class="stat-num">{computed(() => trend.value.length)}天</div>
          <div class="stat-label">消息趋势</div>
        </div>
      </div>

      <div class="sect-title">快捷操作</div>
      <div class="quick-grid">
        <div class="quick-card" onClick={() => go('/agents/new')}>
          <div class="q-ico">🤖</div>
          <div class="q-t">创建 Agent</div>
          <div class="q-d">AI 机器人、Webhook 或知识库</div>
        </div>
        <div class="quick-card" onClick={() => go('/departments/new')}>
          <div class="q-ico">👥</div>
          <div class="q-t">创建部门</div>
          <div class="q-d">组建人机协作的群组</div>
        </div>
        <div class="quick-card" onClick={() => go('/chat/new')}>
          <div class="q-ico">💬</div>
          <div class="q-t">发起聊天</div>
          <div class="q-d">与部门里的 AI 直接对话</div>
        </div>
      </div>
    </div>
  )
}
