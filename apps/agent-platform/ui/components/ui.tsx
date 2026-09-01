/**
 * 共享 UI 原语 — 全部基于 weifuwu/components，无自定义 CSS
 */

import type { UIContext } from 'weifuwu/vdom'
import { Avatar, Badge, EmptyState, Loading, PageHeader } from 'weifuwu/components'

export { PageHeader, EmptyState, Loading }
export type { PageHeaderProps, EmptyStateProps, LoadingProps } from 'weifuwu/components'

/** 从请求错误提取可读消息（ApiError.message 是响应体文本，可能含 {"error": ...} JSON） */
export function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) {
    try {
      const j = JSON.parse(e.message)
      if (j && j.error) return String(j.error)
    } catch { /* 非 JSON 错误消息 */ }
    return e.message
  }
  return fallback
}

/** 类型元数据 */
export const TYPE_META: Record<string, { label: string; icon: string; color: string }> = {
  ai: { label: 'AI 机器人', icon: '🤖', color: '#8b5cf6' },
  webhook: { label: 'Webhook', icon: '🔗', color: '#f59e0b' },
  knowledge_base: { label: '知识库', icon: '📚', color: '#22c55e' },
  user: { label: '真实用户', icon: '👤', color: '#4f6ef7' },
  department: { label: '部门经理', icon: '🏢', color: '#0ea5e9' },
}

/** 类型徽章 */
export function TypeBadge(_init: { type: string }, _ctx: UIContext) {
  return (props: { type: string }) => {
    const meta = TYPE_META[props.type] ?? { label: props.type, icon: '❓', color: '#64748b' }
    return <Badge variant={props.type === 'webhook' ? 'warning' : props.type === 'knowledge_base' ? 'success' : 'primary'}>{meta.icon} {meta.label}</Badge>
  }
}

/** 头像（按类型着色） */
export function Ava(_init: { name?: string; type?: string; small?: boolean }, _ctx: UIContext) {
  return (props: { name?: string; type?: string; small?: boolean }) => {
    const meta = TYPE_META[props.type ?? 'user']
    return <Avatar name={props.name} color={meta.color} size={props.small ? 'sm' : 'md'} />
  }
}

/** 状态点（颜色语义）——UX-PLAN-2 波次 1：一个状态一个声音。
 *  旧实现自带默认文案「运行中/已暂停」——调用方（沙盒/部门详情）不传 label
 *  时与自己的状态标签撞车 → 卡片同时显示「● 运行中 待启动」双标签（实证）。
 *  新契约：**label 缺省只渲染点**（文字是调用方职责）；tone 覆盖点/文字色
 *  （success 绿=健康运行 / warning 黄=降级 / error 红=故障 / default 灰=非活跃）。
 *  on 仍是主开关（true→success，false→default）——tone 仅在需要非绿非灰时传。 */
export function StatusDot(_init: { on?: boolean; label?: string; tone?: 'success' | 'warning' | 'error' | 'default' }, _ctx: UIContext) {
  return (props: { on?: boolean; label?: string; tone?: 'success' | 'warning' | 'error' | 'default' }) => {
    const on = props.on ?? false
    const tone = props.tone ?? (on ? 'success' : 'default')
    const textClass = tone === 'success' ? 'wf-text-success'
      : tone === 'error' ? 'wf-text-error'
      : tone === 'warning' ? 'wf-text-warning'
      : 'wf-text-tertiary'
    return (
    <span class="wf-row wf-gap-xs wf-font-sm">
      <Badge dot variant={tone} />
      {props.label != null && <span class={textClass}>{props.label}</span>}
    </span>
    )
  }
}
