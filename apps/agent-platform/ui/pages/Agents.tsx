import type { WfuiContext, Component } from 'weifuwu/client'
import { PageHeader, TypeBadge, Ava, EmptyState, Loading, StatusDot } from '../components/ui'

export const Agents: Component = (_props, ctx) => {
  const $ = ctx.ui.$()
  const token = ctx.auth?.token

    $.agents = []; $.loading = true
    fetch('/api/agents', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { $.agents = d.agents ?? []; $.loading = false })
      .catch(() => { $.loading = false })

  async function remove(e: Event, id: string) {
    e.stopPropagation()
    if (!confirm('确定删除这个 Agent 吗？')) return
    const res = await fetch(`/api/agents/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } })
    if (res.ok || res.status === 204) {
      $.agents = $.agents.filter((a: any) => a.id !== id)
     
    }

  return (props) => (
    <div class="page">
      <PageHeader title="Agent" sub="创建和管理 AI 机器人、Webhook 与知识库">
        <button class="btn btn-primary" onClick={() => ctx.app?.navigate('/agents/new')}>＋ 创建 Agent</button>
      </PageHeader>

      {$.loading && <Loading />}

      {!$.loading && $.agents.length === 0 && (
        <EmptyState icon="🤖" text="还没有 Agent" hint="创建你的第一个 AI 机器人、Webhook 或知识库">
          <button class="btn btn-primary" onClick={() => ctx.app?.navigate('/agents/new')}>＋ 创建 Agent</button>
        </EmptyState>
      )}

      {$.agents.length > 0 && (
        <div class="grid-cards">
          {$.agents.map((a: any) => (
            <div key={a.id} class="item-card" onClick={() => ctx.app?.navigate(`/agents/${a.id}`)}>
              <div class="item-top">
                <Ava name={a.name} type={a.type} />
                <div class="item-name">{a.name}</div>
                <TypeBadge type={a.type} />
              </div>
              <div class="item-desc">{a.description || a.system_prompt || '暂无描述'}</div>
              <div class="item-meta" style={{ marginBottom: '10px', fontSize: '12px', gap: '12px' }}>
                {a.type === 'ai' && a.model && (
                  <span>🧠 {a.model === 'deepseek-reasoner' ? 'Reasoner' : a.model === 'deepseek-v4-flash' ? 'V4 Flash' : a.model || '默认模型'}</span>
                )}
                {a.type === 'ai' && a.human_in_the_loop && (
                  <span style={{ color: '#b45309' }}>🛑 需审批</span>
                )}
                {a.token_usage?.run_count > 0 && (
                  <span>⚡ {((a.token_usage?.total_tokens ?? 0) / 1000).toFixed(1)}k tokens</span>
                )}
              </div>
              <div class="item-foot">
                <StatusDot on={a.is_active !== false} />
                <div class="item-acts">
                  <button class="btn btn-ghost btn-sm"
                    onClick={(e: any) => { e.stopPropagation(); ctx.app?.navigate(`/agents/${a.id}`) }}>编辑</button>
                  <button class="btn btn-danger btn-sm" onClick={(e: any) => remove(e, a.id)}>删除</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
