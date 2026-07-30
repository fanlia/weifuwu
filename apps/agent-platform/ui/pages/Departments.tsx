import type { WfuiContext, Component } from 'weifuwu/client'
import { PageHeader, EmptyState, Loading } from '../components/ui'

export const Departments: Component = (_props, ctx) => {
  const $ = ctx.ui.$()
   $.depts = []; $.loading = true
    fetch('/api/departments', { headers: { Authorization: `Bearer ${ctx.auth?.token}` } })
      .then(r => r.json()).then(d => { $.depts = d.departments ?? []; $.loading = false })
      .catch(() => { $.loading = false })

  async function remove(e: Event, id: string) {
    e.stopPropagation()
    if (!confirm('确定删除这个部门吗？')) return
    const res = await fetch(`/api/departments/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${ctx.auth?.token}` } })
    if (res.ok || res.status === 204) {
      $.depts = $.depts.filter((d: any) => d.id !== id)
     
    }

  }
  return (props) => (
    <div class="page">
      <PageHeader title="部门" sub="组织 Agent 与成员进行协作对话">
        <button class="btn btn-primary" onClick={() => ctx.app?.navigate('/departments/new')}>＋ 创建部门</button>
      </PageHeader>

      {$.loading && <Loading />}
      {!$.loading && $.depts.length === 0 && <EmptyState icon="👥" text="暂无部门" hint="点击上方按钮创建第一个部门" />}

      {$.depts.length > 0 && (
        <div class="grid-cards">
          {$.depts.map((d: any) => (
            <div key={d.id} class="item-card" onClick={() => ctx.app?.navigate(`/departments/${d.id}`)}>
              <div class="item-top">
                <div class={`ava ava-sm ${d.is_dm ? 'ava-user' : 'ava-knowledge_base'}`}>{d.is_dm ? '💬' : '👥'}</div>
                <div class="item-name">{d.name ?? '未命名'}</div>
                {d.is_dm ? <span class="badge badge-user">单聊</span> : <span class="badge badge-gray">群聊</span>}
              </div>
              <div class="item-desc">{d.company_name ? `所属公司：${d.company_name}` : '跨部门协作群组'}</div>
              <div class="item-foot">
                <span class="item-meta">{d.member_count ?? 0} 位成员</span>
                <div class="item-acts">
                  <button class="btn btn-ghost btn-sm"
                    onClick={(e: any) => { e.stopPropagation(); ctx.app?.navigate(`/chat/${d.id}`) }}>聊天</button>
                  <button class="btn btn-danger btn-sm" onClick={(e: any) => remove(e, d.id)}>删除</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
