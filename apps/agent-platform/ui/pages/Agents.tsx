/**
 * Agent 列表页
 */

import { computed, createResource, Show, For } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'
import { PageHeader, TypeBadge, Ava, EmptyState, Loading, StatusDot } from '../components/ui'

export function Agents(_props: {}, ctx: WfuiContext) {
  const token = ctx.auth?.token?.value ?? ctx.auth?.token
  const headers = { Authorization: `Bearer ${token}` }

  const [agents, { loading, refetch }] = createResource<any[]>(
    () => fetch('/api/agents', { headers }).then(r => r.json()).then(d => d.agents ?? []),
    { initialValue: [] },
  )

  const isEmpty = computed(() => !loading.value && (agents.value ?? []).length === 0)
  const hasData = computed(() => (agents.value ?? []).length > 0)

  async function remove(e: Event, id: string) {
    e.stopPropagation()
    if (!confirm('确定删除这个 Agent 吗？')) return
    const res = await fetch(`/api/agents/${id}`, { method: 'DELETE', headers })
    if (res.ok || res.status === 204) refetch()
  }

  return (
    <div class="page">
      <PageHeader title="Agent" sub="创建和管理 AI 机器人、Webhook 与知识库">
        <button class="btn btn-primary" onClick={() => ctx.app.navigate('/agents/new')}>＋ 创建 Agent</button>
      </PageHeader>

      <Show when={loading}>
        <Loading />
      </Show>

      <Show when={isEmpty}>
        <EmptyState icon="🤖" text="还没有 Agent" hint="创建你的第一个 AI 机器人、Webhook 或知识库">
          <button class="btn btn-primary" onClick={() => ctx.app.navigate('/agents/new')}>＋ 创建 Agent</button>
        </EmptyState>
      </Show>

      <Show when={hasData}>
        <div class="grid-cards">
          <For each={agents} keyBy="id">{(a: any) => (
            <div class="item-card" onClick={() => ctx.app.navigate(`/agents/${a.id}`)}>
              <div class="item-top">
                <Ava name={a.name} type={a.type} />
                <div class="item-name">{a.name}</div>
                <TypeBadge type={a.type} />
              </div>
              <div class="item-desc">{a.description || a.system_prompt || '暂无描述'}</div>
              <div class="item-foot">
                <StatusDot on={a.is_active !== false} />
                <div class="item-acts">
                  <button
                    class="btn btn-ghost btn-sm"
                    onClick={(e: any) => { e.stopPropagation(); ctx.app.navigate(`/agents/${a.id}`) }}
                  >编辑</button>
                  <button class="btn btn-danger btn-sm" onClick={(e: any) => remove(e, a.id)}>删除</button>
                </div>
              </div>
            </div>
          )}</For>
        </div>
      </Show>
    </div>
  )
}
