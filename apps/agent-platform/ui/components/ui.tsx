/**
 * 共享 UI 原语 — 全部基于 weifuwu/components，无自定义 CSS
 */

import type { WfuiContext } from 'weifuwu/client'
import { Avatar, Badge, EmptyState, Loading, PageHeader } from 'weifuwu/components'

export { PageHeader, EmptyState, Loading }
export type { PageHeaderProps, EmptyStateProps, LoadingProps } from 'weifuwu/components'

/** 类型元数据 */
export const TYPE_META: Record<string, { label: string; icon: string; color: string }> = {
  ai: { label: 'AI 机器人', icon: '🤖', color: '#8b5cf6' },
  webhook: { label: 'Webhook', icon: '🔗', color: '#f59e0b' },
  knowledge_base: { label: '知识库', icon: '📚', color: '#22c55e' },
  user: { label: '真实用户', icon: '👤', color: '#4f6ef7' },
}

/** 类型徽章 */
export function TypeBadge(_init: { type: string }, _ctx: WfuiContext) {
  return (props: { type: string }) => {
    const meta = TYPE_META[props.type] ?? { label: props.type, icon: '❓', color: '#64748b' }
    return <Badge variant={props.type === 'webhook' ? 'warning' : props.type === 'knowledge_base' ? 'success' : 'primary'}>{meta.icon} {meta.label}</Badge>
  }
}

/** 头像（按类型着色） */
export function Ava(_init: { name?: string; type?: string; small?: boolean }, _ctx: WfuiContext) {
  return (props: { name?: string; type?: string; small?: boolean }) => {
    const meta = TYPE_META[props.type ?? 'user']
    return <Avatar name={props.name} color={meta.color} size={props.small ? 'sm' : 'md'} />
  }
}

/** 状态点 + 文字 */
export function StatusDot(_init: { on?: boolean; label?: string }, _ctx: WfuiContext) {
  return (props: { on?: boolean; label?: string }) =>
    (
    <span class="wf-row wf-gap-xs wf-text-sm">
      <Badge dot variant={props.on ? 'success' : 'default'} />
      <span class={props.on ? 'wf-text-success' : 'wf-text-tertiary'}>{props.label ?? (props.on ? '运行中' : '已暂停')}</span>
    </span>
    )
}
