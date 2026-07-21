/**
 * 部门详情页 — 信息头 + 成员列表 + 进入聊天
 */

import { computed, createResource, Show, For } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'
import { Loading, TypeBadge, Ava } from '../components/ui'

export function DepartmentDetail(_props: {}, ctx: WfuiContext) {
  const deptId = ctx.route?.params?.id ?? ''
  const token = ctx.auth?.token?.value ?? ctx.auth?.token
  const headers = { Authorization: `Bearer ${token}` }

  const [data, { loading }] = createResource<any>(
    () => fetch(`/api/departments/${deptId}`, { headers }).then(r => r.json()),
  )

  const dept = computed(() => data.value?.department ?? data.value ?? null)
  const members = computed(() => data.value?.members ?? [])
  const loaded = computed(() => !loading.value && !!dept.value?.id)
  const notFound = computed(() => !loading.value && !dept.value?.id)

  return (
    <div class="page">
      <a href="/departments" class="back-link" onClick={(e: any) => { e.preventDefault(); ctx.app.navigate('/departments') }}>← 返回部门列表</a>

      <Show when={loading}><Loading /></Show>

      <Show when={notFound}>
        <div class="empty">
          <div class="empty-ico">🔍</div>
          <div class="empty-txt">部门不存在</div>
        </div>
      </Show>

      <Show when={loaded}>
        {() => (
          <div>
            <div class="detail-hero card">
              <div class={`ava ${dept.value?.is_dm ? 'ava-user' : 'ava-knowledge_base'}`}>
                {dept.value?.is_dm ? '💬' : '👥'}
              </div>
              <div class="detail-hero-info">
                <div class="detail-hero-name">
                  {computed(() => dept.value?.name ?? '')}
                  {dept.value?.is_dm
                    ? <span class="badge badge-user">单聊</span>
                    : <span class="badge badge-gray">群聊</span>}
                </div>
                <div class="detail-hero-sub">
                  {computed(() => `${dept.value?.company_name ?? '未知公司'} · ${members.value.length} 位成员`)}
                </div>
              </div>
              <button class="btn btn-primary" onClick={() => ctx.app.navigate(`/chat/${deptId}`)}>进入聊天 →</button>
            </div>

            <div class="card">
              <div class="member-row" style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-2)' }}>
                成员列表
              </div>
              <For each={members} keyBy="id">{(m: any) => (
                <div class="member-row">
                  <Ava name={m.name} type={m.type} small />
                  <div class="member-meta">
                    <span class="member-name">{m.name}</span>
                    <span class="member-role">{m.role === 'admin' ? '管理员' : '成员'}</span>
                  </div>
                  <TypeBadge type={m.type} />
                </div>
              )}</For>
              <Show when={computed(() => members.value.length === 0)}>
                <div class="empty" style={{ padding: '36px' }}>
                  <div class="empty-txt">暂无成员</div>
                </div>
              </Show>
            </div>
          </div>
        )}
      </Show>
    </div>
  )
}
