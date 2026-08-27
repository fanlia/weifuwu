import type { UIContext, Component } from 'weifuwu/vdom'
import { Alert, Button, Card, Checkbox, Field, Icon, Input } from 'weifuwu/components'
import { PageHeader, Loading, TypeBadge, errMsg } from '../components/ui'
import { inputValue } from '../lib/types'
import type { Agent, AgentListResponse } from '../lib/types'

interface NewDepartmentState {
  name: string; selected: string[]
  submitting: boolean; error: string
  agents: Agent[]; loading: boolean
}

export const NewDepartment: Component = async (_props, ctx) => {
  const $ = {} as NewDepartmentState
  const rerender = () => ctx.render()

  $.name = ''; $.selected = []; $.submitting = false; $.error = ''
  $.agents = []; $.loading = true
  ctx.api!.get<AgentListResponse>('/api/agents').then(d => d.agents ?? []).catch(() => [])
    .then(agents => { $.agents = agents; $.loading = false; rerender() })

  function toggle(id: string) {
    const set = new Set($.selected)
    if (set.has(id)) set.delete(id); else set.add(id)
    $.selected = [...set]
    rerender()
  }

  async function handleSubmit(e: Event) {
    e.preventDefault()
    if (!$.name.trim()) { $.error = '请输入部门名称'; rerender(); return }
    $.submitting = true; $.error = ''
    rerender()
    try {
      await ctx.api!.post('/api/departments', { name: $.name.trim(), member_ids: $.selected })
      ctx.app?.navigate('/departments')
    } catch (e) { $.error = errMsg(e, '创建失败'); $.submitting = false; rerender() }
  }
  return async (props) => (
    <div class="wf-container wf-stack wf-gap-lg wf-padding-lg wf-margin-x-auto" style="--wf-max: 720px">
      <a class="wf-font-sm wf-text-primary" onClick={() => ctx.app?.navigate('/departments')}>← 返回部门列表</a>
      <PageHeader title="创建部门" sub="在当前应用中创建群组并添加成员" />

      <div class="wf-margin-bottom-md">{$.error && <Alert variant="error">{$.error}</Alert>}</div>

      {$.loading && <Loading />}

      {!$.loading && (
        <Card>
          <form class="wf-stack wf-gap-md" onSubmit={handleSubmit}>
            <Field label="部门名称" required>
              <Input type="text" placeholder="如：技术部、市场部" value={$.name}
                onInput={(e: Event) => { $.name = inputValue(e); rerender() }} />
            </Field>

            <Field label={`添加成员（已选 ${$.selected.length} 个，可稍后添加）`}>
              <div class="wf-stack wf-gap-none">
                {$.agents.map((a: Agent) => (
                  <label key={a.id} class="wf-row wf-gap-sm wf-padding-y-sm wf-border-bottom" style="cursor: pointer">
                    <Checkbox checked={$.selected.includes(a.id)} onChange={() => toggle(a.id)} />
                    <span class="wf-font-base">{a.name}</span>
                    <TypeBadge type={a.type} />
                  </label>
                ))}
              </div>
            </Field>

            <div class="wf-justify-end wf-gap-sm">
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
