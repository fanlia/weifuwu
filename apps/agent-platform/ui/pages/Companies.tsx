/**
 * 公司列表页
 */

import { computed, createResource, Show, For } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'
import { PageHeader, EmptyState, Loading } from '../components/ui'

export function Companies(_props: {}, ctx: WfuiContext) {
  const token = ctx.auth?.token?.value ?? ctx.auth?.token
  const headers = { Authorization: `Bearer ${token}` }

  const [companies, { loading, refetch }] = createResource<any[]>(
    () => fetch('/api/companies', { headers }).then(r => r.json()).then(d => d.companies ?? []),
    { initialValue: [] },
  )

  const isEmpty = computed(() => !loading.value && (companies.value ?? []).length === 0)
  const hasData = computed(() => (companies.value ?? []).length > 0)

  async function remove(e: Event, id: string) {
    e.stopPropagation()
    if (!confirm('确定删除这家公司吗？所有部门将一并删除。')) return
    const res = await fetch(`/api/companies/${id}`, { method: 'DELETE', headers })
    if (res.ok || res.status === 204) refetch()
  }

  return (
    <div class="page">
      <PageHeader title="公司" sub="管理公司及其下属部门">
        <button class="btn btn-primary" onClick={() => ctx.app.navigate('/companies/new')}>＋ 创建公司</button>
      </PageHeader>

      <Show when={loading}>
        <Loading />
      </Show>

      <Show when={isEmpty}>
        <EmptyState icon="🏢" text="还没有公司" hint="创建公司来组织部门与 Agent">
          <button class="btn btn-primary" onClick={() => ctx.app.navigate('/companies/new')}>＋ 创建公司</button>
        </EmptyState>
      </Show>

      <Show when={hasData}>
        <div class="grid-cards">
          <For each={companies} keyBy="id">{(c: any) => (
            <div class="item-card">
              <div class="item-top">
                <div class="ava ava-ai" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
                  {(c.name ?? 'C')[0]}
                </div>
                <div class="item-name">{c.name}</div>
              </div>
              <div class="item-desc">
                创建于 {new Date(c.created_at).toLocaleDateString('zh-CN')}
              </div>
              <div class="item-foot">
                <span class="item-meta">ID: {c.id?.slice(0, 8)}...</span>
                <div class="item-acts">
                  <button
                    class="btn btn-danger btn-sm"
                    onClick={(e: any) => remove(e, c.id)}
                  >删除</button>
                </div>
              </div>
            </div>
          )}</For>
        </div>
      </Show>
    </div>
  )
}
