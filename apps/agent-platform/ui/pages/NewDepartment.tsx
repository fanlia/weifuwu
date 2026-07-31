import type { WfuiContext, Component } from 'weifuwu/client'
import { PageHeader, Loading, TypeBadge } from '../components/ui'

export const NewDepartment: Component = (_props, ctx) => {
  const $ = ctx.ui.$()
  const token = ctx.auth?.token

    $.name = ''; $.companyId = ''; $.selected = []; $.submitting = false; $.error = ''
    $.companies = []; $.agents = []; $.loading = true
    Promise.all([
      fetch('/api/companies', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(d => d.companies ?? []),
      fetch('/api/agents', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(d => d.agents ?? []),
    ]).then(([companies, agents]) => {
      $.companies = companies; $.agents = agents; $.loading = false
    }).catch(() => { $.loading = false })

  function toggle(id: string) {
    const set = new Set($.selected)
    if (set.has(id)) set.delete(id); else set.add(id)
    $.selected = [...set]
  }

  async function handleSubmit(e: Event) {
    e.preventDefault()
    if (!$.name.trim()) { $.error = '请输入部门名称'; return }
    const cid = $.companyId || $.companies?.[0]?.id
    if (!cid) { $.error = '请先创建公司'; return }
    $.submitting = true; $.error = ''
    try {
      const res = await fetch('/api/departments', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ company_id: cid, name: $.name.trim(), member_ids: $.selected }),
      })
      const data = await res.json()
      if (!res.ok) { $.error = data.error || '创建失败'; $.submitting = false; return }
      ctx.app?.navigate('/departments')
    } catch { $.error = '网络错误'; $.submitting = false }
  }
  return (props) => (
    <div class="page page-narrow">
      <a class="back-link" onClick={() => ctx.app?.navigate('/departments')}>← 返回部门列表</a>
      <PageHeader title="创建部门" sub="选择公司并添加成员" />

      {$.error && <div class="alert alert-err">{$.error}</div>}

      {$.loading && <Loading />}

      {!$.loading && $.companies.length === 0 && (
        <div class="empty">
          <div class="empty-ico">🏢</div>
          <div class="empty-txt">还没有公司</div>
          <div class="empty-hint">部门必须挂在公司下，请先在 API 中创建公司</div>
        </div>
      )}

      {!$.loading && $.companies.length > 0 && (
        <form class="card card-pad" onSubmit={handleSubmit}>
          <div class="field">
            <label class="field-label">部门名称 <span class="req">*</span></label>
            <input class="input" type="text" placeholder="如：技术部、市场部" value={$.name}
              onInput={(e: any) => { $.name = e.target.value }} />
          </div>

          <div class="field">
            <label class="field-label">所属公司</label>
            <select class="select" value={$.companyId} onChange={(e: any) => { $.companyId = e.target.value }}>
              {$.companies.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div class="field">
            <label class="field-label">
              添加成员 <span class="muted">（已选 {$.selected.length} 个，可稍后添加）</span>
            </label>
            <div class="check-list">
              {$.agents.map((a: any) => (
                <label key={a.id} class="check-item">
                  <input type="checkbox" checked={$.selected.includes(a.id)} onChange={() => toggle(a.id)} />
                  <span>{a.name}</span>
                  <TypeBadge type={a.type} />
                </label>
              ))}
            </div>
          </div>

          <div class="form-foot">
            <button type="button" class="btn btn-ghost" onClick={() => ctx.app?.navigate('/departments')}>取消</button>
            <button type="submit" class="btn btn-primary" disabled={$.submitting}>
              {$.submitting ? '创建中...' : '创建部门'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
