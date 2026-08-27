/**
 * 工作台（P0 重构——三层模型：部门 = 项目空间）
 *
 * 用户首屏 = 我的项目空间列表（而非报表）：
 * - 项目空间卡片：成员头像簇 / 最近活跃 / 环境状态点（用户语言）/ 最近消息摘要
 * - AI 协作动态：最近 AI 完成事项（跨项目）
 * - 空状态引导：建项目 → 加 AI → 放文件
 * 运营报表已拆至 /reports（管理组）
 */
import type { UIContext, Component } from 'weifuwu/vdom'
import { Button, Card, EmptyState, Icon, Skeleton } from 'weifuwu/components'
import { Ava } from '../components/ui'
import type { AgentListResponse, DepartmentListResponse, PendingApproval } from '../lib/types'

interface ProjectCard {
  id: string
  name: string
  is_dm: boolean
  member_count: number
  last_message: string | null
  last_message_at: string | null
  // 环境状态（/api/sandboxes 映射——用户语言）
  env: { status: string | null; label: string }
}

interface WorkspaceState {
  loading: boolean
  projects: ProjectCard[]
  pendingCount: number
  aiCount: number
  hasAgents: boolean
}

const ENV_LABEL: Record<string, string> = {
  running: 'AI 随时能干活',
  stopped: 'AI 休息中，干活时自动唤醒',
  requested: '环境待启动（首次干活自动创建）',
  error: '环境异常，请管理员处理',
  terminated: '',
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 9) return '早上好'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

function timeAgo(iso: string | null): string {
  if (!iso) return ''
  const t = new Date(iso).getTime()
  const diff = Date.now() - t
  if (diff < 60_000) return '刚刚'
  if (diff < 3600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86400_000) return `${Math.floor(diff / 3600_000)} 小时前`
  return new Date(iso).toLocaleDateString()
}

