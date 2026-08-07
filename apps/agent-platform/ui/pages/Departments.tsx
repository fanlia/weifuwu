import type { WfuiContext, Component } from 'weifuwu/client'
import { PageHeader, Ava, EmptyState, Loading } from '../components/ui'
import { Badge, Button, Card } from 'weifuwu/components'

export const Departments: Component = (_props, ctx) => {
  const $ = ctx.ui.$()
   $.depts = []; $.loading = true
    ctx.api!.get('/api/departments')
      .then(r => r.json()).then(d => { $.depts = d.departments ?? []; $.loading = false })
      .catch(() => { $.loading = false })

  async function remove(e: Event, id: string) {
    e.stopPropagation()
    const ok = await ctx.confirm!('确定删除这个部门吗？')
    if (!ok) return
    const res = await ctx.api!.delete(`/api/departments/${id}`)
    if (res.ok || res.status === 204) {
      $.depts = $.depts.filter((d: any) => d.id !== id)
      ;ctx.toast!('部门已删除', 'success')
    } else {
      ;ctx.toast!('删除失败', 'error')
    }
  }
  return (props) => (
    <div class="wf-stack wf-gap-lg">
      <PageHeader title="部门" sub="组织 Agent 与成员进行协作对话">
        <Button variant="primary" onClick={() => ctx.app?.navigate('/departments/new')}>＋ 创建部门</Button>
      </PageHeader>

      {$.loading && <Loading />}
      {!$.loading && $.depts.length === 0 && <EmptyState icon="👥" text="暂无部门" hint="点击上方按钮创建第一个部门" />}

      {$.depts.length > 0 && (
        <div class="wf-grid">
          {$.depts.map((d: any) => (
            <Card key={d.id} clickable hover onClick={() => ctx.app?.navigate(`/departments/${d.id}`)}>
              <div class="wf-row wf-gap-sm">
                <Ava name={d.is_dm ? '💬' : '👥'} type={d.is_dm ? 'user' : 'knowledge_base'} />
                <div class="wf-fill wf-text-base wf-text-semibold wf-truncate">{d.name ?? '未命名'}</div>
                <Badge variant={d.is_dm ? 'primary' : 'default'}>{d.is_dm ? '单聊' : '群聊'}</Badge>
              </div>
              <div class="wf-text-sm wf-text-secondary wf-mt-sm">{d.company_name ? `所属公司：${d.company_name}` : '跨部门协作群组'}</div>
              <div class="wf-split wf-mt-md">
                <span class="wf-text-xs wf-text-tertiary">{d.member_count ?? 0} 位成员</span>
                <div class="wf-row wf-gap-sm">
                  <Button size="sm" variant="ghost"
                    onClick={(e: any) => { e.stopPropagation(); ctx.app?.navigate(`/chat/${d.id}`) }}>聊天</Button>
                  <Button size="sm" variant="danger" onClick={(e: any) => remove(e, d.id)}>删除</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
