/**
 * 发起聊天 — 选择部门进入对话
 */

import { computed, createResource, Show, For } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'
import { PageHeader, EmptyState, Loading } from '../components/ui'

export function NewChat(_props: {}, ctx: WfuiContext) {
  const token = ctx.auth?.token?.value ?? ctx.auth?.token
  const headers = { Authorization: `Bearer ${token}` }

  const [depts, { loading }] = createResource<any[]>(
    () => fetch('/api/departments', { headers }).then(r => r.json()).then(d => d.departments ?? []),
    { initialValue: [] },
  )

  const isEmpty = computed(() => !loading.value && (depts.value ?? []).length === 0)
  const hasData = computed(() => (depts.value ?? []).length > 0)

  return (
    <div class="page page-narrow">
      <PageHeader title="发起聊天" sub="选择一个部门开始对话" />

      <Show when={loading}><Loading /></Show>

      <Show when={isEmpty}>
        <EmptyState icon="💬" text="暂无可聊的部门" hint="先创建一个部门并添加成员">
          <button class="btn btn-primary" onClick={() => ctx.app.navigate('/departments/new')}>＋ 创建部门</button>
        </EmptyState>
      </Show>

      <Show when={hasData}>
        <div class="grid-cards" style={{ gridTemplateColumns: '1fr' }}>
          <For each={depts} keyBy="id">{(d: any) => (
            <div class="item-card" onClick={() => ctx.app.navigate(`/chat/${d.id}`)}>
              <div class="item-top" style={{ marginBottom: '0' }}>
                <div class={`ava ${d.is_dm ? 'ava-user' : 'ava-knowledge_base'}`}>{d.is_dm ? '💬' : '👥'}</div>
                <div class="grow">
                  <div class="item-name">{d.name}</div>
                  <div class="item-meta mt-8">{d.member_count ?? 0} 位成员{d.company_name ? ` · ${d.company_name}` : ''}</div>
                </div>
                <span class="muted">→</span>
              </div>
            </div>
          )}</For>
        </div>
      </Show>
    </div>
  )
}
