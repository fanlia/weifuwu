import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { Ava, Loading, TypeBadge } from '../components/ui'
import { Badge, Button, Card, Checkbox, EmptyState, Icon } from 'weifuwu/components'
import type { Agent, AgentListResponse, Department, Member } from '../lib/types'

interface DepartmentDetailState {
  dept: Department | null
  members: Member[]
  loading: boolean
  notFound: boolean
  showMemberPicker: boolean
  allAgents: Agent[]
  picked: string[]
  managing: boolean
}

export const DepartmentDetail: Component = async (_props, ctx) => {
  const $ = {} as DepartmentDetailState
  const rerender = () => ctx.ui.render()
  const deptId = ctx.route?.params?.id ?? ''

  $.dept = null; $.members = []; $.loading = true; $.notFound = false
  $.showMemberPicker = false; $.allAgents = []; $.picked = []; $.managing = false

    function loadDept() {
      ctx.api!.get<{ department?: Department; members?: Member[] }>(`/api/departments/${deptId}`)
        .then(data => {
          const d = data.department ?? null
          if (!d?.id) { $.notFound = true; $.loading = false; rerender(); return }
          $.dept = d
          $.members = data.members ?? []
          $.loading = false
          rerender()
        }).catch(() => { $.loading = false; rerender() })
    }
    loadDept()

    async function openMemberPicker() {
      $.showMemberPicker = true; $.picked = []; rerender()
      ctx.api!.get<AgentListResponse>('/api/agents').then(d => {
        const all = d.agents ?? []
        const inIds = new Set($.members.map((m) => m.id))
        $.allAgents = all.filter((a) => !inIds.has(a.id) && a.type !== 'user')
        rerender()
      }).catch(() => { ctx.toast!('加载 Agent 列表失败', 'error') })
    }

    async function addMembers() {
      if ($.picked.length === 0) { ctx.toast!('请选择成员', 'warning'); return }
      $.managing = true; rerender()
      try {
        for (const id of $.picked) {
          await ctx.api!.post(`/api/departments/${deptId}/members`, { agent_id: id })
        }
        ctx.toast!('已添加成员', 'success')
        $.showMemberPicker = false; $.picked = []; $.managing = false
        loadDept()
      } catch { $.managing = false; ctx.toast!('添加失败', 'error'); rerender() }
    }

    async function removeMember(m: Member) {
      const ok = await ctx.confirm!(`确定将 ${m.name} 移出部门？`)
      if (!ok) return
      try {
        await ctx.api!.delete(`/api/departments/${deptId}/members/${m.id}`)
        ctx.toast!('已移除', 'success')
        loadDept()
      } catch { ctx.toast!('移除失败', 'error') }
    }

  return async (props) => {
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
        <div class="wf-row wf-gap-sm wf-mb-sm">
          <div class="wf-fill wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary">成员列表</div>
          <Button size="sm" onClick={openMemberPicker}><Icon name="plus" size={14} /> 添加成员</Button>
        </div>
        {$.showMemberPicker && (
          <div class="wf-bg-tertiary wf-p-md wf-rounded wf-mb-md">
            <div class="wf-text-sm wf-text-semibold wf-mb-sm">选择要添加的 Agent（{$.picked.length} 个）</div>
            {$.allAgents.length === 0 && <div class="wf-text-sm wf-text-tertiary">没有可添加的 Agent——先创建 AI 机器人 / Webhook / 知识库</div>}
            <div class="wf-stack wf-gap-none">
              {$.allAgents.map((a: Agent) => (
                <label key={a.id} class="wf-row wf-gap-sm wf-py-sm" style="cursor: pointer">
                  <Checkbox checked={$.picked.includes(a.id)} onChange={() => {
                    $.picked = $.picked.includes(a.id) ? $.picked.filter((x: string) => x !== a.id) : [...$.picked, a.id]
                    rerender()
                  }} />
                  <span class="wf-text-base">{a.name}</span>
                  <TypeBadge type={a.type} />
                </label>
              ))}
            </div>
            <div class="wf-right wf-gap-sm wf-mt-sm">
              <Button size="sm" variant="ghost" onClick={() => { $.showMemberPicker = false; rerender() }}>取消</Button>
              <Button size="sm" variant="primary" disabled={$.managing || $.picked.length === 0} onClick={addMembers}>
                {$.managing ? '添加中...' : `添加 ${$.picked.length} 个成员`}
              </Button>
            </div>
          </div>
        )}
        {$.members.map((m: Member) => (
          <div key={m.id} class="wf-row wf-gap-sm wf-py-sm wf-border-b">
            <Ava name={m.name} type={m.type ?? 'user'} small />
            <div class="wf-fill wf-stack wf-gap-none">
              <span class="wf-text-base">{m.name}</span>
              <span class="wf-text-xs wf-text-tertiary">{m.role === 'admin' ? '管理员' : '成员'}</span>
            </div>
            <TypeBadge type={m.type ?? "user"} />
            {m.role !== 'admin' && (
              <Button size="sm" variant="ghost" title="移除" onClick={() => removeMember(m)}><Icon name="trash" size={14} /></Button>
            )}
          </div>
        ))}
        {$.members.length === 0 && (
          <div class="wf-py-lg"><EmptyState text="暂无成员" hint="点击右上角添加成员"><Button size="sm" onClick={openMemberPicker}>＋ 添加成员</Button></EmptyState></div>
        )}
      </Card>
    </div>
    )
  }
}
