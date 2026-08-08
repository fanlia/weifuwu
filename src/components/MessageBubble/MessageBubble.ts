/**
 * weifuwu/components — MessageBubble
 *
 * 独立消息气泡（从 AiChat 气泡层抽取，业务聊天页复用）。
 * 复用 layout 的 wf-bubble 原语：user → --own，assistant → --ai。
 * content 支持文本或任意 VNode（可与 Markdown 组合）。
 * 裁剪：不做打字指示动画（Loading 已有）。
 */

import type { Component } from '../../client/vnode.ts'
import type { WfuiContext } from '../../client/types.ts'
import { h } from '../../client/vnode.ts'

export type MessageBubbleRole = 'user' | 'assistant'
export type MessageBubbleStatus = 'complete' | 'streaming' | 'error'

export interface MessageBubbleProps {
  content: any
  role: MessageBubbleRole
  status?: MessageBubbleStatus
  /** 气泡尾部操作区（重试/复制按钮等，VNode 或数组） */
  actions?: any
  className?: string
}

export const MessageBubble: Component<MessageBubbleProps> = (_init, _ctx) =>
  (props) => {
    const { content, role, status = 'complete', actions, className } = props

    const roleClass = role === 'user' ? 'wf-bubble--own' : 'wf-bubble--ai'
    const statusClass = status === 'error'
      ? ' wf-bubble--error'
      : status === 'streaming'
        ? ' wf-bubble--streaming'
        : ''

    const body = actions
      ? h('div', { class: 'wf-bubble-body' }, [
          h('div', { class: 'wf-bubble-text' }, content),
          h('div', { class: 'wf-bubble-actions' }, actions),
        ])
      : content

    return h('div', {
      class: `wf-bubble ${roleClass}${statusClass}${className ? ` ${className}` : ''}`,
      role: status === 'error' ? 'alert' : undefined,
    }, body)
  }
