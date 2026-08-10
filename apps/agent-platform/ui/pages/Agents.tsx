import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { PageHeader, Ava, TypeBadge, EmptyState, Loading, StatusDot } from '../components/ui'
import { Button, Card } from 'weifuwu/components'

export const Agents: Component = (_props, ctx) => {
  const $ = ctx.ui.$()
  const token = ctx.auth?.token

    $.agents = []; $.loading = true
    ctx.api!.get('/api/agents')
      .then(d => { $.agents = d.agents ?? []; $.loading = false })
      .catch(() => { $.loading = false })

  async function remove(e: Event, id: string) {
    e.stopPropagation()
    const ok = await ctx.confirm!('确定删除这个 Agent 吗？')
    if (!ok) return
    const res = await ctx.api!.delete(`/api/agents/${id}`)
    if (res.ok || res.status === 204) {
      $.agents = $.agents.filter((a: any) => a.id !== id)
      ;ctx.toast!('Agent 已删除', 'success')
    } else {
      ;ctx.toast!('删除失败', 'error')
    }
  }
  return (props) => (
    <div class="wf-stack wf-gap-lg">
      <PageHeader title="Agent" sub="创建和管理 AI 机器人、Webhook 与知识库">
        <Button variant="primary" onClick={() => ctx.app?.navigate('/agents/new')}>＋ 创建 Agent</Button>
      </PageHeader>

      {$.loading && <Loading />}

      {!$.loading && $.agents.length === 0 && (
        <EmptyState icon="🤖" text="还没有 Agent" hint="创建你的第一个 AI 机器人、Webhook 或知识库">
          <Button variant="primary" onClick={() => ctx.app?.navigate('/agents/new')}>＋ 创建 Agent</Button>
        </EmptyState>
      )}

      {$.agents.length > 0 && (
        <div class="wf-grid">
          {$.agents.map((a: any) => (
            <Card key={a.id} clickable hover onClick={() => ctx.app?.navigate(`/agents/${a.id}`)}>
              <div class="wf-row wf-gap-sm">
                <Ava name={a.name} type={a.type} />
                <div class="wf-fill wf-text-base wf-text-semibold wf-truncate">{a.name}</div>
                <TypeBadge type={a.type} />
              </div>
              <div class="wf-text-sm wf-text-secondary wf-mt-sm">{a.description || a.system_prompt || '暂无描述'}</div>
              <div class="wf-row wf-gap-md wf-text-xs wf-text-tertiary wf-mt-sm">
                {a.type === 'ai' && a.model && (
                  <span>🧠 {a.model === 'deepseek-reasoner' ? 'Reasoner' : a.model === 'deepseek-v4-flash' ? 'V4 Flash' : a.model || '默认模型'}</span>
                )}
                {a.type === 'ai' && a.human_in_the_loop && (
                  <span class="wf-text-warning">🛑 需审批</span>
                )}
                {a.token_usage?.run_count > 0 && (
                  <span>⚡ {((a.token_usage?.total_tokens ?? 0) / 1000).toFixed(1)}k tokens</span>
                )}
              </div>
              <div class="wf-split wf-mt-md">
                <StatusDot on={a.is_active !== false} />
                <div class="wf-row wf-gap-sm">
                  <Button size="sm" variant="ghost"
                    onClick={(e: any) => { e.stopPropagation(); ctx.app?.navigate(`/agents/${a.id}`) }}>编辑</Button>
                  <Button size="sm" variant="danger" onClick={(e: any) => remove(e, a.id)}>删除</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
