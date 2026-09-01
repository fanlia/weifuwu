import type { UIContext, Component } from 'weifuwu/vdom'
import { PageHeader, Ava, EmptyState, Loading, errMsg } from '../components/ui'
import { Badge, Button, Card, Checkbox, Icon } from 'weifuwu/components'
import { canWrite, writeDenyReason } from '../lib/roles'
import type { PendingApproval } from '../lib/types'

interface ApprovalsState {
  items: PendingApproval[]; loading: boolean; handling: string
  editingId: string; editDraft: string
  /** CHAT-INTERACTION 延伸：批量批准选中集（空 = 无批量栏） */
  picked: string[]; bulkBusy: boolean
}

/** 审批待办 — 管理员集中处理所有 AI 草稿（HITL 核心入口） */
export const Approvals: Component = (_props, ctx) => {
  const $ = {} as ApprovalsState
  const rerender = () => ctx.render()
  $.items = []; $.loading = true; $.handling = ''
  $.picked = []; $.bulkBusy = false
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

  // CHAT-INTERACTION 延伸：批量批准（二次确认——批量动作不可逆；结果汇总 toast）
  async function bulkApprove() {
    if ($.picked.length === 0) { ctx.toast!('请先勾选草稿', 'warning'); return }
    const ok = await ctx.confirm!(`确定批量批准选中的 ${$.picked.length} 条草稿？批准后将正式发布`)
    if (!ok) return
    $.bulkBusy = true; rerender()
    try {
      const r = await ctx.api!.post<{ approved: number; failed: Array<{ id: string; error: string }> }>(
        '/api/messages/pending-approvals/bulk', { ids: $.picked })
      const denied = (r.failed ?? []).filter((f) => f.error.includes('管理员')).length
      const parts = [`已批准 ${r.approved} 条`]
      if (denied > 0) parts.push(`${denied} 条无权限（需部门管理员）`)
      if ((r.failed ?? []).length - denied > 0) parts.push(`${r.failed.length - denied} 条失败`)
      ctx.toast!(parts.join('，'), r.approved > 0 ? 'success' : 'error')
      // 成功的从列表移除；失败（无权限/已审批等）保留仍可逐条处理
      const failedIds = new Set((r.failed ?? []).map((f) => f.id))
      $.items = $.items.filter((m) => !$.picked.includes(m.id) || failedIds.has(m.id))
    } catch (e) { ctx.toast!(`批量批准失败：${errMsg(e, '请稍后重试')}`, 'error') }
    $.picked = []; $.bulkBusy = false; rerender()
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

      {/* CHAT-INTERACTION 延伸：批量批准栏（积压部门 66 条待审实证——逐条 66 次点击；
          仅批量批准——批量拒绝判负：拒绝清 ai_draft 不可逆） */}
      {!$.loading && $.items.length > 0 && (
        <div class="wf-row wf-gap-sm wf-items-center wf-padding-sm wf-radius-md" style="background: var(--wf-color-bg-secondary)">
          <Checkbox checked={$.picked.length === $.items.length && $.items.length > 0}
            onChange={() => { $.picked = $.picked.length === $.items.length ? [] : $.items.map((m) => m.id); rerender() }} />
          <span class="wf-font-xs wf-text-secondary">全选（{$.picked.length}/{$.items.length}）</span>
          <div class="wf-fill" />
          <Button size="sm" variant="primary" disabled={$.picked.length === 0 || $.bulkBusy} onClick={bulkApprove}>
            {$.bulkBusy ? '批量处理中...' : (<><Icon name="check" size={12} /> 批量批准选中（{$.picked.length}）</>)}
          </Button>
        </div>
      )}

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
                    <Checkbox checked={$.picked.includes(m.id)} onChange={() => {
                      $.picked = $.picked.includes(m.id) ? $.picked.filter((x: string) => x !== m.id) : [...$.picked, m.id]
                      rerender()
                    }} />
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
