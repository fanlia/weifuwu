import type { UIContext, Component } from 'weifuwu/vdom'
import { PageHeader, Ava, EmptyState, Loading, errMsg } from '../components/ui'
import { Badge, Button, Card, Icon } from 'weifuwu/components'
import { canWrite, writeDenyReason } from '../lib/roles'
import type { PendingApproval } from '../lib/types'

interface ApprovalsState {
  items: PendingApproval[]; loading: boolean; handling: string
  editingId: string; editDraft: string
}

/** 审批待办 — 管理员集中处理所有 AI 草稿（HITL 核心入口） */
export const Approvals: Component = (_props, ctx) => {
  const $ = {} as ApprovalsState
  const rerender = () => ctx.render()
  $.items = []; $.loading = true; $.handling = ''
  $.editingId = ''; $.editDraft = ''

  function startEdit(m: PendingApproval) {
    $.editingId = m.id; $.editDraft = String(m.ai_draft ?? '')
    rerender()
  }

  function saveDraft(m: PendingApproval) {
    const draft = $.editDraft.trim()
    if (!draft) return
    ctx.api!.put(`/api/messages/${m.id}/draft`, { draft })
      .then(() => { m.ai_draft = draft; $.editingId = ''; rerender() })
      .catch(() => { rerender() })
  }

  function load() {
    ctx.api!.get<{ pending: PendingApproval[] }>('/api/messages/pending-approvals')
      .then(d => { $.items = d.pending ?? []; $.loading = false; rerender() })
      .catch(() => { $.loading = false; rerender() })
  }
  load()

  async function decide(msgId: string, approved: boolean) {
    $.handling = msgId; rerender()
    try {
      await ctx.api!.post(`/api/messages/${msgId}/approve`, { approved })
      ctx.toast!(approved ? '已批准发布' : '已拒绝', approved ? 'success' : 'info')
      $.items = $.items.filter((m) => m.id !== msgId)
    } catch (e) { ctx.toast!(`操作失败：${errMsg(e, '请稍后重试')}`, 'error') }
    $.handling = ''; rerender()
  }

  function fmtTime(iso: string) {
    try {
      const d = new Date(iso)
      const diff = Date.now() - d.getTime()
      if (diff < 60000) return '刚刚'
      if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    } catch { return '' }
  }

  return (props) => (
    <div class="wf-container wf-stack wf-gap-lg wf-padding-lg wf-margin-x-auto" style="--wf-max: 760px">
      <PageHeader title="审批待办" sub="AI 草稿需人工批准后才发布" />

      {/* ROLES-OPTIMIZATION 波次 2：非 writer 页头提示条（审批需 requireDeptManager——
          member/viewer 进页即知权限边界，而非操作时 403） */}
      {!canWrite() && (
        <div class="wf-row wf-gap-sm wf-items-center wf-padding-sm wf-radius-md wf-text-tertiary wf-font-xs"
          style="background: var(--wf-color-bg-secondary)">
          <Icon name="lock" size={14} /> {writeDenyReason()}——审批需租户所有者或部门管理员
        </div>
      )}

      {$.loading && <Loading />}

      {!$.loading && $.items.length === 0 && (
        <EmptyState icon={<Icon name="check-circle" />} text="没有待审批的草稿" hint="开启 HITL 的 AI Agent 回复会先进入待批状态" />
      )}

      {$.items.length > 0 && (
        <div class="wf-stack wf-gap-sm">
          {$.items.map((m: PendingApproval) => (
            <Card key={m.id} outlined>
              <div class="wf-row wf-gap-sm">
                <Ava name={m.agent_name ?? 'AI'} type={m.agent_type ?? 'ai'} small />
                <div class="wf-fill wf-stack wf-gap-none wf-shrink">
                  <div class="wf-row wf-gap-sm">
                    <span class="wf-font-base wf-semibold">{m.agent_name ?? 'AI'}</span>
                    <Badge variant="warning"><Icon name="clock" size={12} /> 待审批</Badge>
                  </div>
                  <span class="wf-font-xs wf-text-tertiary">
                    部门：{m.department_name ?? '未知'} · {fmtTime(m.created_at ?? '')}
                  </span>
                  {$.editingId === m.id ? (
                    <textarea class="wf-input wf-margin-top-sm" rows={4} value={$.editDraft}
                      onInput={(e: any) => { $.editDraft = e.target.value; rerender() }} />
                  ) : (
                    <div class="wf-bg-tertiary wf-padding-md wf-radius wf-font-sm wf-margin-top-sm wf-pre-wrap">{m.ai_draft}</div>
                  )}
                </div>
              </div>
              <div class="wf-row wf-justify-end wf-gap-sm wf-margin-top-sm">
                  <span class="wf-font-xs wf-text-tertiary wf-self-center">
                    {/删除|清空|drop|移除/.test(String(m.ai_draft ?? '')) ? '⚠️ 高风险操作' : 'AI 草稿'}
                  </span>
                <Button size="sm" variant="ghost" onClick={() => ctx.app?.navigate(`/chat/${m.department_id}`)}>
                  <Icon name="message" size={12} /> 去聊天
                </Button>
                {$.editingId === m.id ? (
                  <Button size="sm" variant="secondary" onClick={() => saveDraft(m)}>保存修改</Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => startEdit(m)}><Icon name="edit" size={12} /> 编辑草稿</Button>
                )}
                <Button size="sm" variant="danger" disabled={$.handling === m.id} onClick={() => decide(m.id, false)}>
                  {$.handling === m.id ? '处理中...' : '拒绝'}
                </Button>
                <Button size="sm" variant="primary" disabled={$.handling === m.id} onClick={() => decide(m.id, true)}>
                  {$.handling === m.id ? '处理中...' : (<><Icon name="check" size={12} /> 批准</>)}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
