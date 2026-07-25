import type { WfuiContext } from 'weifuwu/client'
import { PageHeader, EmptyState, Loading } from '../components/ui'

export function NewChat(_props: {}, ctx: WfuiContext) {
  const $ = ctx.ui.$
  const token = ctx.auth?.token

  if (!ctx.ui.ready) { $.depts = []; $.loading = true
    fetch('/api/departments', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { $.depts = d.departments ?? []; $.loading = false })
      .catch(() => { $.loading = false })
  }

  return (
    <div class="page page-narrow">
      <PageHeader title="发起聊天" sub="选择一个部门开始对话" />

      {$.loading && <Loading />}

      {!$.loading && $.depts.length === 0 && (
        <EmptyState icon="💬" text="暂无可聊的部门" hint="先创建一个部门并添加成员">
          <button class="btn btn-primary" onClick={() => ctx.app?.navigate('/departments/new')}>＋ 创建部门</button>
        </EmptyState>
      )}

      {$.depts.length > 0 && (
        <div class="grid-cards" style={{ gridTemplateColumns: '1fr' }}>
          {$.depts.map((d: any) => (
            <div key={d.id} class="item-card" onClick={() => ctx.app?.navigate(`/chat/${d.id}`)}>
              <div class="item-top" style={{ marginBottom: '0' }}>
                <div class={`ava ${d.is_dm ? 'ava-user' : 'ava-knowledge_base'}`}>{d.is_dm ? '💬' : '👥'}</div>
                <div style={{ flex: 1 }}>
                  <div class="item-name">{d.name}</div>
                  <div class="item-meta" style={{ marginTop: '8px' }}>{d.member_count ?? 0} 位成员{d.company_name ? ` · ${d.company_name}` : ''}</div>
                </div>
                <span class="muted">→</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
