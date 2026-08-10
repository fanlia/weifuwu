import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { Ava, Loading, TypeBadge } from '../components/ui'
import { Badge, Button, Card, EmptyState } from 'weifuwu/components'

export const DepartmentDetail: Component = (_props, ctx) => {
  const $ = ctx.ui.$()
  const deptId = ctx.route?.params?.id ?? ''
  const token = ctx.auth?.token

    $.dept = null; $.members = []; $.loading = true; $.notFound = false
    ctx.api!.get(`/api/departments/${deptId}`)
      .then(data => {
        const d = data.department ?? data ?? null
        if (!d?.id) { $.notFound = true; $.loading = false; return }
        $.dept = d
        $.members = data.members ?? []
        $.loading = false
      }).catch(() => { $.loading = false })

  return (props) => {
    if ($.loading) return <div class="wf-stack wf-gap-lg"><Loading /></div>
    if ($.notFound) return <div class="wf-stack wf-gap-lg"><EmptyState icon="🔍" text="部门不存在" /></div>
    return (
    <div class="wf-stack wf-gap-lg">
      <a class="wf-text-sm wf-text-brand" onClick={() => ctx.app?.navigate('/departments')}>← 返回部门列表</a>

      <Card>
        <div class="wf-row wf-gap-md">
          <Ava name={$.dept?.is_dm ? '💬' : '👥'} type={$.dept?.is_dm ? 'user' : 'knowledge_base'} />
          <div class="wf-fill wf-stack wf-gap-xs">
            <div class="wf-text-lg wf-text-semibold">
              {$.dept?.name ?? ''}
              {' '}
              {$.dept?.is_dm
                ? <Badge variant="primary">单聊</Badge>
                : <Badge variant="default">群聊</Badge>}
            </div>
            <div class="wf-text-sm wf-text-secondary">
              {$.dept?.company_name ?? '未知公司'} · {$.members.length} 位成员
            </div>
          </div>
          <Button variant="primary" onClick={() => ctx.app?.navigate(`/chat/${deptId}`)}>进入聊天 →</Button>
        </div>
      </Card>

      <Card>
        <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary wf-mb-sm">成员列表</div>
        {$.members.map((m: any) => (
          <div key={m.id} class="wf-row wf-gap-sm wf-py-sm wf-border-b">
            <Ava name={m.name} type={m.type ?? 'user'} small />
            <div class="wf-fill wf-stack wf-gap-none">
              <span class="wf-text-base">{m.name}</span>
              <span class="wf-text-xs wf-text-tertiary">{m.role === 'admin' ? '管理员' : '成员'}</span>
            </div>
            <TypeBadge type={m.type} />
          </div>
        ))}
        {$.members.length === 0 && (
          <div class="wf-py-lg"><EmptyState text="暂无成员" /></div>
        )}
      </Card>
    </div>
    )
  }
}
