import type { UIContext, Component } from 'weifuwu/vdom'
import { PageHeader, Ava, TypeBadge, EmptyState, Loading, StatusDot } from '../components/ui'
import { Button, Card, Icon, Skeleton } from 'weifuwu/components'
import type { Agent, AgentListResponse } from '../lib/types'

interface AgentsState {
  agents: Agent[]; loading: boolean
}

export const Agents: Component = (_props, ctx) => {
  const $ = {} as AgentsState
  const rerender = () => ctx.render()

  $.agents = []; $.loading = true
  ctx.api!.get<AgentListResponse>('/api/agents')
    .then(d => { $.agents = d.agents ?? []; $.loading = false; rerender() })
    .catch(() => { $.loading = false; rerender() })

  async function remove(e: Event, id: string) {
    e.stopPropagation()
    const ok = await ctx.confirm!('确定删除这个 Agent 吗？')
    if (!ok) return
    try {
      // API 封装返回 JSON body（非 Response）——res.ok 不存在——
      // 只要不 throw 即成功（ApiError——2026-08 UI 测试抓出：删除成功
      // 却报「删除失败」——响应判断错——数据删了 UI 不刷新）
      await ctx.api!.delete<{ ok?: boolean }>(`/api/agents/${id}`)
      $.agents = $.agents.filter((a: Agent) => a.id !== id)
      rerender()
      ;ctx.toast!('Agent 已删除', 'success')
    } catch {
      ;ctx.toast!('删除失败', 'error')
    }
  }

  async function startDm(e: Event, id: string) {
    e.stopPropagation()
    try {
      const res = await ctx.api!.post<{ department: { id: string } }>('/api/departments/dm', { agent_id: id })
      const d = res.department
      if (d?.id) { ctx.app?.navigate(`/chat/${d.id}`) }
      else { ctx.toast!('发起单聊失败', 'error') }
    } catch { ctx.toast!('发起单聊失败', 'error') }
  }
  return (props) => (
    <div class="wf-stack wf-gap-lg">
      <PageHeader title="Agent" sub="创建和管理 AI 机器人、Webhook 与知识库">
        <Button variant="primary" onClick={() => ctx.app?.navigate('/agents/new')}>＋ 创建 Agent</Button>
      </PageHeader>

      {$.loading && (
        <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(min(100%, 280px), 1fr))">
          {[1, 2, 3, 4].map(i => (
            <Card key={i}><Skeleton variant="text" width="60%" /><Skeleton variant="text" width="90%" className="wf-margin-top-sm" /><Skeleton variant="text" width="45%" className="wf-margin-top-sm" /></Card>
          ))}
        </div>
      )}

      {!$.loading && $.agents.length === 0 && (
        <EmptyState icon="🤖" text="还没有 Agent" hint="创建你的第一个 AI 机器人、Webhook 或知识库">
          <div class="wf-row wf-gap-sm">
            <Button variant="primary" onClick={() => ctx.app?.navigate('/templates')}><Icon name="layers" size={14} /> 从模板开始</Button>
            <Button variant="ghost" onClick={() => ctx.app?.navigate('/agents/new')}>＋ 自定义创建</Button>
          </div>
        </EmptyState>
      )}

      {$.agents.length > 0 && (
        <div class="wf-grid">
          {$.agents.map((a: Agent) => (
            <Card key={a.id} clickable hover onClick={() => ctx.app?.navigate(`/agents/${a.id}`)} style={{ display: 'flex', flexDirection: 'column' }}>
              <div class="wf-row wf-gap-sm">
                <Ava name={a.name} type={a.type} />
                <div class="wf-fill wf-font-base wf-semibold wf-truncate">{a.name}</div>
                <TypeBadge type={a.type} />
              </div>
              <div class="wf-font-sm wf-text-secondary wf-margin-top-sm">{a.description || a.system_prompt || '暂无描述'}</div>
              <div class="wf-row wf-gap-md wf-font-xs wf-text-tertiary wf-margin-top-sm">
                {a.type === 'ai' && a.model && (
                  <span>🧠 {a.model === 'deepseek-reasoner' ? 'Reasoner' : a.model === 'deepseek-v4-flash' ? 'V4 Flash' : a.model || '默认模型'}</span>
                )}
                {a.type === 'ai' && a.human_in_the_loop && (
                  <span class="wf-text-warning">🛑 需审批</span>
                )}
                {(a.token_usage?.run_count ?? 0) > 0 && (
                  <span>⚡ {((a.token_usage?.total_tokens ?? 0) / 1000).toFixed(1)}k tokens</span>
                )}
              </div>
              <div class="wf-split" style={{ marginTop: 'auto', paddingTop: '12px' }}>
                <StatusDot on={a.is_active !== false} />
                <div class="wf-row wf-gap-sm">
                  {a.type !== 'user' && (
                    <>
                      <Button size="sm" variant="ghost" title="发起单聊"
                        onClick={(e: Event) => startDm(e, a.id)}><Icon name="message" size={14} /> 单聊</Button>
                      <Button size="sm" variant="ghost"
                        onClick={(e: Event) => { e.stopPropagation(); ctx.app?.navigate(`/agents/${a.id}`) }}>编辑</Button>
                      <Button size="sm" variant="danger-ghost" onClick={(e: Event) => remove(e, a.id)}>删除</Button>
                    </>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
