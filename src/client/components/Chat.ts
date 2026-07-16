/**
 * Chat — 消息聊天组件
 *
 * 与 weifuwu 后端 messager + agent 模块对接。
 *
 * ```ts
 * import { Chat } from 'weifuwu/client'
 *
 * function ChatPage(_, ctx) {
 *   return Chat({ conversationId: '123' }, ctx)
 * }
 * ```
 */

import { signal, effect } from '../signal.ts'
import { jsx, Show, For } from '../jsx-runtime.ts'
import type { WfuiContext } from '../types.ts'

const h = (tag: string, props: any, ...children: any[]) => jsx(tag, props ?? {}, ...children)

interface ChatMessage {
  id: string
  sender_id: string
  sender_name?: string
  body: string
  created_at: string
}

export function Chat({ conversationId }: { conversationId: string }, ctx: WfuiContext) {
  const messages = signal<ChatMessage[]>([])
  const input = signal('')
  const loading = signal(true)
  const isEmpty = signal(false)

  // 加载消息
  ctx.api.get(`/api/conversations/${conversationId}/messages`).then((msgs: any) => {
    messages.value = Array.isArray(msgs) ? msgs.reverse() : []
    loading.value = false
    isEmpty.value = messages.value.length === 0
  }).catch(() => {
    loading.value = false
    isEmpty.value = true
  })

  // WebSocket 实时消息
  const unsub = ctx.ws.onMessage((data: any) => {
    if (data.conversation_id === conversationId) {
      messages.value = [...messages.value, data]
      isEmpty.value = false
    }
  })

  const send = () => {
    const text = input.value.trim()
    if (!text) return
    input.value = ''
    ctx.api.post('/api/messages', { conversationId, body: text }).catch(() => {})
  }

  return h('div', { class: 'wefu-chat' },
    // 消息列表
    h('div', { class: 'wefu-chat-messages' },
      Show({ when: loading, children: h('div', { class: 'wefu-chat-loading' }, '加载中...') }),
      Show({ when: isEmpty, children: h('div', { class: 'wefu-chat-empty' }, '暂无消息') }),
      h('div', { class: 'wefu-chat-list' },
        For({ each: messages.value, children: (msg: ChatMessage) =>
          h('div', { class: `wefu-chat-msg ${msg.sender_id === ctx.user?.id ? 'mine' : ''}` },
            h('div', { class: 'wefu-chat-msg-header' },
              h('span', { class: 'wefu-chat-msg-sender' }, msg.sender_name ?? ''),
              h('span', { class: 'wefu-chat-msg-time' }, new Date(msg.created_at).toLocaleTimeString()),
            ),
            h('div', { class: 'wefu-chat-msg-body' }, msg.body),
          )
        }),
      ),
    ),

    // 输入区
    h('div', { class: 'wefu-chat-input' },
      h('input', {
        value: input,
        onInput: (e: any) => input.value = e.target.value,
        onKeyDown: (e: any) => { if (e.key === 'Enter') send() },
        placeholder: '输入消息...',
      }),
      h('button', { class: 'wefu-btn', onClick: send }, '发送'),
    ),
  )
}
