/**
 * 平台 UI 部件（组件入库后形态——W3）
 *
 * 分层说明（agent-platform 组件入库）：
 * - 通用组件全直引 weifuwu/components（PageHeader/EmptyState/Loading/
 *   ListScaffold/StatusDot/CronPicker——无平台转发层）
 * - 本文件仅剩**业务部件**（AGENT_TYPES 平台类型元数据绑定——非通用组件）：
 *   errMsg（ApiError 响应提取）· TYPE_META/TypeBadge/Ava（类型徽章/头像
 *   ——平台业务枚举面）
 * - StatusDot 已入库（weifuwu/components——W1）——页面改直引
 */
import type { UIContext } from 'weifuwu/vdom'
import { Badge, Avatar } from 'weifuwu/components'
import { AGENT_TYPES } from '../lib/types'

/** 从请求错误提取可读消息（ApiError.message 是响应体文本，可能含 {"error": ...} JSON） */
export function errMsg(e: unknown, fallback: string): string {
  if (e instanceof Error) {
    try {
      const j = JSON.parse((e as Error).message)
      if (j && j.error) return String(j.error)
    } catch { /* 非 JSON 错误消息 */ }
    return (e as Error).message
  }
  return fallback
}

/** 类型元数据（单源：ui/lib/types.ts AGENT_TYPES——AGENT-TYPES-OPTIMIZE W4） */
export const TYPE_META: Record<string, { label: string; icon: string; color: string }> =
  Object.fromEntries(AGENT_TYPES.map(t => [t.value, { label: t.label, icon: t.icon, color: t.color }]))

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
