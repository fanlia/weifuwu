import type { WfuiContext, Component } from 'weifuwu/client'
import { PageHeader, Ava, EmptyState, Loading } from '../components/ui'
import { Button, Card } from 'weifuwu/components'

export const NewChat: Component = (_props, ctx) => {
  const $ = ctx.ui.$()
  const token = ctx.auth?.token

   $.depts = []; $.loading = true
    ctx.api!.get('/api/departments')
      .then(d => { $.depts = d.departments ?? []; $.loading = false })
      .catch(() => { $.loading = false })

  return (props) => (
    <div class="wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto" style="--wf-max: 720px">
      <PageHeader title="发起聊天" sub="选择一个部门开始对话" />

      {$.loading && <Loading />}

      {!$.loading && $.depts.length === 0 && (
        <EmptyState icon="💬" text="暂无可聊的部门" hint="先创建一个部门并添加成员">
          <Button variant="primary" onClick={() => ctx.app?.navigate('/departments/new')}>＋ 创建部门</Button>
        </EmptyState>
      )}

      {$.depts.length > 0 && (
        <div class="wf-stack wf-gap-sm">
          {$.depts.map((d: any) => (
            <Card key={d.id} clickable hover onClick={() => ctx.app?.navigate(`/chat/${d.id}`)}>
              <div class="wf-row wf-gap-sm">
                <Ava name={d.is_dm ? '💬' : '👥'} type={d.is_dm ? 'user' : 'knowledge_base'} />
                <div class="wf-fill">
                  <div class="wf-text-base wf-text-semibold">{d.name}</div>
                  <div class="wf-text-xs wf-text-tertiary wf-mt-xs">{d.member_count ?? 0} 位成员{d.company_name ? ` · ${d.company_name}` : ''}</div>
                </div>
                <span class="wf-text-tertiary">→</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
