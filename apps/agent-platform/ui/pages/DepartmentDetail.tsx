import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { Ava, Loading, TypeBadge, StatusDot } from '../components/ui'
import { Badge, Button, Card, Checkbox, EmptyState, Icon } from 'weifuwu/components'
import type { Agent, AgentListResponse, Department, Member } from '../lib/types'
import { FilesSection } from '../components/agent/FilesSection.tsx'

interface DepartmentDetailState {
  dept: Department | null
  members: Member[]
  loading: boolean
  notFound: boolean
  showMemberPicker: boolean
  allAgents: Agent[]
  picked: string[]
  managing: boolean
  // 沙盒状态（三层模型：部门 = 计算资源归属）
  sandbox: any | null
  sbBusy: string
}

export const DepartmentDetail: Component = async (_props, ctx) => {
  const $ = {} as DepartmentDetailState
  const rerender = () => ctx.ui.render()
  const deptId = ctx.route?.params?.id ?? ''

  $.dept = null; $.members = []; $.loading = true; $.notFound = false
  $.showMemberPicker = false; $.allAgents = []; $.picked = []; $.managing = false
  $.sandbox = null; $.sbBusy = ''

  // 部门沙盒状态（群聊——单聊无工作目录/沙盒）
  const loadSandbox = () => {
    void ctx.api!.get<any>(`/api/sandboxes?department_id=${deptId}`).then((d) => {
      $.sandbox = d.sandboxes?.[0] ?? null
      rerender()
    }).catch(() => {})
  }
  const sbAction = async (action: string) => {
    if (!$.sandbox) return
    const ok = action === 'terminate' ? await ctx.confirm!('确定终止该沙盒？容器将删除（工作目录文件保留）') : true
    if (!ok) return
    $.sbBusy = action; rerender()
    try {
      const r = await ctx.api!.post(`/api/sandboxes/${$.sandbox.id}/${action}`)
      if (r.ok || r.success) ctx.toast!('操作成功', 'success')
      else ctx.toast!((r as any).error ?? '操作失败', 'error')
    } catch (e: any) { ctx.toast!(e?.message ?? '操作失败', 'error') }
    $.sbBusy = ''; loadSandbox(); rerender()
  }

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
              当前应用 · {$.members.length} 位成员
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
              <span class="wf-text-base">{m.name}{m.role_label ? <span class="wf-text-xs wf-text-tertiary wf-ml-sm">· {m.role_label}</span> : null}{m.expertise ? <span class="wf-text-xs wf-text-tertiary wf-ml-sm">— {m.expertise}</span> : null}</span>
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

      {/* 三层模型：部门 = 工作目录——单聊也是部门特例，同样有工作空间 */}
      <FilesSection departmentId={deptId} />

      {/* 三层模型：sandbox = 计算资源——部门沙盒状态与操作（单聊同样适用） */}
      <Card id="sec-sandbox">
          <div class="wf-row wf-gap-sm wf-mb-sm">
            <div class="wf-fill wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary"><Icon name="box" size={14} /> 沙盒（计算环境）</div>
            <Button size="sm" variant="ghost" onClick={loadSandbox}><Icon name="refresh" size={13} /> 刷新</Button>
          </div>
          {$.sandbox ? (
            <div class="wf-stack wf-gap-sm">
              <div class="wf-row wf-gap-sm wf-items-center">
                <StatusDot on={$.sandbox.status === 'running' || $.sandbox.status === 'requested'} />
                <span class="wf-text-sm wf-text-medium">
                  {$.sandbox.status === 'running' ? '运行中' : $.sandbox.status === 'stopped' ? '已停止' : $.sandbox.status === 'requested' ? '待启动（首次工具调用时自动启动）' : $.sandbox.status === 'error' ? '错误' : '已终止'}
                </span>
                <span class="wf-text-xs wf-text-tertiary">镜像 {$.sandbox.image} · 内存 {$.sandbox.memory_mb}MB · {$.sandbox.cpus} CPU · 网络 {$.sandbox.network ? '开' : '关'}</span>
              </div>
              {$.sandbox.error && <div class="wf-text-xs wf-text-danger">错误：{$.sandbox.error}</div>}
              {$.sandbox.containerStatus && <div class="wf-text-xs wf-text-tertiary">容器：{$.sandbox.containerStatus}</div>}
              <div class="wf-row wf-gap-xs">
                {$.sandbox.status === 'running' ? (
                  <>
                    <Button size="sm" variant="ghost" disabled={!!$.sbBusy} onClick={() => sbAction('stop')}>停止</Button>
                    <Button size="sm" variant="ghost" disabled={!!$.sbBusy} onClick={() => sbAction('restart')}>重启</Button>
                  </>
                ) : $.sandbox.status !== 'terminated' ? (
                  <Button size="sm" variant="primary" disabled={!!$.sbBusy} onClick={() => sbAction('start')}>启动</Button>
                ) : null}
                {$.sandbox.status !== 'terminated' && (
                  <Button size="sm" variant="danger-ghost" disabled={!!$.sbBusy} onClick={() => sbAction('terminate')}>终止</Button>
                )}
              </div>
            </div>
          ) : (
            <div class="wf-text-sm wf-text-tertiary">
              部门内 Agent 首次使用文件/命令工具时自动创建（惰性）；
              之后该部门所有 Agent 的工具都在此环境中执行（共享目录 + 共享依赖）。
            </div>
          )}
        </Card>
    </div>
    )
  }
}
