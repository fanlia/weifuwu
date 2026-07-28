import type { WfuiContext, Component } from 'weifuwu/client'
import { Loading, TypeBadge } from '../components/ui'

export const DepartmentDetail: Component = (_props, ctx) => {
  const $ = ctx.ui.$()
  const deptId = ctx.route?.params?.id ?? ''
  const token = ctx.auth?.token

    $.dept = null; $.members = []; $.loading = true; $.notFound = false
    fetch(`/api/departments/${deptId}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(data => {
        const d = data.department ?? data ?? null
        if (!d?.id) { $.notFound = true; $.loading = false; return }
        $.dept = d
        $.members = data.members ?? []
        $.loading = false
      }).catch(() => { $.loading = false })

  if ($.loading) return <div class="page"><Loading /></div>
  if ($.notFound) return <div class="page"><div class="empty"><div class="empty-ico">🔍</div><div class="empty-txt">部门不存在</div></div></div>

  return (props) => (
    <div class="page">
      <a class="back-link" onClick={() => ctx.app?.navigate('/departments')}>← 返回部门列表</a>

      <div class="detail-hero card">
        <div class={`ava ${$.dept?.is_dm ? 'ava-user' : 'ava-knowledge_base'}`}>
          {$.dept?.is_dm ? '💬' : '👥'}
        </div>
        <div class="detail-hero-info">
          <div class="detail-hero-name">
            {$.dept?.name ?? ''}
            {$.dept?.is_dm
              ? <span class="badge badge-user">单聊</span>
              : <span class="badge badge-gray">群聊</span>}
          </div>
          <div class="detail-hero-sub">
            {$.dept?.company_name ?? '未知公司'} · {$.members.length} 位成员
          </div>
        </div>
        <button class="btn btn-primary" onClick={() => ctx.app?.navigate(`/chat/${deptId}`)}>进入聊天 →</button>
      </div>

      <div class="card">
        <div class="member-row" style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-2)' }}>
          成员列表
        </div>
        {$.members.map((m: any) => (
          <div key={m.id} class="member-row">
            <div class={`ava ava-sm ava-${m.type ?? 'user'}`}>{(m.name ?? '?')[0]}</div>
            <div class="member-meta">
              <span class="member-name">{m.name}</span>
              <span class="member-role">{m.role === 'admin' ? '管理员' : '成员'}</span>
            </div>
            <TypeBadge type={m.type} />
          </div>
        ))}
        {$.members.length === 0 && (
          <div class="empty" style={{ padding: '36px' }}>
            <div class="empty-txt">暂无成员</div>
          </div>
        )}
      </div>
    </div>
  )
}
