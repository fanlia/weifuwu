import type { UIContext, Component } from 'weifuwu/vdom'
import { PageHeader, Ava, TypeBadge, EmptyState, Loading, StatusDot, errMsg, ListScaffold } from '../components/ui'
import { Button, Card, Icon, Skeleton } from 'weifuwu/components'
import { canWrite, writeDenyReason } from '../lib/roles'
import type { Agent, AgentListResponse } from '../lib/types'

interface AgentsState {
  agents: Agent[]; q: string
}

export const Agents: Component = (_props, ctx) => {
  // W1 迁移（Templates 范本）：原 `load(q) + ctx.render()` 是 pre-useAsyncData
  // 时代代码——工厂期异步启动 + finally(rerender)——v2 段复用语义下工厂
  // 不重跑 → 数据永不刷新（导航返回/同会话停滞）。useAsyncData：同 key 并发
  // 合并/竞态取消/缓存保留——搜索 q 用闭包 getter（reload 读最新）——
  // get() 返回 null = loading（区块降级）。
  const $ = {} as AgentsState
  $.agents = []; $.q = ''
  let qTimer: ReturnType<typeof setTimeout> | null = null
  let qValue = ''  // 搜索闭包（getter 纪律——reload 读最新）
  const [getAgents, reloadAgents] = ctx.ui.useAsyncData(async () => {
    const q = qValue
    const d = await ctx.api.get<AgentListResponse>(`/api/agents${q ? `?q=${encodeURIComponent(q)}` : ''}`)
    return d.agents ?? []
  }, 'agents-page')
  const onQInput = (e: Event) => {
    const v = ((e as unknown as { target: { value: string } }).target?.value ?? '')
    $.q = v; ctx.render()
    if (qTimer) clearTimeout(qTimer)
    qTimer = setTimeout(() => reloadAgents(), 300)
  }

  async function remove(e: Event, id: string) {
    e.stopPropagation()
    const ok = await ctx.confirm('确定删除这个 Agent 吗？')
    if (!ok) return
    try {
      // API 封装返回 JSON body（非 Response）——res.ok 不存在——
      // 只要不 throw 即成功（ApiError——2026-08 UI 测试抓出：删除成功
      // 却报「删除失败」——响应判断错——数据删了 UI 不刷新）
      await ctx.api.delete<{ ok?: boolean }>(`/api/agents/${id}`)
      reloadAgents()  // 真源刷新（useAsyncData reload——服务器权威）
      ;ctx.toast('Agent 已删除', 'success')
      ;ctx.toast('Agent 已删除', 'success')
    } catch (e) {
      // ROLES-OPTIMIZATION 波次 3：403 原因透出（如 viewer 删除 →「仅管理员可删除」）
      ;ctx.toast(`删除失败：${errMsg(e, '请稍后重试')}`, 'error')
    }
  }

  async function startDm(e: Event, id: string) {
    e.stopPropagation()
    try {
      const res = await ctx.api.post<{ department: { id: string } }>('/api/departments/dm', { agent_id: id })
      const d = res.department
      if (d?.id) { ctx.app?.navigate(`/chat/${d.id}`) }
      else { ctx.toast('发起单聊失败', 'error') }
    } catch { ctx.toast('发起单聊失败', 'error') }
  }
  return (props) => {
    // getter 纪律：渲染期读最新（工厂期解构 = 快照——state$ 更新后渲染
    // 用旧值——Templates 范本在 renderFn 内读）
    const loading = getAgents() === null
    const agents = getAgents() ?? []
    return (
    <ListScaffold title="Agent" sub="创建和管理 AI 机器人、Webhook 与知识库" loading={loading}
      actions={
        <Button variant="primary" disabled={!canWrite()} title={canWrite() ? undefined : writeDenyReason()}
          onClick={() => ctx.app?.navigate('/agents/new')}>＋ 创建 Agent</Button>
      }
      empty={{ icon: '🤖', text: '还没有 Agent', hint: '创建你的第一个 AI 机器人、Webhook 或知识库' }}>
      <div class="wf-row wf-gap-sm wf-items-center wf-margin-bottom-md">
        <div class="wf-fill" style="max-width: 320px">
          <input class="wf-input wf-padding-x-sm wf-padding-y-xs" placeholder="搜索 Agent（名称——1000 实体可管）" value={$.q} onInput={onQInput} />
        </div>
        <span class="wf-font-xs wf-text-tertiary">{loading ? '加载中…' : `${agents.length} 个`}</span>
      </div>
      {agents.length > 0 && (
        <div class="wf-grid">
          {agents.map((a: Agent) => (
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
                <StatusDot on={a.is_active !== false} label={a.is_active !== false ? '运行中' : '已停用'} />
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
    </ListScaffold>
    )
  }
}
