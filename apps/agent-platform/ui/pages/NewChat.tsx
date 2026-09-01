import type { UIContext, Component } from 'weifuwu/vdom'
import { PageHeader, Ava, EmptyState, Loading } from '../components/ui'
import { Button, Card, Icon } from 'weifuwu/components'
import type { Department, DepartmentListResponse } from '../lib/types'

interface NewChatState {
  depts: Department[]; loading: boolean
}

/** 会话预览去 Markdown 符号（列表摘要要纯文本——视觉噪音） */
function plainPreview(src: string): string {
  return String(src ?? '')
    .replace(/```[\s\S]*?```/g, ' [代码] ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export const NewChat: Component = (_props, ctx) => {
  const $ = {} as NewChatState
  const rerender = () => ctx.render()

  $.depts = []; $.loading = true
  ctx.api!.get<DepartmentListResponse>('/api/departments')
    .then(d => { $.depts = d.departments ?? []; $.loading = false; rerender() })
    .catch(() => { $.loading = false; rerender() })

  function fmtTime(iso: string | null | undefined) {
    if (!iso) return ''
    try {
      const d = new Date(iso)
      const diff = Date.now() - d.getTime()
      if (diff < 60000) return '刚刚'
      if (diff < 3600000) return `${Math.floor(diff / 60000)} 分钟前`
      if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小时前`
      return d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
    } catch { return '' }
  }

  return (props) => (
    <div class="wf-container wf-stack wf-gap-lg wf-padding-lg wf-margin-x-auto" style="--wf-max: 720px">
      <PageHeader title="会话" sub="最近对话，点击进入" />

      {$.loading && <Loading />}

      {!$.loading && $.depts.length === 0 && (
        <EmptyState icon={<Icon name="message" />} text="还没有会话" hint="在 Agent 列表点「单聊」立即开始，或创建部门群聊">
          <Button variant="primary" onClick={() => ctx.app?.navigate('/agents')}>去 Agent 列表单聊</Button>
          <Button variant="ghost" onClick={() => ctx.app?.navigate('/departments/new')}>＋ 创建部门</Button>
        </EmptyState>
      )}

      {$.depts.length > 0 && (
        <div class="wf-stack wf-gap-sm">
          {$.depts.map((d: Department) => {
            // UX-PLAN-2 波次 2：单 AI 待命间（0 人类成员）——点击直达成员管理
            // （加入后才能开聊——旧路径进聊天发消息没人应是有坑的第一步）
            const standby = (d.human_count ?? 0) === 0
            return (
            <Card key={d.id} clickable hover onClick={() => ctx.app?.navigate(standby ? `/departments/${d.id}` : `/chat/${d.id}`)}>
              <div class="wf-row wf-gap-sm">
                <Ava name={d.is_dm ? '💬' : '👥'} type={d.is_dm ? 'user' : 'knowledge_base'} />
                <div class="wf-fill wf-stack wf-gap-none wf-shrink">
                  <div class="wf-row wf-gap-sm">
                    <span class="wf-font-base wf-semibold wf-truncate">{d.name}</span>
                    {(d.member_count ?? 0) > 0 && <span class="wf-font-xs wf-text-tertiary">{standby ? `${d.member_count} AI` : `${d.member_count} 人`}</span>}
                  </div>
                  <div class="wf-font-sm wf-text-secondary wf-truncate">
                    {d.last_message ? plainPreview(d.last_message)
                      : /* UX-PLAN-2 波次 2：单 AI 待命间——引导加人（对的第一步）而非发消息 */
                        (d.human_count ?? 0) === 0 ? 'AI 待命间 · 加入后开聊'
                        : (d.member_count ?? 0) > 0 ? '暂无消息，发一条试试' : '还没有成员'}
                  </div>
                </div>
                <div class="wf-stack wf-gap-none wf-items-end wf-shrink">
                  <span class="wf-font-xs wf-text-tertiary">{fmtTime(d.last_message_at)}</span>
                  <span class="wf-text-tertiary">→</span>
                </div>
              </div>
            </Card>
            )
          })}
          <div class="wf-justify-end">
            <Button variant="ghost" onClick={() => ctx.app?.navigate('/departments')}>查看全部部门 →</Button>
          </div>
        </div>
      )}
    </div>
  )
}
