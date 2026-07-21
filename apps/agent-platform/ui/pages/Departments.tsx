/**
 * 部门列表页
 */

import { computed, createResource, Show, For } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'
import { PageHeader, EmptyState, Loading } from '../components/ui'

export function Departments(_props: {}, ctx: WfuiContext) {
  const token = ctx.auth?.token?.value ?? ctx.auth?.token
  const headers = { Authorization: `Bearer ${token}` }

  const [depts, { loading, refetch }] = createResource<any[]>(
    () => fetch('/api/departments', { headers }).then(r => r.json()).then(d => d.departments ?? []),
    { initialValue: [] },
  )

  const isEmpty = computed(() => !loading.value && (depts.value ?? []).length === 0)
  const hasData = computed(() => (depts.value ?? []).length > 0)

  async function remove(e: Event, id: string) {
    e.stopPropagation()
    if (!confirm('确定删除这个部门吗？')) return
    const res = await fetch(`/api/departments/${id}`, { method: 'DELETE', headers })
    if (res.ok || res.status === 204) refetch()
  }

  return (
    <div class="page">
      <PageHeader title="部门" sub="组织 Agent 与成员进行协作对话">
        <button class="btn btn-primary" onClick={() => ctx.app.navigate('/departments/new')}>＋ 创建部门</button>
      </PageHeader>

      <Show when={loading}>
        <Loading />
      </Show>

      <Show when={isEmpty}>
        <EmptyState icon="👥" text="还没有部门" hint="创建部门，把 AI 和真人拉进同一个群组">
          <button class="btn btn-primary" onClick={() => ctx.app.navigate('/departments/new')}>＋ 创建部门</button>
        </EmptyState>
      </Show>

      <Show when={hasData}>
        <div class="grid-cards">
          <For each={depts} keyBy="id">{(d: any) => (
            <div class="item-card" onClick={() => ctx.app.navigate(`/departments/${d.id}`)}>
              <div class="item-top">
                <div class={`ava ${d.is_dm ? 'ava-user' : 'ava-knowledge_base'}`}>{d.is_dm ? '💬' : '👥'}</div>
                <div class="item-name">{d.name}</div>
                {d.is_dm ? <span class="badge badge-user">单聊</span> : <span class="badge badge-gray">群聊</span>}
              </div>
              <div class="item-desc">{d.company_name ? `所属公司：${d.company_name}` : '跨部门协作群组'}</div>
              <div class="item-foot">
                <span class="item-meta">{d.member_count ?? 0} 位成员</span>
                <div class="item-acts">
                  <button
                    class="btn btn-ghost btn-sm"
                    onClick={(e: any) => { e.stopPropagation(); ctx.app.navigate(`/chat/${d.id}`) }}
                  >聊天</button>
                  <button class="btn btn-danger btn-sm" onClick={(e: any) => remove(e, d.id)}>删除</button>
                </div>
              </div>
            </div>
          )}</For>
        </div>
      </Show>
    </div>
  )
}
