/**
 * 创建部门页面
 */

import { signal, computed, createResource, Show, For } from 'weifuwu/client'
import type { WfuiContext } from 'weifuwu/client'
import { PageHeader, Loading, TypeBadge } from '../components/ui'

export function NewDepartment(_props: {}, ctx: WfuiContext) {
  const token = ctx.auth?.token?.value ?? ctx.auth?.token
  const headers = { Authorization: `Bearer ${token}` }

  const name = signal('')
  const companyId = signal('')
  const selected = signal<string[]>([])
  const submitting = signal(false)
  const error = signal('')
  const hasError = computed(() => error.value !== '')

  const [companies, { loading: loadingCompanies }] = createResource<any[]>(
    () => fetch('/api/companies', { headers }).then(r => r.json()).then(d => d.companies ?? []),
    { initialValue: [] },
  )
  const [agents] = createResource<any[]>(
    () => fetch('/api/agents', { headers }).then(r => r.json()).then(d => d.agents ?? []),
    { initialValue: [] },
  )

  const noCompany = computed(() => !loadingCompanies.value && (companies.value ?? []).length === 0)
  const selectedCount = computed(() => selected.value.length)

  function toggle(id: string) {
    const set = new Set(selected.value)
    if (set.has(id)) set.delete(id); else set.add(id)
    selected.value = [...set]
  }

  async function handleSubmit(e: Event) {
    e.preventDefault()
    if (!name.value.trim()) { error.value = '请输入部门名称'; return }
    const cid = companyId.value || companies.value?.[0]?.id
    if (!cid) { error.value = '请先创建公司'; return }
    submitting.value = true
    error.value = ''

    try {
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers },
        body: JSON.stringify({ company_id: cid, name: name.value.trim(), member_ids: selected.value }),
      })
      const data = await res.json()
      if (!res.ok) { error.value = data.error || '创建失败'; submitting.value = false; return }
      ctx.app.navigate('/departments')
    } catch {
      error.value = '网络错误'
      submitting.value = false
    }
  }

  return (
    <div class="page page-narrow">
      <a href="/departments" class="back-link" onClick={(e: any) => { e.preventDefault(); ctx.app.navigate('/departments') }}>← 返回部门列表</a>
      <PageHeader title="创建部门" sub="选择公司并添加成员" />

      <Show when={hasError}><div class="alert alert-err">{error}</div></Show>

      <Show when={loadingCompanies}><Loading /></Show>

      <Show when={noCompany}>
        <div class="empty">
          <div class="empty-ico">🏢</div>
          <div class="empty-txt">还没有公司</div>
          <div class="empty-hint">部门必须挂在公司下，请先在 API 中创建公司</div>
        </div>
      </Show>

      <Show when={computed(() => !noCompany.value && !loadingCompanies.value)}>
        <form class="card card-pad" onSubmit={handleSubmit}>
          <div class="field">
            <label class="field-label">部门名称 <span class="req">*</span></label>
            <input class="input" type="text" placeholder="如：技术部、市场部" value={name}
              onInput={(e: any) => { name.value = e.target.value }} />
          </div>

          <div class="field">
            <label class="field-label">所属公司</label>
            <select class="select" value={companyId} onChange={(e: any) => { companyId.value = e.target.value }}>
              <For each={companies}>{(c: any) => (
                <option value={c.id}>{c.name}</option>
              )}</For>
            </select>
          </div>

          <div class="field">
            <label class="field-label">
              添加成员 <span class="muted">（已选 {selectedCount} 个，可稍后添加）</span>
            </label>
            <div class="check-list">
              <For each={agents} keyBy="id">{(a: any) => (
                <label class="check-item">
                  <input type="checkbox" onChange={() => toggle(a.id)} />
                  <span>{a.name}</span>
                  <TypeBadge type={a.type} />
                </label>
              )}</For>
            </div>
          </div>

          <div class="form-foot">
            <button type="button" class="btn btn-ghost" onClick={() => ctx.app.navigate('/departments')}>取消</button>
            <button type="submit" class="btn btn-primary" disabled={submitting}>
              {computed(() => submitting.value ? '创建中...' : '创建部门')}
            </button>
          </div>
        </form>
      </Show>
    </div>
  )
}
