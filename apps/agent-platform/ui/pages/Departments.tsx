import type { UIContext, Component } from 'weifuwu/vdom'
import { PageHeader, Ava, EmptyState, Loading } from '../components/ui'
import { Badge, Button, Card, Icon } from 'weifuwu/components'
import type { Department, DepartmentListResponse } from '../lib/types'

interface DepartmentsState {
  depts: Department[]; loading: boolean
}

export const Departments: Component = (_props, ctx) => {
  const $ = {} as DepartmentsState
  const rerender = () => ctx.render()
  $.depts = []; $.loading = true
  ctx.api!.get<DepartmentListResponse>('/api/departments')
    .then(d => { $.depts = d.departments ?? []; $.loading = false; rerender() })
    .catch(() => { $.loading = false; rerender() })

  async function remove(e: Event, id: string) {
    e.stopPropagation()
    const ok = await ctx.confirm!('确定删除这个部门吗？')
    if (!ok) return
    try {
      // API 封装返回 JSON body——res.ok 不存在——不 throw 即成功
      // （2026-08 UI 测试抓出：删除成功却报「删除失败」——响应判断错）
      await ctx.api!.delete(`/api/departments/${id}`)
      $.depts = $.depts.filter((d: Department) => d.id !== id)
      rerender()
      ;ctx.toast!('部门已删除', 'success')
    } catch {
      ;ctx.toast!('删除失败', 'error')
    }
  }
  return (props) => (
    <div class="wf-stack wf-gap-lg">
      <PageHeader title="部门" sub="组织 Agent 与成员进行协作对话">
        <Button variant="primary" onClick={() => ctx.app?.navigate('/departments/new')}>＋ 创建部门</Button>
      </PageHeader>

      {$.loading && <Loading />}
      {!$.loading && $.depts.length === 0 && <EmptyState icon={<Icon name="users" />} text="暂无部门" hint="点击上方按钮创建第一个部门" />}

      {$.depts.length > 0 && (
        <div class="wf-grid">
          {$.depts.map((d: Department) => (
            <Card key={d.id} clickable hover onClick={() => ctx.app?.navigate(`/departments/${d.id}`)}>
              <div class="wf-row wf-gap-sm">
                <Ava name={d.is_dm ? '💬' : '👥'} type={d.is_dm ? 'user' : 'knowledge_base'} />
                <div class="wf-fill wf-font-base wf-semibold wf-truncate">{d.name ?? '未命名'}</div>
                <Badge variant={d.is_dm ? 'primary' : 'default'}>{d.is_dm ? '单聊' : '群聊'}</Badge>
              </div>
              <div class="wf-font-sm wf-text-secondary wf-margin-top-sm">当前应用群组</div>
              <div class="wf-split wf-margin-top-md">
                <span class="wf-font-xs wf-text-tertiary">{d.member_count ?? 0} 位成员</span>
                <div class="wf-row wf-gap-sm">
                  <Button size="sm" variant="ghost"
                    onClick={(e: Event) => { e.stopPropagation(); ctx.app?.navigate(`/chat/${d.id}`) }}>聊天</Button>
                  <Button size="sm" variant="danger" onClick={(e: Event) => remove(e, d.id)}>删除</Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
