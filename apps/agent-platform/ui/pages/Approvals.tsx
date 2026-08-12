import type { WfuiContext, Component } from 'weifuwu/ui-dom'
import { PageHeader, Ava, EmptyState, Loading } from '../components/ui'
import { Badge, Button, Card, Icon } from 'weifuwu/components'

/** 审批待办 — 管理员集中处理所有 AI 草稿（HITL 核心入口） */
export const Approvals: Component = async (_props, ctx) => {
  const $: Record<string, any> = {}
  const rerender = () => ctx.ui.render()
  $.items = []; $.loading = true; $.handling = ''

  function load() {
    ctx.api!.get('/api/messages/pending-approvals')
      .then((d: any) => { $.items = d.pending ?? []; $.loading = false; rerender() })
      .catch(() => { $.loading = false; rerender() })
  }
  load()

  async function decide(msgId: string, approved: boolean) {
    $.handling = msgId; rerender()
    try {
      await ctx.api!.post(`/api/messages/${msgId}/approve`, { approved })
      ctx.toast!(approved ? '已批准发布' : '已拒绝', approved ? 'success' : 'info')
      $.items = $.items.filter((m: any) => m.id !== msgId)
    } catch { ctx.toast!('操作失败', 'error') }
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

  return async (props) => (
    <div class="wf-container wf-stack wf-gap-lg wf-p-lg wf-mx-auto" style="--wf-max: 760px">
      <PageHeader title="审批待办" sub="AI 草稿需人工批准后才发布" />

      {$.loading && <Loading />}

      {!$.loading && $.items.length === 0 && (
        <EmptyState icon={<Icon name="check-circle" />} text="没有待审批的草稿" hint="开启 HITL 的 AI Agent 回复会先进入待批状态" />
      )}

      {$.items.length > 0 && (
        <div class="wf-stack wf-gap-sm">
          {$.items.map((m: any) => (
            <Card key={m.id} outlined>
              <div class="wf-row wf-gap-sm">
                <Ava name={m.agent_name ?? 'AI'} type={m.agent_type ?? 'ai'} small />
                <div class="wf-fill wf-stack wf-gap-none wf-shrink">
                  <div class="wf-row wf-gap-sm">
                    <span class="wf-text-base wf-text-semibold">{m.agent_name ?? 'AI'}</span>
                    <Badge variant="warning"><Icon name="clock" size={12} /> 待审批</Badge>
                  </div>
                  <span class="wf-text-xs wf-text-tertiary">
                    部门：{m.department_name ?? '未知'} · {fmtTime(m.created_at)}
                  </span>
                  <div class="wf-bg-tertiary wf-p-md wf-rounded wf-text-sm wf-mt-sm">{m.ai_draft}</div>
                </div>
              </div>
              <div class="wf-row wf-right wf-gap-sm wf-mt-sm">
                <Button size="sm" variant="ghost" onClick={() => ctx.app?.navigate(`/chat/${m.department_id}`)}>
                  <Icon name="message" size={12} /> 去聊天
                </Button>
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