export const Workspace: Component = async (_props, ctx) => {
  const $ = {} as WorkspaceState
  const rerender = () => ctx.render()
  $.loading = true; $.projects = []; $.pendingCount = 0; $.aiCount = 0; $.hasAgents = false

  Promise.all([
    ctx.api!.get<DepartmentListResponse>('/api/departments').catch(() => ({ departments: [] })),
    ctx.api!.get<{ sandboxes: Array<{ department_id: string | null; status: string }> }>('/api/sandboxes').catch(() => ({ sandboxes: [] })),
    ctx.api!.get<{ pending: PendingApproval[] }>('/api/messages/pending-approvals').catch(() => ({ pending: [] })),
    ctx.api!.get<AgentListResponse>('/api/agents').catch(() => ({ agents: [] })),
  ]).then(([depts, sb, pend, agents]) => {
    const sbMap = new Map<string, string>()
    for (const s of sb.sandboxes ?? []) {
      if (s.department_id) sbMap.set(s.department_id, s.status)
    }
    $.projects = (depts.departments ?? []).map((d) => ({
      id: d.id,
      name: d.name,
      is_dm: !!d.is_dm,
      member_count: d.member_count ?? 0,
      last_message: d.last_message ?? null,
      last_message_at: d.last_message_at ?? null,
      env: { status: sbMap.get(d.id) ?? null, label: ENV_LABEL[sbMap.get(d.id) ?? ''] ?? '' },
    }))
    $.pendingCount = pend.pending?.length ?? 0
    $.aiCount = (agents.agents ?? []).filter((a) => a.type === 'ai').length
    $.hasAgents = (agents.agents ?? []).length > 0
    $.loading = false
    rerender()
  })

  return async () => {
    if ($.loading) {
      return (
        <div class="wf-stack wf-gap-lg">
          <div class="wf-stack wf-gap-xs">
            <Skeleton variant="text" width="200px" height="28px" />
            <Skeleton variant="text" width="340px" />
          </div>
          <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(min(100%, 300px), 1fr))">
            {[1, 2, 3].map(i => <Card key={i}><Skeleton variant="text" width="60%" /><Skeleton variant="text" width="90%" className="wf-mt-sm" /><Skeleton variant="text" width="45%" className="wf-mt-sm" /></Card>)}
          </div>
        </div>
      )
    }

    return (
    <div class="wf-stack wf-gap-lg">
      <div class="wf-row wf-between wf-gap-md wf-items-center">
        <div class="wf-stack wf-gap-xs">
          <h1 class="wf-text-2xl wf-m-0">{greeting()}，{((ctx.auth?.user ?? null) as { name?: string } | null)?.name ?? '用户'}</h1>
          <p class="wf-text-base wf-text-secondary wf-m-0">一个项目空间 = 一个共享工作目录 + 一个 AI 工作环境——放文件、@AI 干活、拿交付物。</p>
        </div>
        <Button variant="primary" onClick={() => ctx.app?.navigate('/departments/new')}><Icon name="plus" size={14} /> 新建项目空间</Button>
      </div>

      {/* 空状态引导（无项目空间） */}
      {$.projects.length === 0 && (
        <Card key="empty-guide">
          <EmptyState icon="🚀" text="还没有项目空间" hint="三步开始：创建项目空间 → 添加 AI 能力 → 上传资料让 AI 干活">
            <div class="wf-row wf-gap-sm">
              <Button variant="primary" onClick={() => ctx.app?.navigate('/departments/new')}>创建项目空间</Button>
              {!$.hasAgents && <Button variant="ghost" onClick={() => ctx.app?.navigate('/agents/new')}>先创建 AI Agent</Button>}
            </div>
          </EmptyState>
        </Card>
      )}

      {/* 审批待办（快捷入口） */}
      {$.pendingCount > 0 && (
        <Card key="pending-card" clickable hover onClick={() => ctx.app?.navigate('/approvals')} style={{ borderColor: 'var(--wf-color-warning)' }}>
          <div class="wf-row wf-gap-sm wf-items-center">
            <Icon name="check-circle" size={16} className="wf-text-warning" />
            <span class="wf-text-sm wf-text-medium">有 {$.pendingCount} 条 AI 草稿待你批准发布</span>
            <span class="wf-fill" />
            <Icon name="arrow-right" size={14} className="wf-text-tertiary" />
          </div>
        </Card>
      )}

      {/* 项目空间卡片 */}
      {$.projects.length > 0 && (
        <>
          <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary">我的项目空间（{$.projects.length}）</div>
          <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(min(100%, 300px), 1fr))">
            {$.projects.map((p) => (
              <Card key={p.id} clickable hover onClick={() => ctx.app?.navigate(`/chat/${p.id}`)}>
                <div class="wf-row wf-gap-sm wf-items-center">
                  <Ava name={p.is_dm ? '💬' : '👥'} type={p.is_dm ? 'user' : 'knowledge_base'} />
                  <div class="wf-fill wf-truncate wf-text-base wf-text-semibold">{p.name}</div>
                  {p.is_dm && <span class="wf-text-xs wf-text-tertiary">单聊</span>}
                </div>
                <div class="wf-text-sm wf-text-secondary wf-truncate wf-mt-sm">{p.last_message || '暂无消息——@AI 成员开始干活'}</div>
                <div class="wf-row wf-gap-md wf-text-xs wf-text-tertiary wf-mt-sm">
                  <span>{p.member_count} 位成员</span>
                  {p.last_message_at && <span>{timeAgo(p.last_message_at)}活跃</span>}
                  <span class="wf-fill" />
                  {p.env.label && (
                    <span class="wf-row wf-gap-xs wf-items-center">
                      <span class={`wf-dot ${p.env.status === 'running' ? 'wf-dot--ok' : p.env.status === 'error' ? 'wf-dot--err' : 'wf-dot--idle'}`} style="display:inline-block;width:8px;height:8px;border-radius:50%" />
                      {p.env.label}
                    </span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* 快捷操作 */}
      <div class="wf-text-sm wf-text-semibold wf-uppercase wf-tracking-wide wf-text-secondary">快捷操作</div>
      <div class="wf-grid" style="--wf-cols: repeat(auto-fill, minmax(220px, 1fr))">
        <Card clickable hover onClick={() => ctx.app?.navigate('/agents/new')}>
          <div class="wf-text-2xl wf-mb-xs"><Icon name="cpu" size={28} /></div>
          <div class="wf-text-base wf-text-semibold">添加 AI 能力</div>
          <div class="wf-text-sm wf-text-secondary">创建 AI 机器人，加入项目空间</div>
        </Card>
        <Card clickable hover onClick={() => ctx.app?.navigate('/departments/new')}>
          <div class="wf-text-2xl wf-mb-xs"><Icon name="users" size={28} /></div>
          <div class="wf-text-base wf-text-semibold">创建项目空间</div>
          <div class="wf-text-sm wf-text-secondary">共享工作目录 + AI 工作环境</div>
        </Card>
        <Card clickable hover onClick={() => ctx.app?.navigate('/reports')}>
          <div class="wf-text-2xl wf-mb-xs"><Icon name="bar-chart" size={28} /></div>
          <div class="wf-text-base wf-text-semibold">运营报表</div>
          <div class="wf-text-sm wf-text-secondary">使用量 · 成本 · 活跃度</div>
        </Card>
      </div>
    </div>
    )
  }
}
