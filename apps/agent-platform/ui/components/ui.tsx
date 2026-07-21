/**
 * 共享 UI 原语 — PageHeader / TypeBadge / Ava / EmptyState / Loading
 */

import type { WfuiContext } from 'weifuwu/client'

/** 类型元数据 */
export const TYPE_META: Record<string, { label: string; icon: string }> = {
  ai: { label: 'AI 机器人', icon: '🤖' },
  webhook: { label: 'Webhook', icon: '🔗' },
  knowledge_base: { label: '知识库', icon: '📚' },
  user: { label: '真实用户', icon: '👤' },
}

/** 类型徽章 */
export function TypeBadge(props: { type: string }, _ctx: WfuiContext) {
  const meta = TYPE_META[props.type] ?? { label: props.type, icon: '❓' }
  return <span class={`badge badge-${props.type}`}>{meta.icon} {meta.label}</span>
}

/** 头像（按类型着色） */
export function Ava(props: { name?: string; type?: string; small?: boolean }, _ctx: WfuiContext) {
  const ch = (props.name ?? '?').trim()[0]?.toUpperCase() ?? '?'
  const cls = `ava ava-${props.type ?? 'user'}${props.small ? ' ava-sm' : ''}`
  return <div class={cls}>{ch}</div>
}

/** 页头 */
export function PageHeader(props: { title: string; sub?: string; children?: any }, _ctx: WfuiContext) {
  return (
    <div class="page-head">
      <div>
        <div class="page-title">{props.title}</div>
        {props.sub && <div class="page-sub">{props.sub}</div>}
      </div>
      {props.children && <div class="page-actions">{props.children}</div>}
    </div>
  )
}

/** 空状态 */
export function EmptyState(props: { icon: string; text: string; hint?: string; children?: any }, _ctx: WfuiContext) {
  return (
    <div class="empty">
      <div class="empty-ico">{props.icon}</div>
      <div class="empty-txt">{props.text}</div>
      {props.hint && <div class="empty-hint">{props.hint}</div>}
      {props.children && <div class="mt-16">{props.children}</div>}
    </div>
  )
}

/** 加载态 */
export function Loading(_props: {}, _ctx: WfuiContext) {
  return <div class="loading-wrap"><div class="spinner"></div>加载中...</div>
}

/** 状态点 */
export function StatusDot(props: { on?: boolean; label?: string }, _ctx: WfuiContext) {
  return (
    <span class="item-meta">
      <span class={`dot ${props.on ? 'dot-on' : 'dot-off'}`}></span>
      {props.label ?? (props.on ? '运行中' : '已暂停')}
    </span>
  )
}
