import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { PageHeader, Loading, TypeBadge, errMsg } from '../components/ui'
import { Alert, Button, Card, Checkbox, EmptyState, Field, Input, Select } from 'weifuwu/components'

export const NewDepartment: Component = async (_props, ctx) => {
  const $ = ctx.ui.$()
  const token = ctx.auth?.token

    $.name = ''; $.companyId = ''; $.selected = []; $.submitting = false; $.error = ''
    $.companies = []; $.agents = []; $.loading = true
    Promise.all([
      ctx.api!.get<{ companies: any[] }>('/api/companies').then(d => d.companies ?? []).catch(() => []),
      ctx.api!.get<{ agents: any[] }>('/api/agents').then(d => d.agents ?? []).catch(() => []),
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
      await ctx.api!.post('/api/departments', { company_id: cid, name: $.name.trim(), member_ids: $.selected })
      ctx.app?.navigate('/departments')
    } catch (e) { $.error = errMsg(e, '创建失败'); $.submitting = false }
  }
  return (props) => (
    <div class="wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto" style="--wf-max: 720px">
      <a class="wf-text-sm wf-text-brand" onClick={() => ctx.app?.navigate('/departments')}>← 返回部门列表</a>
      <PageHeader title="创建部门" sub="选择公司并添加成员" />

      <div class="wf-mb-md">{$.error && <Alert variant="error">{$.error}</Alert>}</div>

      {$.loading && <Loading />}

      {!$.loading && $.companies.length === 0 && (
        <EmptyState icon="🏢" text="还没有公司" hint="部门必须挂在公司下，请先在 API 中创建公司" />
      )}

      {!$.loading && $.companies.length > 0 && (
        <Card>
          <form class="wf-stack wf-gap-md" onSubmit={handleSubmit}>
            <Field label="部门名称" required>
              <Input type="text" placeholder="如：技术部、市场部" value={$.name}
                onInput={(e: any) => { $.name = e.target.value }} />
            </Field>

            <Field label="所属公司">
              <Select value={$.companyId} onChange={(v) => { $.companyId = v as string }}
                options={$.companies.map((c: any) => ({ value: c.id, label: c.name }))} />
            </Field>

            <Field label={`添加成员（已选 ${$.selected.length} 个，可稍后添加）`}>
              <div class="wf-stack wf-gap-none">
                {$.agents.map((a: any) => (
                  <label key={a.id} class="wf-row wf-gap-sm wf-py-sm wf-border-b" style="cursor: pointer">
                    <Checkbox checked={$.selected.includes(a.id)} onChange={() => toggle(a.id)} />
                    <span class="wf-text-base">{a.name}</span>
                    <TypeBadge type={a.type} />
                  </label>
                ))}
              </div>
            </Field>

            <div class="wf-right wf-gap-sm">
              <Button type="button" variant="ghost" onClick={() => ctx.app?.navigate('/departments')}>取消</Button>
              <Button type="submit" variant="primary" disabled={$.submitting}>
                {$.submitting ? '创建中...' : '创建部门'}
              </Button>
            </div>
          </form>
        </Card>
      )}
    </div>
  )
}
